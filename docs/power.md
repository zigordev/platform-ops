# Power (platform-ops)

Production is a single EC2 host. Switching it off means stopping that instance and nothing else: the root volume, every Docker named volume on it, the Elastic IP, the instance id and the private IP all survive a stop. DNS keeps pointing at the same address and the GitHub deploy variables stay valid.

Compute is the only cost that stops. The volume, the public IPv4 address, the KMS key and the ECR images keep billing, roughly $13 a month at the time of writing. Every hour the host is off saves the t3.large hourly rate.

## Manual switch

The `Power` workflow in `.github/workflows/power.yml` takes one input, `action`, which is `status`, `on` or `off`.

From the GitHub UI: Actions, Power, Run workflow.

From a terminal:

```bash
gh workflow run Power --repo zigordev/platform-ops -f action=off
```

```bash
gh workflow run Power --repo zigordev/platform-ops -f action=on
```

`on` returns once the instance runs, the SSM agent answers and the public health endpoints answer 200. `off` returns once the instance is stopped. `status` prints the instance state and what the public endpoints currently answer.

The workflow shares the `deploy-aws-prod` concurrency group with the ops deploy, so it never stops the host in the middle of an ops deploy.

## Scheduled window

Two EventBridge Scheduler rules, defined in `infra/terraform/aws-compose/main.tf`, stop and start the host on a fixed window. They call EC2 directly, with no Lambda in between, and retry for up to an hour if the call fails.

The window lives in `infra/terraform/aws-compose/environments/prod.tfvars`:

```hcl
power_schedule_enabled  = true
power_schedule_timezone = "Europe/Madrid"
power_off_schedule      = "cron(0 1 * * ? *)"
power_on_schedule       = "cron(0 8 * * ? *)"
```

The cron fields are minutes, hours, day of month, month, day of week and year, and one of day of month or day of week must be `?`. The timezone is an IANA name, and daylight saving is handled by the scheduler. A weekday-only window:

```hcl
power_off_schedule = "cron(0 1 ? * MON-FRI *)"
power_on_schedule  = "cron(0 8 ? * MON-FRI *)"
```

Apply the change with:

```bash
terraform -chdir=infra/terraform/aws-compose apply -var-file=environments/prod.tfvars
```

Set `power_schedule_enabled = false` and apply again to pause the window without removing it. The manual switch and the schedule do not conflict: both act on the same instance state, and whichever runs later wins.

### The alarm follows the same window

Two more schedules sit in the same group and mute the CloudWatch alarm `platform-ops-prod-host-status` while the window has the host off:

| Schedule                              | Runs at              | Calls                 |
| ------------------------------------- | -------------------- | --------------------- |
| `platform-ops-prod-power-off`         | `power_off_schedule` | `ec2:StopInstances`   |
| `platform-ops-prod-host-alarm-mute`   | `power_off_schedule` | `DisableAlarmActions` |
| `platform-ops-prod-power-on`          | `power_on_schedule`  | `ec2:StartInstances`  |
| `platform-ops-prod-host-alarm-unmute` | `power_on_schedule`  | `EnableAlarmActions`  |

They read the same three variables as the power cycle, so the window exists in one place and changing it moves the alarm with the host. There is no second copy to keep in step.

The mute schedule follows `power_schedule_enabled`. The un-mute schedule does not: it stays enabled whatever the flag says, because it is the only thing that can turn the mail back on, and a switch that can only be thrown one way is how an alarm ends up silent for good. With the window off it still fires at `power_on_schedule` and re-enables actions that are already enabled, which costs nothing and bounds how long any mute — the schedule's or a human's — can last.

Terraform no longer corrects `actions_enabled`; the resource ignores changes to it, because the schedules own it between applies. An `apply` will not un-mute the alarm for you any more.

## What to expect when the host comes back

Docker starts on boot and every container carries `restart: unless-stopped`, so the whole estate restarts on its own. OpenBao unseals itself through KMS. Applications retry their dependencies for about ninety seconds and are restarted by Docker if they give up, so the first few minutes show containers restarting; that is normal. Expect three to five minutes until every public endpoint answers.

The `ServiceDown` alerts for the five trading-bot scrape jobs fire on every boot, exactly as they do after every ops deploy, because those targets do not exist yet. Prometheus, Loki and Tempo show a gap for the off hours.

## While the host is off

- The public sites do not answer. Behind Cloudflare that is a 522 page; without it, a connection timeout.
- Every deploy fails at the SSM step, because the instance is not there to receive the command. Power the host on, then re-run the deploy. This applies to the ops deploy and to the four product deploys.
- The CloudWatch alarm `platform-ops-prod-host-status` still goes to `ALARM` about five minutes after the host stops, and back to `OK` about two minutes after it starts. It cannot tell a deliberate stop from an accidental one — a stopped instance publishes no metrics, and the absence is the only thing the alarm has to go on — so with the window enabled it is muted while the host is deliberately off and mails nothing then. The one exception is a mute that arrives late: the mute call retries for up to an hour, and the alarm needs only about five minutes of missing datapoints, so a first attempt that errors can let one `ALARM` mail out before the mute lands. It is self-correcting and it silences the rest of the night.

  **It does not hold the page for later.** CloudWatch mails on a state change, and while the actions are off that change is discarded, not queued. Un-muting does not deliver the news of what happened while it was muted. So a host that dies just after the window closes, or a scheduled start that fails when it opens, produces no mail at all: the uptime probe is the only thing that reports either, and it works in hours. Read the window as switching the alarm off, not as deferring it.

  Expect an `OK` mail most mornings: the un-mute lands as the window opens while the alarm is still in `ALARM` from the night, and the first passing status check a couple of minutes later is a real `OK` transition with the actions on. It is harmless and it is a free proof that the SNS path still delivers. It is not a heartbeat — on a morning when the host is quick or the un-mute is slow, no mail arrives and nothing is wrong.

  To silence a stop taken outside the window:

  ```bash
  aws cloudwatch disable-alarm-actions --alarm-names platform-ops-prod-host-status
  ```

  ```bash
  aws cloudwatch enable-alarm-actions --alarm-names platform-ops-prod-host-status
  ```

  A `terraform apply` no longer un-mutes it. The un-mute schedule does, at the next `power_on_schedule` tick — which on a weekday-only window can be a whole weekend away — and that tick is also when the uptime probe starts reporting the stopped host — so for a deliberate stop that outlives the window, mute it again or expect an uptime issue. [host-stopped.md](runbooks/host-stopped.md) has the rest.

- The uptime probe reads the instance state before probing and skips a run while the host is stopped on purpose. It decides what "on purpose" means by reading the alarm's `ActionsEnabled`, not by trusting `Client.UserInitiatedShutdown`: a start that failed when the window opened leaves the same stop reason behind as the deliberate stop that closed it, and only the mute flag tells them apart. A host stopped while the alarm is armed opens the uptime issue. A host that is stopped for any other reason, or terminated, opens it as before. The probe also gives a freshly started host ten minutes before judging it. This needs the repository variables `AWS_PROBE_ROLE_ARN` (the `github_probe_role_arn` Terraform output) and `AWS_REGION`; without them the probe behaves as before and opens its issue while the host is off.

## Do not

- Do not `docker stop` containers before stopping the instance. A container stopped by hand does not come back on boot under `unless-stopped`. Let the OS shutdown stop them.
- Do not terminate the instance. Termination deletes the root volume and with it every database. API termination protection is on, so the console and the CLI refuse it until someone turns that off deliberately.
