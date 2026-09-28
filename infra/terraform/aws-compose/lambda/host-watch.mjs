const RUNNING = 'running';
const NOT_FOUND = 'missing';

export function decide(observation) {
  const { actionsEnabled, instanceState } = observation;

  if (typeof actionsEnabled !== 'boolean') {
    throw new Error(
      `host alarm ActionsEnabled read as ${JSON.stringify(actionsEnabled)}, which is not a boolean`
    );
  }

  if (typeof instanceState !== 'string' || instanceState.trim() === '') {
    throw new Error(
      `instance state read as ${JSON.stringify(instanceState)}, which is not a state name`
    );
  }

  const running = instanceState === RUNNING;

  return {
    shouldBeUp: actionsEnabled,
    running,
    value: actionsEnabled && !running ? 1 : 0,
  };
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set on the function`);
  return value;
}

function log(level, fields) {
  const record = {
    service: process.env.OTEL_SERVICE_NAME?.trim() || 'host-watch',
    ...fields,
  };
  if (level === 'error') console.error(record);
  else console.info(record);
}

export async function handler() {
  const alarmName = required('HOST_ALARM_NAME');
  const instanceId = required('INSTANCE_ID');
  const namespace = required('METRIC_NAMESPACE');
  const metricName = required('METRIC_NAME');

  const [cloudwatchSdk, ec2Sdk] = await Promise.all([
    import('@aws-sdk/client-cloudwatch'),
    import('@aws-sdk/client-ec2'),
  ]);

  const cloudwatch = new cloudwatchSdk.CloudWatchClient({});
  const ec2 = new ec2Sdk.EC2Client({});

  try {
    const [alarms, instances] = await Promise.all([
      cloudwatch.send(
        new cloudwatchSdk.DescribeAlarmsCommand({
          AlarmNames: [alarmName],
          AlarmTypes: ['MetricAlarm'],
        })
      ),
      ec2.send(
        new ec2Sdk.DescribeInstancesCommand({
          Filters: [{ Name: 'instance-id', Values: [instanceId] }],
        })
      ),
    ]);

    const instanceState = instances.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? NOT_FOUND;
    const verdict = decide({
      actionsEnabled: alarms.MetricAlarms?.[0]?.ActionsEnabled,
      instanceState,
    });

    await cloudwatch.send(
      new cloudwatchSdk.PutMetricDataCommand({
        Namespace: namespace,
        MetricData: [
          {
            MetricName: metricName,
            Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
            Value: verdict.value,
            Unit: 'Count',
            Timestamp: new Date(),
          },
        ],
      })
    );

    log(verdict.value === 1 ? 'error' : 'info', {
      message:
        verdict.value === 1
          ? 'the host should be running right now and it is not'
          : 'the host state matches what the power window asks for',
      alarm: alarmName,
      instance_id: instanceId,
      instance_state: instanceState,
      should_be_up: verdict.shouldBeUp,
      metric: `${namespace} ${metricName}`,
      value: verdict.value,
    });

    return verdict;
  } catch (error) {
    log('error', {
      message: 'host-watch could not answer; it publishes nothing and the alarm reads the silence',
      alarm: alarmName,
      instance_id: instanceId,
      error: { name: error.name, message: error.message },
    });
    throw error;
  }
}
