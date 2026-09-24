// Authoritative room state and hit rules. The Cloudflare Worker and local Node
// fallback both use this module so their combat/fare primitives stay aligned.

import type { EliminatedEvent, HitEvent, Passenger, PlayerState } from "../../shared/types";
import { mulberry32 } from "../../shared/prng";
import { buildRoadGraph, type RoadGraph } from "../../client/src/city/roadGraph";

export interface Room {
  roomId: string;
  readonly seed: number;
  readonly graph: RoadGraph;
  readonly players: Map<number, PlayerState>;
  readonly passengers: Map<string, Passenger>;
}

function createPassengers(seed: number, graph: RoadGraph): Map<string, Passenger> {
  const rand = mulberry32(seed + 2);
  const passengers = new Map<string, Passenger>();
  for (let index = 0; index < 5; index += 1) {
    const pickup = graph.nodes[Math.floor(rand() * graph.nodes.length)] as { x: number; z: number };
    let destination = graph.nodes[Math.floor(rand() * graph.nodes.length)] as { x: number; z: number };
    if (destination === pickup) {
      const pickupIndex = graph.nodes.indexOf(pickup);
      destination = graph.nodes[(pickupIndex + 13) % graph.nodes.length] as { x: number; z: number };
    }
    const id = `p${index}`;
    passengers.set(id, {
      id,
      x: pickup.x + 5,
      z: pickup.z + 5,
      destX: destination.x,
      destZ: destination.z,
      ownerId: null,
    });
  }
  return passengers;
}

export function createRoom(roomId: string, seed: number): Room {
  const graph = buildRoadGraph(seed);
  return { roomId, seed, graph, players: new Map<number, PlayerState>(), passengers: createPassengers(seed, graph) };
}

/** Move a completed fare to a new deterministic-unrelated street position. */
export function respawnPassenger(room: Room, passenger: Passenger): void {
  const nodes = room.graph.nodes;
  const pickup = nodes[Math.floor(Math.random() * nodes.length)] as { x: number; z: number };
  let destination = nodes[Math.floor(Math.random() * nodes.length)] as { x: number; z: number };
  if (destination === pickup) {
    const pickupIndex = nodes.indexOf(pickup);
    destination = nodes[(pickupIndex + 17) % nodes.length] as { x: number; z: number };
  }
  passenger.x = pickup.x + 5;
  passenger.z = pickup.z + 5;
  passenger.destX = destination.x;
  passenger.destZ = destination.z;
  passenger.ownerId = null;
}

/** Apply validated hit. Retention: fares stay bound — only cash/hearts change (FR-17). */
export function applyHit(room: Room, hit: HitEvent): EliminatedEvent | null {
  const victim: PlayerState | undefined = room.players.get(hit.victimId);
  const attacker: PlayerState | undefined = room.players.get(hit.attackerId);
  if (victim === undefined || attacker === undefined) return null;
  victim.hearts = hit.heartsLeft;
  if (hit.heartsLeft <= 0) {
    victim.alive = false;
    victim.respawnAt = Date.now() + 3_000;
    const stolen: number = Math.floor(victim.cash * 0.2);
    victim.cash -= stolen;
    attacker.cash += stolen;
    attacker.kills += 1;
    return { victimId: victim.id, killerId: attacker.id, cashStolen: stolen, respawnAt: victim.respawnAt };
  }
  return null;
}
