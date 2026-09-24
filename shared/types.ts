// Shared authoritative types. No `any`. Server is source of truth (NFR-30).
// Mirrors docs/06-architecture.md §8.

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface PlayerState {
  readonly id: number;
  readonly name: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  cash: number;
  /** 3-hit combat: 3 full, 0 wrecked. Retention: fares stay bound (FR-17). */
  hearts: number;
  alive: boolean;
  respawnAt: number;
  /** False during the short reconnect grace window after a socket drops. */
  online: boolean;
  disconnectAt: number;
  delivered: number;
  kills: number;
}

export interface Passenger {
  readonly id: string;
  x: number;
  z: number;
  destX: number;
  destZ: number;
  /** owner player id once picked; null = waiting on street */
  ownerId: number | null;
}

export type Snapshot = readonly [id: number, x: number, z: number, h: number, v: number, cash: number, hearts: number];

export interface HitEvent {
  readonly attackerId: number;
  readonly victimId: number;
  readonly heartsLeft: number;
}

export interface EliminatedEvent {
  readonly victimId: number;
  readonly killerId: number;
  readonly cashStolen: number;
  readonly respawnAt: number;
}
