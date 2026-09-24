// Server validation (US-62 + US-27). Same pure funcs as client — TS strict.
// Stub for vertical slice; full ws room comes next.

import { isCutOff } from "../../shared/cutoff";
import { computeFare } from "../../shared/fare";
import type { PlayerState } from "../../shared/types";

export interface Cooldowns {
  attackerUntil: number;
  victimImmuneUntil: number;
}

export function validateCut(
  attacker: PlayerState,
  victim: PlayerState,
  nowMs: number,
  cd: Cooldowns,
  victimInSafeZone: boolean,
): boolean {
  if (nowMs < cd.attackerUntil) return false;
  if (nowMs < cd.victimImmuneUntil) return false;
  if (victimInSafeZone) return false;
  return isCutOff(attacker, victim);
}

export function validateFare(distanceM: number, fast: boolean, clean: boolean): number {
  return computeFare(distanceM, { fast, clean });
}
