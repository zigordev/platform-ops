# Host stopped or impaired

**Alarms:** `platform-ops-prod-host-status` and
`platform-ops-prod-host-not-running` (CloudWatch, not Prometheus)

Two alarms share this runbook. They ask different questions, and the second
exists only because the first cannot answer its own.

| Alarm                                | The question                               | What it is            |
| ------------------------------------ | ------------------------------------------ | --------------------- |
| `platform-ops-prod-host-status`      | did the host just break?                   | a transition detector |
| `platform-ops-prod-host-not-running` | is the host absent when it should be here? | a state detector      |

A CloudWatch alarm mails on a **change of state**, never on a state, and that is
the whole difference between them. `host-status` sees the host fail and tells
you. It cannot see that the host has been failing since before it was allowed to
speak: a host that breaks after the power window closes goes to `ALARM` while
muted, the mail is discarded rather than queued, and when the window opens there
is no change left to send. A scheduled start that never happens is the same
story with nothing moving at all.

`host-not-running` reads the state instead of waiting for a change, so a fault
that has been true all weekend is still true on the first tick after the window
opens. Read the first as "it broke just now" and the second as "it is not here
and it should be".

## What fired: `platform-ops-prod-host-status`

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

## What fired: `platform-ops-prod-host-not-running`

`platform-ops-prod-host-watch` is a Lambda on a five-minute schedule. Every tick
it asks two questions and nothing else:

1. Does `platform-ops-prod-host-status` have `ActionsEnabled`? That flag is the
   estate's single answer to "should the host be up right now". The power
   schedules set it, the uptime probe reads it, and you can set it by hand for a
   planned stop.
2. Is the instance `running`?

Yes and no publishes `1` to the custom metric `HostStoppedWhenItShouldRun` in
the `platform-ops/prod` namespace. Every other combination publishes `0`,
including every possible state while the window is closed. Three consecutive
`1`s — fifteen minutes — raise this alarm.

So it fires for one thing: **the host is not running during hours it is meant to
serve.** `stopped`, `stopping`, `pending`, `terminated` and "no instance with
that id" all count, because none of them is `running`. Fifteen minutes is long
enough for the morning's `pending` and the boot behind it to pass through
without a word.

**It also fires when the poller itself stops answering.** The alarm treats
missing data as breaching, so fifteen minutes with nothing published reads the
same as fifteen minutes of trouble. That is deliberate, and it is the only part
of the estate that watches its own watcher: a checker nobody checks is the
failure this repository keeps finding. The mail cannot say which of the two it
is. One command under **How to see** can.

This alarm is never muted. The power schedules do not touch it, and Terraform
does not ignore its `actions_enabled` the way it does the other one's, so an
`apply` will restore it if somebody silences it by hand. It does not need a mute
because the poller already knows about the window and publishes `0` outside it —
the hours are still written down in exactly one place. Nothing it sends is
routine either: it has no equivalent of the morning `OK` mail, so any mail from
it is news.

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

`platform-ops-prod-host-not-running` is the cover for all of that, and it is the
reason it exists. It reads the state rather than waiting for a change, so a host
that has been stopped since the window closed is reported about fifteen minutes
after the window opens again, and a start that never happened is reported on the
same clock. `uptime-probe.yml` sits behind it at GitHub's cron speed — hours,
not minutes — reading the same `ActionsEnabled` to decide whether a stopped host
is deliberate.

One case is still nobody's: a host that starts on time and comes up **impaired**
after a window already spent in `ALARM`. `host-status` has no transition left to
send, and the poller sees `running` and is satisfied — it answers "is it here",
not "is it well". The probe covers it, because an impaired host does not serve,
and it covers it in hours. Closing it properly would mean the poller mailing
about every in-window fault the status alarm has already mailed about: a second
mail for every incident, to catch one that has not happened here yet.

Between the window closing and it opening again the poller is silent too, by the
same design — it is asking the same window. The estate's only alerting in those
hours is still the probe.

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

What either alarm has been doing:

```bash
aws cloudwatch describe-alarm-history \
  --alarm-name platform-ops-prod-host-status --max-records 10 \
  --query 'AlarmHistoryItems[].[Timestamp,HistorySummary]' --output text
```

If the mail named `platform-ops-prod-host-not-running`, find out which of its two
meanings you have — an absent host, or a poller that has gone quiet:

```bash
aws logs tail /aws/lambda/platform-ops-prod-host-watch --since 30m --format short
```

Every tick writes one JSON record carrying `should_be_up`, `instance_state` and
`value`. Records with `"value": 1` are an absent host, and `instance_state` says
what it is instead. **No records at all** are a poller that is not running, and
the alarm is then telling you about itself. The alarm agrees from the other
side — a state reason naming missing datapoints is the poller, not the host.
`False` in the second column is this alarm muted by hand: nothing schedules that
and nothing else undoes it, so the next `terraform apply` is what restores it:

```bash
aws cloudwatch describe-alarms --alarm-names platform-ops-prod-host-not-running \
  --query 'MetricAlarms[].[StateValue,ActionsEnabled,StateReason]' --output text
```

```bash
aws scheduler get-schedule --group-name platform-ops-prod-power \
  --name platform-ops-prod-host-watch \
  --query '[State,ScheduleExpression]' --output text
```

## What to do

Start by reading which alarm mailed. A `platform-ops-prod-host-not-running` mail
that turns out to be a silent poller is not an outage: fix the schedule, the
function or its IAM policy, and know that until you do, the estate has no state
detector and a fault that begins outside the window will not be reported at all.
A `platform-ops-prod-host-not-running` mail with `"value": 1` in the log is the
same incident as below, found a different way — carry on from step 2.

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

## If these alarms ever go quiet

An alarm that cannot mail is the failure it exists to prevent, and this pair has
four silent modes worth knowing. The first two take both alarms with them: they
share one SNS topic and one subscription.

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

- **`host-status` is muted.** Either the power window closed it, or somebody ran
  the mute by hand for a planned stop. The alarm keeps changing state while
  muted, so the history above still shows the truth and only the mail is
  missing. `host-not-running` is not muted with it and never is — but it reads
  that same flag as its question, so it publishes `0` and is just as quiet. One
  switch silences both observers on purpose:

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
  be the same one that leaves the alarm muted. Everything downstream then agrees
  with it: the poller reads the same `ActionsEnabled` and publishes `0`, the
  probe reads it, calls the stop deliberate and skips, and all three observers
  are quiet together. That is the price of writing the window down once, and it
  is why `platform-ops-prod-host-alarm-unmute` is never disabled. If a whole
  working day passes with no `OK` mail and no uptime issue, check the group
  above before believing the silence.

- **The poller stopped and its alarm was already `ALARM`.** `host-not-running`
  mails on its own change of state like any other alarm, so a poller that dies
  while the alarm is already raised adds no second mail. The log tail above is
  the check; an alarm sitting in `ALARM` for longer than an incident should last
  is the tell.
