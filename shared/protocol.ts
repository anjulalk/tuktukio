// Wire protocol. Single source of truth for client + server (TS strict).
// JSON arrays are a simple baseline; compact delta/interest management is future work.

import type { EliminatedEvent, HitEvent, Passenger, Snapshot } from "./types";

export type ClientMsg =
  | { readonly t: "join"; readonly name: string }
  | { readonly t: "ping" }
  | { readonly t: "input"; readonly seq: number; readonly x: number; readonly z: number; readonly heading: number; readonly speed: number }
  | { readonly t: "cut"; readonly victimId: number }
  | { readonly t: "pick"; readonly pid: string }
  | { readonly t: "drop"; readonly pid: string }
  | { readonly t: "respawn" };

export type ServerMsg =
  | { readonly t: "welcome"; readonly id: number; readonly seed: number; readonly roomId: string; readonly x: number; readonly z: number; readonly heading: number; readonly speed: number; readonly hearts: number; readonly alive: boolean; readonly respawnAt: number; readonly cash: number; readonly delivered: number }
  | { readonly t: "snap"; readonly tick: number; readonly players: readonly Snapshot[] }
  | { readonly t: "hit"; readonly hit: HitEvent }
  | { readonly t: "wrecked"; readonly ev: EliminatedEvent }
  | { readonly t: "respawned"; readonly id: number; readonly x: number; readonly z: number; readonly heading: number; readonly hearts: number; readonly shieldMs: number }
  | { readonly t: "passengers"; readonly passengers: readonly Passenger[] }
  | { readonly t: "passenger"; readonly passenger: Passenger; readonly playerId: number; readonly cash: number; readonly delivered: number };
