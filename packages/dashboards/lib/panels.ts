import { LOKI, PROMETHEUS, TEMPO, type PanelSpec, type Query } from './model.ts';

export type Step = { value: number | null; color: string };

export type FieldOptions = {
  unit?: string;
  min?: number;
  max?: number;
  decimals?: number;
  steps?: Step[];
  lines?: boolean;
  mappings?: Record<string, unknown>[];
  overrides?: Record<string, unknown>[];
};

export type Size = { w: number; h: number };

export function under(limit: number): Step[] {
  return [
    { color: 'green', value: null },
    { color: 'red', value: limit },
  ];
}

export function atLeast(limit: number): Step[] {
  return [
    { color: 'red', value: null },
    { color: 'green', value: limit },
  ];
}

export function valueMap(entries: Record<string, [string, string]>): Record<string, unknown>[] {
  const options: Record<string, unknown> = {};
  Object.entries(entries).forEach(([value, [text, color]], index) => {
    options[value] = { text, color, index };
  });
  return [{ type: 'value', options }];
}

function fieldConfig(options: FieldOptions, custom: Record<string, unknown>): Record<string, unknown> {
  return {
    defaults: {
      ...(options.unit ? { unit: options.unit } : {}),
      ...(options.min !== undefined ? { min: options.min } : {}),
      ...(options.max !== undefined ? { max: options.max } : {}),
      ...(options.decimals !== undefined ? { decimals: options.decimals } : {}),
      color: { mode: options.steps ? 'thresholds' : 'palette-classic' },
      custom,
      mappings: options.mappings ?? [],
      thresholds: { mode: 'absolute', steps: options.steps ?? [{ color: 'green', value: null }] },
    },
    overrides: options.overrides ?? [],
  };
}

function datasourceOf(queries: Query[]): Query['datasource'] {
  return queries[0]?.datasource ?? PROMETHEUS;
}

function atThisInstant(queries: Query[]): Query[] {
  return queries.map((query) =>
    query.datasource.type === 'prometheus' ? { ...query, range: false, instant: true, exemplar: false } : query
  );
}

export function timeseries(
  title: string,
  description: string,
  size: Size,
  queries: Query[],
  options: FieldOptions & { stack?: boolean; bars?: boolean } = {}
): PanelSpec {
  const { steps, lines, ...rest } = options;
  const config = fieldConfig({ ...rest, ...(lines ? { steps } : {}) }, {
    drawStyle: options.bars ? 'bars' : 'line',
    lineWidth: 1,
    fillOpacity: options.stack || options.bars ? 60 : 10,
    showPoints: 'never',
    spanNulls: false,
    stacking: { mode: options.stack ? 'normal' : 'none', group: 'A' },
    thresholdsStyle: { mode: lines ? 'line' : 'off' },
  }) as { defaults: { color: Record<string, unknown> } };
  config.defaults.color = { mode: 'palette-classic' };
  return {
    type: 'timeseries',
    title,
    description,
    ...size,
    datasource: datasourceOf(queries),
    queries,
    fieldConfig: config,
    options: {
      legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
      tooltip: { mode: 'multi', sort: 'desc' },
    },
  };
}

export function stat(
  title: string,
  description: string,
  size: Size,
  queries: Query[],
  options: FieldOptions & { text?: 'auto' | 'value' | 'name' | 'value_and_name'; field?: string } = {}
): PanelSpec {
  return {
    type: 'stat',
    title,
    description,
    ...size,
    datasource: datasourceOf(queries),
    queries: atThisInstant(queries),
    fieldConfig: fieldConfig(options, {}),
    options: {
      reduceOptions: { calcs: ['lastNotNull'], fields: options.field ?? '', values: false },
      colorMode: 'value',
      graphMode: 'none',
      textMode: options.text ?? 'auto',
      orientation: 'auto',
      justifyMode: 'auto',
      wideLayout: true,
      showPercentChange: false,
    },
  };
}

export function gauge(title: string, description: string, size: Size, queries: Query[], options: FieldOptions = {}): PanelSpec {
  return {
    type: 'gauge',
    title,
    description,
    ...size,
    datasource: datasourceOf(queries),
    queries: atThisInstant(queries),
    fieldConfig: fieldConfig(options, {}),
    options: {
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
      showThresholdLabels: false,
      showThresholdMarkers: true,
    },
  };
}

export function table(
  title: string,
  description: string,
  size: Size,
  queries: Query[],
  options: FieldOptions & { sortBy?: string; desc?: boolean; hide?: string[]; rename?: Record<string, string>; merge?: boolean } = {}
): PanelSpec {
  const hidden = (options.hide ?? []).map((name) => ({
    matcher: { id: 'byName', options: name },
    properties: [{ id: 'custom.hidden', value: true }],
  }));
  return {
    type: 'table',
    title,
    description,
    ...size,
    datasource: datasourceOf(queries),
    queries,
    fieldConfig: fieldConfig(
      { ...options, overrides: [...hidden, ...(options.overrides ?? [])] },
      { align: 'auto', cellOptions: { type: options.steps ? 'color-text' : 'auto' }, inspect: false }
    ),
    options: {
      showHeader: true,
      cellHeight: 'sm',
      footer: { show: false, reducer: ['sum'], fields: '', countRows: false },
      ...(options.sortBy ? { sortBy: [{ displayName: options.sortBy, desc: options.desc ?? true }] } : {}),
    },
    transformations: [
      ...(options.merge ? [{ id: 'merge', options: {} }] : []),
      ...(options.rename ? [{ id: 'organize', options: { excludeByName: {}, indexByName: {}, renameByName: options.rename } }] : []),
    ],
  };
}

export function logs(title: string, description: string, size: Size, queries: Query[]): PanelSpec {
  return {
    type: 'logs',
    title,
    description,
    ...size,
    datasource: LOKI,
    queries,
    options: {
      showTime: true,
      showLabels: false,
      showCommonLabels: false,
      wrapLogMessage: true,
      prettifyLogMessage: false,
      enableLogDetails: true,
      dedupStrategy: 'none',
      sortOrder: 'Descending',
    },
  };
}

export function traces(title: string, description: string, size: Size, queries: Query[]): PanelSpec {
  return {
    type: 'table',
    title,
    description,
    ...size,
    datasource: TEMPO,
    queries,
    fieldConfig: fieldConfig({}, { align: 'auto', cellOptions: { type: 'auto' }, inspect: false }),
    options: {
      showHeader: true,
      cellHeight: 'sm',
      footer: { show: false, reducer: ['sum'], fields: '', countRows: false },
    },
  };
}
