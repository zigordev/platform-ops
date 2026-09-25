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
accident — it only sees the metrics stop — so the window tells it instead. Two
EventBridge schedules, driven by the same `power_off_schedule` and
`power_on_schedule` as the power cycle, disable this alarm's actions when the
window closes and enable them when it opens.

So if this mail reached you, the window was almost certainly open and the host
should have been running. That is the point of the mute. The two exceptions
worth knowing: the window may be switched off entirely
(`power_schedule_enabled = false`), in which case the alarm mails around the
clock and a deliberate stop mails like any other; and the mute call retries for
up to an hour, so a first attempt that errors can let one `ALARM` mail out
before it lands. Check `terraform output host_alarm` and the alarm history
below before treating a mail during a known stop as an incident.

You will also see an `OK` mail most mornings, a couple of minutes after the
window opens. The un-mute lands while the alarm is still in `ALARM` from the
night, and the host's first passing status check is a real recovery transition.
Nothing is wrong. Nothing is wrong on a morning it does not arrive either — it
depends on which of the two lands first, so do not read it as a heartbeat.

### What the mute costs

**A muted alarm discards the page, it does not defer it.** CloudWatch sends on a
state change. If the host dies shortly after the window closes, the alarm goes
to `ALARM` in silence, stays there until the window opens again, and the un-mute
finds it already in `ALARM` — no state change, no mail, ever. The same is true
of a scheduled start that fails: the instance has been `stopped` with
`Client.UserInitiatedShutdown` since the window closed, so nothing changes when
it opens and this alarm says nothing. A host that starts but comes up impaired
is the same story — `StatusCheckFailed` is `1`, which is still breaching, so
there is still no transition to send.

`uptime-probe.yml` is the cover for both. It reads this alarm's
`ActionsEnabled` to decide whether a stopped host is deliberate, so once the
window opens it treats a stopped host as a failure and opens the uptime issue.
It works at GitHub's cron speed — hours, not minutes. Between the window
closing and it opening again, the estate's only alerting is that probe.

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

1. **It was deliberate.** A stop you took yourself inside the window, with the
   `Power` workflow. Nothing to do, and the `OK` mail arrives on its own when
   you start it again. The scheduled window normally does not reach you this way
   at all, because it mutes the alarm as it stops the host; a mail that lands
   within a few minutes of the window closing is the mute having been retried,
   and the rest of the night is silent as intended.

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

- **It is muted.** Either the power window closed it, or somebody ran the mute
  by hand for a planned stop. The alarm keeps changing state while muted, so the
  history above still shows the truth and only the mail is missing:

  ```bash
  aws cloudwatch describe-alarms --alarm-names platform-ops-prod-host-status \
    --query 'MetricAlarms[].[StateValue,ActionsEnabled]' --output text
  ```

  `False` in the second column is a muted alarm. `terraform apply` will not fix
  that any more — the resource ignores changes to `actions_enabled`, because the
  schedules own it. `platform-ops-prod-host-alarm-unmute` re-enables it at the
  next `power_on_schedule` tick whether or not the window is enabled, so a mute
  cannot last for good; to end one now:

  ```bash
  aws cloudwatch enable-alarm-actions --alarm-names platform-ops-prod-host-status
  ```

  Check both schedules are where they should be if the mute looks stuck:

  ```bash
  aws scheduler get-schedule --group-name platform-ops-prod-power \
    --name platform-ops-prod-host-alarm-unmute \
    --query '[State,ScheduleExpression,ScheduleExpressionTimezone]' --output text
  ```

- **The un-mute never ran.** It shares a schedule group and an execution role
  with the scheduled start, so the failure that stops the host coming back can
  be the same one that leaves the alarm muted. The probe then reads
  `ActionsEnabled` as `False`, calls the stop deliberate and skips, and neither
  observer says anything. If a whole working day passes with no `OK` mail and no
  uptime issue, check the group above before believing the silence.
