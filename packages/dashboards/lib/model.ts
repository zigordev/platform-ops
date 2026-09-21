export type Datasource = { type: 'prometheus' | 'loki' | 'tempo'; uid: string };

export const PROMETHEUS: Datasource = { type: 'prometheus', uid: 'prometheus' };
export const LOKI: Datasource = { type: 'loki', uid: 'loki' };
export const TEMPO: Datasource = { type: 'tempo', uid: 'tempo' };

export type Query = Record<string, unknown> & { datasource: Datasource };

export type Target = Query & { refId: string };

export type GridPos = { x: number; y: number; w: number; h: number };

export type PanelSpec = Record<string, unknown> & {
  type: string;
  title: string;
  w: number;
  h: number;
  queries: Query[];
};

export type Panel = Record<string, unknown> & {
  id: number;
  type: string;
  title: string;
  gridPos: GridPos;
  targets: Target[];
};

export type Row = PanelSpec[];

export type Variable = Record<string, unknown> & { name: string; type: string };

export type Folder = { name: string; uid: string };

export type DashboardSpec = {
  uid: string;
  title: string;
  description: string;
  folder: Folder;
  tags?: string[];
  time?: { from: string; to: string };
  refresh?: string;
  variables?: Variable[];
  deploys: string;
  rows: Row[];
};

export type Dashboard = Record<string, unknown> & {
  uid: string;
  title: string;
  tags: string[];
  panels: Panel[];
};

export const GRID_WIDTH = 24;

export function layout(rows: Row[]): Panel[] {
  const panels: Panel[] = [];
  let y = 0;
  for (const row of rows) {
    let x = 0;
    let tallest = 0;
    for (const { w, h, queries, ...rest } of row) {
      if (x + w > GRID_WIDTH) {
        throw new Error(`"${rest.title}" does not fit: the row is wider than ${GRID_WIDTH} columns`);
      }
      const targets = queries.map((query, index) => ({ refId: String.fromCharCode(65 + index), ...query }));
      panels.push({ id: panels.length + 1, ...rest, gridPos: { x, y, w, h }, targets });
      x += w;
      tallest = Math.max(tallest, h);
    }
    y += tallest;
  }
  return panels;
}
