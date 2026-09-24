// Shared fare formula. Server recomputes; client predicts FX only (US-62).

export const FARE_BASE = 50;
export const FARE_PER_M = 2;

export function computeFare(distanceM: number, opts: { fast: boolean; clean: boolean }): number {
  const d: number = Math.max(0, distanceM);
  let tip = 0;
  if (opts.fast) tip += 20;
  if (opts.clean) tip += 15;
  return Math.round(FARE_BASE + FARE_PER_M * d + tip);
}
