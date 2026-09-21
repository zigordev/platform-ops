import { FOLDERS } from './folders.ts';
import { layout, PROMETHEUS, type Dashboard, type DashboardSpec, type Variable } from './model.ts';

export const SCHEMA_VERSION = 39;

export const RUNBOOKS = 'https://github.com/zigordev/platform-ops/tree/main/docs/runbooks';

export const RATE_INTERVAL = '$__rate_interval';

export function deploys(selector = ''): string {
  return `max by (job, version) (service_build_info${selector}) unless on (job, version) deploy:version_seen:max3d`;
}

export function jobVariable(metric: string, label: string): Variable {
  const query = `label_values(${metric}, job)`;
  return {
    name: 'job',
    label,
    type: 'query',
    datasource: PROMETHEUS,
    definition: query,
    query: { qryType: 1, query, refId: 'PrometheusVariableQueryEditor-VariableQuery' },
    refresh: 2,
    sort: 1,
    includeAll: false,
    multi: false,
    options: [],
    current: {},
    hide: 0,
    skipUrlSync: false,
  };
}

function folderLinks(): Record<string, unknown>[] {
  return FOLDERS.map((folder) => ({
    type: 'dashboards',
    title: folder.name,
    tags: [folder.uid],
    asDropdown: true,
    includeVars: false,
    keepTime: true,
    icon: 'external link',
    targetBlank: false,
    tooltip: '',
    url: '',
  }));
}

export function build(spec: DashboardSpec): Dashboard {
  return {
    uid: spec.uid,
    title: spec.title,
    description: spec.description,
    tags: [spec.folder.uid, ...(spec.tags ?? [])],
    timezone: 'browser',
    editable: false,
    graphTooltip: 1,
    fiscalYearStartMonth: 0,
    liveNow: false,
    weekStart: '',
    time: spec.time ?? { from: 'now-6h', to: 'now' },
    timepicker: {},
    refresh: spec.refresh ?? '1m',
    schemaVersion: SCHEMA_VERSION,
    version: 1,
    annotations: {
      list: [
        {
          builtIn: 1,
          datasource: { type: 'grafana', uid: '-- Grafana --' },
          enable: true,
          hide: true,
          iconColor: 'rgba(0, 211, 255, 1)',
          name: 'Annotations & Alerts',
          type: 'dashboard',
        },
        {
          name: 'Deploys',
          datasource: PROMETHEUS,
          enable: true,
          hide: false,
          iconColor: 'purple',
          target: { refId: 'Anno', expr: spec.deploys, interval: '1m' },
          titleFormat: 'Deploy · {{job}} {{version}}',
          textFormat: '',
          tagKeys: 'job,version',
          useValueForTime: false,
        },
      ],
    },
    templating: { list: spec.variables ?? [] },
    links: [
      ...folderLinks(),
      {
        type: 'link',
        title: 'Runbooks',
        url: RUNBOOKS,
        targetBlank: true,
        icon: 'doc',
        tags: [],
        asDropdown: false,
        includeVars: false,
        keepTime: false,
        tooltip: '',
      },
    ],
    panels: layout(spec.rows),
  };
}
