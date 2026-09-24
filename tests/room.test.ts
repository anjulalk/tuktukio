import assert from "node:assert/strict";
import test from "node:test";
import { isCutOff } from "../shared/cutoff.ts";
import { applyHit, createRoom, respawnPassenger } from "../server/src/room.ts";
import type { PlayerState } from "../shared/types.ts";

function player(id: number, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    name: `Tuk${id}`,
    x: id * 2,
    z: 0,
    heading: 0,
    speed: 0,
    cash: 0,
    hearts: 3,
    alive: true,
    respawnAt: 0,
    online: true,
    disconnectAt: 0,
    delivered: 0,
    kills: 0,
    ...overrides,
  };
}

test("cutoff requires range, heading, speed, and front alignment", () => {
  const attacker = player(1, { x: 0, z: 1, heading: 0, speed: 8 });
  const victim = player(2, { x: 0, z: 0, heading: 0, speed: 1 });
  assert.equal(isCutOff(attacker, victim), true);
  assert.equal(isCutOff({ ...attacker, speed: 0.5 }, victim), false);
  assert.equal(isCutOff({ ...attacker, x: 10 }, victim), false);
  assert.equal(isCutOff({ ...attacker, heading: Math.PI }, victim), false);
});

test("a zero-heart hit enters a server-owned wrecked state with a respawn lease", () => {
  const room = createRoom("test-room", 7);
  const attacker = player(1, { cash: 50 });
  const victim = player(2, { cash: 100 });
  room.players.set(1, attacker);
  room.players.set(2, victim);

  const event = applyHit(room, { attackerId: 1, victimId: 2, heartsLeft: 0 });
  assert.notEqual(event, null);
  assert.equal(victim.hearts, 0);
  assert.equal(victim.alive, false);
  assert.ok((event?.respawnAt ?? 0) > Date.now() - 1_000);
  assert.equal(attacker.cash, 70);
  assert.equal(victim.cash, 80);
  assert.equal(attacker.kills, 1);
});

test("room creates and resets authoritative passenger state", () => {
  const room = createRoom("passenger-room", 7);
  assert.equal(room.passengers.size, 5);
  const passenger = room.passengers.get("p0");
  assert.notEqual(passenger, undefined);
  assert.equal(passenger?.ownerId, null);
  if (passenger === undefined) return;
  passenger.ownerId = 42;
  respawnPassenger(room, passenger);
  assert.equal(passenger.ownerId, null);
  assert.ok(Number.isFinite(passenger.x));
  assert.ok(Number.isFinite(passenger.destX));
});
