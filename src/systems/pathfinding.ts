import { COLS, ROWS } from '../data/floors';

export interface Pt { col: number; row: number; }

// Small A* on the tile grid. `blocked` is a Set of "col,row" strings.
export function findPath(blocked: Set<string>, from: Pt, to: Pt): Pt[] {
  const key = (c: number, r: number) => c + ',' + r;
  if (from.col === to.col && from.row === to.row) return [to];

  const open: { col: number; row: number; f: number }[] = [];
  const g = new Map<string, number>();
  const parent = new Map<string, string>();
  const closed = new Set<string>();
  const h = (c: number, r: number) => Math.abs(c - to.col) + Math.abs(r - to.row);

  g.set(key(from.col, from.row), 0);
  open.push({ col: from.col, row: from.row, f: h(from.col, from.row) });

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let guard = 0;
  while (open.length && guard++ < 5000) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    const ck = key(cur.col, cur.row);
    if (cur.col === to.col && cur.row === to.row) {
      const path: Pt[] = [];
      let k: string | undefined = ck;
      while (k) {
        const [c, r] = k.split(',').map(Number);
        path.push({ col: c, row: r });
        k = parent.get(k);
      }
      path.reverse();
      return path;
    }
    closed.add(ck);
    for (const [dc, dr] of dirs) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      // allow walking one tile off the bottom edge (the entrance).
      if (nc < 0 || nc >= COLS || nr < 0 || nr > ROWS) continue;
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;
      const isTarget = nc === to.col && nr === to.row;
      if (blocked.has(nk) && !isTarget) continue;
      const ng = (g.get(ck) ?? 0) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        parent.set(nk, ck);
        open.push({ col: nc, row: nr, f: ng + h(nc, nr) });
      }
    }
  }
  return [];
}
