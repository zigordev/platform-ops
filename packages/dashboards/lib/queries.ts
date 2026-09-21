import { LOKI, PROMETHEUS, TEMPO, type Query } from './model.ts';

export type PromOptions = { legend?: string; exemplar?: boolean; instant?: boolean; table?: boolean };

export function prom(expr: string, options: PromOptions = {}): Query {
  const instant = options.instant ?? false;
  return {
    datasource: PROMETHEUS,
    expr,
    legendFormat: options.legend ?? '__auto',
    range: !instant,
    instant,
    exemplar: options.exemplar ?? false,
    ...(options.table ? { format: 'table' } : {}),
  };
}

export function loki(expr: string, options: { legend?: string; instant?: boolean } = {}): Query {
  return {
    datasource: LOKI,
    expr,
    queryType: options.instant ? 'instant' : 'range',
    ...(options.legend ? { legendFormat: options.legend } : {}),
  };
}

export function traceql(query: string, limit = 20): Query {
  return {
    datasource: TEMPO,
    queryType: 'traceql',
    query,
    limit,
    tableType: 'traces',
  };
}
