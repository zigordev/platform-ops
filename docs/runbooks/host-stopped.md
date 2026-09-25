# Host stopped or impaired

**Alarm:** `platform-ops-prod-host-status` (CloudWatch, not Prometheus)

## What fired

The prod EC2 host either failed an EC2 status check for five consecutive
minutes, or stopped publishing status checks altogether for five consecutive
minutes. The second case is the common one: **a stopped instance publishes no
metrics at all**, so the alarm treats missing data as breaching and reads the
silence itself as the signal.

So one alarm, three situations:

| What happened                             | What CloudWatch saw            |
| ----------------------------------------- | ------------------------------ |
| Instance stopped, terminated or shut down | no datapoints                  |
| Hardware, network or power fault under it | `StatusCheckFailed_System` 1   |
| Kernel panic, full disk, exhausted memory | `StatusCheckFailed_Instance` 1 |

The alarm watches `StatusCheckFailed`, which is 1 when either half is failing.
Which half it was is a question for `describe-instance-status`, below.

This alarm exists because nothing on the host can report the host's own death.
Prometheus, Alertmanager, Grafana, Loki, Tempo and node-exporter are all
containers on this one instance. When it goes they go with it: Grafana shows an
empty graph rather than `down`, and Alertmanager sends nothing because
Alertmanager is part of what died. CloudWatch is not on the host, which is the
entire point of it.

The matching `OK` mail means the host is publishing passing status checks
again. It is not a promise that the applications are back — see **What to do**.

## Whether it matters

Yes, unless you stopped it.

Every public site is served from this host, every database is on it, and
OpenBao is on it. A stopped host is a total outage of the estate: Cloudflare
answers 522, and every deploy fails at its SSM step with `InvalidInstanceId`.

The one boring case is a **deliberate stop**: the `Power` workflow, or the
scheduled power window in `docs/power.md`. CloudWatch cannot tell intent from
accident — it only sees the metrics stop — so a deliberate stop raises this
alarm exactly like an accidental one. If the scheduled window is enabled,
expect one `ALARM` mail a few minutes after the nightly stop and one `OK` mail
a few minutes after the morning start, every day. That is the alarm working,
not the alarm being wrong, and it is the price of having one signal that cannot
be talked out of firing. `docs/power.md` has the one-liner to mute it during a
planned stop.

An ops deploy does **not** trip this. `scripts/prod-deploy-remote.sh` runs over
SSM and restarts containers; it never stops or reboots the instance, so the
status checks never miss a beat. Nor does a plain OS reboot: five consecutive
failing minutes is longer than an Amazon Linux 2023 reboot takes.

## How to see

```bash
export AWS_PROFILE=platform-ops
export AWS_REGION=eu-west-1
```

Is it running at all, and who stopped it?

```bash
aws ec2 describe-instances \
  --instance-ids "$(terraform -chdir=infra/terraform/aws-compose output -raw instance_id)" \
  --query 'Reservations[].Instances[].[State.Name,StateReason.Code,StateTransitionReason]' \
  --output text
```

`Client.UserInitiatedShutdown` means a human or the scheduler asked for it.
Anything else did not.

If it is running, which status check is failing?

```bash
aws ec2 describe-instance-status \
  --instance-ids "$(terraform -chdir=infra/terraform/aws-compose output -raw instance_id)" \
  --query 'InstanceStatuses[].[InstanceStatus.Status,SystemStatus.Status,Events]'
```

`SystemStatus` impaired is AWS's problem under you. `InstanceStatus` impaired
is the OS's problem inside you. `Events` names a scheduled retirement or
maintenance window if one is the cause.

What the alarm itself has been doing:

```bash
aws cloudwatch describe-alarm-history \
  --alarm-name platform-ops-prod-host-status --max-records 10 \
  --query 'AlarmHistoryItems[].[Timestamp,HistorySummary]' --output text
```

## What to do

1. **It was deliberate.** Nothing to do. If the window did it, the `OK` mail
   arrives on its own at the morning start.

2. **It stopped and nobody asked.** Start it and find out why:

   ```bash
   gh workflow run Power --repo zigordev/platform-ops -f action=on
   ```

   Then read `StateTransitionReason` above. An out-of-credit account, an AWS
   scheduled retirement and a guest-OS shutdown all look the same from
   Grafana and different from here.

3. **`SystemStatus` is impaired.** The fault is under the instance, and a
   restart is the documented remedy: a **stop then start** moves it to new
   hardware, whereas a reboot keeps it on the same failing host. Termination
   protection is on, and stop/start preserves the root volume, the Elastic IP
   and the instance id — see `docs/power.md`.

4. **`InstanceStatus` is impaired.** The OS is wedged. Check disk and memory
   first — [host-disk.md](host-disk.md) and [host-memory.md](host-memory.md)
   cover both, and a full disk has taken this estate down twice. An SSM session
   is the way in; if the SSM agent does not answer either, stop and start it.

5. **Whatever it was, check the applications came back.** This alarm watches
   the host, not the estate. Once the `OK` mail arrives, Prometheus and
   Alertmanager are the signal again for everything above the host, and the
   uptime probe answers "do the public endpoints serve" from outside. Expect
   three to five minutes of containers restarting after a boot, which is
   normal and documented in `docs/power.md`.

## If this alarm ever goes quiet

An alarm that cannot mail is the failure it exists to prevent, and it has three
silent modes worth knowing:

- **The SNS subscription was never confirmed.** AWS emails a confirmation link
  when the subscription is created and Terraform cannot click it. Until
  somebody does, the alarm changes state and tells nobody:

  ```bash
  aws sns list-subscriptions-by-topic \
    --topic-arn "$(terraform -chdir=infra/terraform/aws-compose output -json host_alarm | jq -r .topic_arn)" \
    --query 'Subscriptions[].[Endpoint,SubscriptionArn]' --output text
  ```

  `PendingConfirmation` in place of an ARN means it is not delivering.

- **`host_alarm_email` is empty.** The topic and the alarm are created either
  way, so the alarm's state history is still correct and still readable in the
  console — it simply has no subscriber. `terraform output host_alarm` says
  which of the two it is.

- **Somebody muted it for a planned stop and never unmuted it.** `docs/power.md`
  has the two commands. The alarm keeps changing state while muted, so the
  history above still shows the truth and only the mail is missing:

  ```bash
  aws cloudwatch describe-alarms --alarm-names platform-ops-prod-host-status \
    --query 'MetricAlarms[].[StateValue,ActionsEnabled]' --output text
  ```

  `False` in the second column is a muted alarm. The resource does not set
  `actions_enabled`, so a `terraform apply` puts it back to `True` on its own.
