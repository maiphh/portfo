/** Craftland island: 14 isometric tiles (one per game mode), 2 featured. Ported from the prototype's build step. */
const W = 96;
const H = 48;
const D = 18;
const CELLS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 0],
  [2, 1],
  [2, 2],
  [2, 3],
  [3, 1],
  [3, 2],
  [3, 3],
  [4, 2],
];
const FEATURED = new Set(["1,1", "3,2"]);
const GLYPHS = [
  '<circle cx="0" cy="0" r="9"/>',
  '<path d="M-9 7 0-9 9 7Z"/>',
  '<path d="M-8-8 8 8M8-8-8 8"/>',
  '<path d="M-10-3c4-4 6 4 10 0s6 4 10 0M-10 5c4-4 6 4 10 0s6 4 10 0"/>',
  '<rect x="-8" y="-8" width="16" height="16"/>',
  '<path d="M0-10v20M-10 0h20"/><circle r="5"/>',
  '<path d="M-9 9V-2l9-7 9 7V9Z"/>',
];

export interface IslandTile {
  featured: boolean;
  top: string;
  left: string;
  right: string;
  glyph: string;
  x: number;
  y: number;
}

export function buildIsland(): { viewBox: string; tiles: IslandTile[] } {
  const order = [...CELLS].sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
  const xs: number[] = [];
  const ys: number[] = [];
  const tiles = order.map(([i, j], k) => {
    const featured = FEATURED.has(`${i},${j}`);
    const x = ((i - j) * W) / 2;
    const dz = featured ? -14 : 0;
    const y = ((i + j) * H) / 2 + dz;
    const dd = D - dz;
    const top = `${x},${y - H / 2} ${x + W / 2},${y} ${x},${y + H / 2} ${x - W / 2},${y}`;
    const left = `${x - W / 2},${y} ${x},${y + H / 2} ${x},${y + H / 2 + dd} ${x - W / 2},${y + dd}`;
    const right = `${x + W / 2},${y} ${x},${y + H / 2} ${x},${y + H / 2 + dd} ${x + W / 2},${y + dd}`;
    xs.push(x - W / 2, x + W / 2 + 60);
    ys.push(y - H / 2 - 70, y + H / 2 + dd);
    return { featured, top, left, right, glyph: GLYPHS[k % GLYPHS.length] ?? "", x, y };
  });
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const viewBox = [minX - 10, minY - 10, Math.max(...xs) - minX + 20, Math.max(...ys) - minY + 20]
    .map((n) => Math.round(n))
    .join(" ");
  return { viewBox, tiles };
}
