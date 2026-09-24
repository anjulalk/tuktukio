// Pure cut-off rule (FR-16). Used by BOTH client (predict) and server (validate).
// Similar technique throughout: single source of truth, no duplication.

import type { PlayerState } from "./types.ts";

const CUT_RANGE_M = 4.0;
const HEADING_TOL_RAD = (30 * Math.PI) / 180;

function headingDiff(a: number, b: number): number {
  let d: number = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function isCutOff(attacker: PlayerState, victim: PlayerState): boolean {
  const dx: number = attacker.x - victim.x;
  const dz: number = attacker.z - victim.z;
  const dist: number = Math.hypot(dx, dz);
  if (dist > CUT_RANGE_M || dist < 0.5) return false;
  if (headingDiff(attacker.heading, victim.heading) > HEADING_TOL_RAD) return false;
  if (attacker.speed <= victim.speed) return false;
  // Attacker must be in front half of victim (dot with victim forward > 0).
  const fx: number = Math.sin(victim.heading);
  const fz: number = Math.cos(victim.heading);
  const dot: number = dx * fx + dz * fz;
  return dot > 0;
}
