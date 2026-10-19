/** Sample candlestick series for the OpenPortfo illustration (deterministic, seed 7). SAMPLE DATA †. */
export interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
}

export function candleSeries(seed = 7) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  let v = 100;
  const next = (): Candle => {
    const o = v;
    const c = o * (1 + (rnd() - 0.47) * 0.035);
    const h = Math.max(o, c) * (1 + rnd() * 0.012);
    const l = Math.min(o, c) * (1 - rnd() * 0.012);
    v = c;
    return { o, c, h, l };
  };
  const initial: Candle[] = [];
  for (let i = 0; i < 64; i++) initial.push(next());
  return { initial, next };
}

/** Percent change across a window, formatted like "+2.4%". */
export function pctChange(d: readonly Candle[]): string {
  const first = d[0];
  const last = d[d.length - 1];
  if (!first || !last) return "";
  const pct = (last.c / first.o - 1) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
}
