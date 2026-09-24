// Authoritative room server: 15Hz tick, join/snap/cut/wreck (US-20/21/25/26).
// TS strict, no `any`. Run: npm run server:dev (port 8081).

import { WebSocketServer, type WebSocket } from "ws";
import { isCutOff } from "../../shared/cutoff";
import type { Passenger, PlayerState } from "../../shared/types";
import { computeFare } from "../../shared/fare";
import type { ClientMsg, ServerMsg } from "../../shared/protocol";
import { applyHit, createRoom, respawnPassenger, type Room } from "./room";

const PORT = 8081;
const TICK_MS = 66; // ~15Hz
const SPAWN_SAFE_MS = 10_000;
const ATTACK_CD_MS = 3_000;
const VICTIM_IMMUNE_MS = 5_000;
const MAX_PLAYERS = 20;
const MAX_FARES = 3;
const PICKUP_RANGE_M = 3.4;
const DROPOFF_RANGE_M = 4.5;
const WORLD_MIN_M = -20;
const WORLD_MAX_M = 460;

const room: Room = createRoom("room-1", 7);
let nextId = 1;
let snapshotTick = 0;

interface Conn {
  readonly ws: WebSocket;
  id: number | null;
  attackerUntil: number;
  victimImmuneUntil: number;
  spawnAt: number;
  lastCutAt: number;
}

const conns = new Set<Conn>();

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // The close handler will remove the connection.
  }
}

function snapshot(): ServerMsg {
  const players = [...room.players.values()].filter((p) => p.online && p.alive).map(
    (p): readonly [number, number, number, number, number, number, number] => [
      p.id,
      p.x,
      p.z,
      p.heading,
      p.speed,
      p.cash,
      p.hearts,
    ],
  );
  return { t: "snap", tick: ++snapshotTick, players };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function passengerSnapshot(): ServerMsg {
  return { t: "passengers", passengers: [...room.passengers.values()].map((passenger) => ({ ...passenger })) };
}

function broadcastPassenger(passenger: Passenger, player: PlayerState): void {
  const message: ServerMsg = { t: "passenger", passenger: { ...passenger }, playerId: player.id, cash: player.cash, delivered: player.delivered };
  for (const conn of conns) send(conn.ws, message);
}

function ownedFareCount(playerId: number): number {
  let count = 0;
  for (const passenger of room.passengers.values()) if (passenger.ownerId === playerId) count += 1;
  return count;
}

function handlePick(player: PlayerState, pid: string): void {
  if (ownedFareCount(player.id) >= MAX_FARES || Math.abs(player.speed) > 1) return;
  const passenger = room.passengers.get(pid);
  if (passenger === undefined || passenger.ownerId !== null) return;
  if (Math.hypot(player.x - passenger.x, player.z - passenger.z) > PICKUP_RANGE_M) return;
  passenger.ownerId = player.id;
  broadcastPassenger(passenger, player);
}

function handleDrop(player: PlayerState, pid: string): void {
  const passenger = room.passengers.get(pid);
  if (passenger === undefined || passenger.ownerId !== player.id || Math.abs(player.speed) > 1.5) return;
  if (Math.hypot(player.x - passenger.destX, player.z - passenger.destZ) > DROPOFF_RANGE_M) return;
  const distance = Math.hypot(passenger.destX - passenger.x, passenger.destZ - passenger.z);
  const fare = computeFare(distance, { fast: false, clean: player.hearts === 3 });
  player.cash += fare;
  player.delivered += 1;
  respawnPassenger(room, passenger);
  broadcastPassenger(passenger, player);
}

function parse(raw: string): ClientMsg | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const message = v as Record<string, unknown>;
    if (message.t === "join" && typeof message.name === "string") return { t: "join", name: message.name };
    if (message.t === "input" && finite(message.seq) && Number.isInteger(message.seq) && message.seq > 0 && finite(message.x) && finite(message.z) && finite(message.heading) && finite(message.speed)) {
      return { t: "input", seq: message.seq, x: message.x, z: message.z, heading: message.heading, speed: message.speed };
    }
    if (message.t === "cut" && finite(message.victimId) && Number.isInteger(message.victimId)) return { t: "cut", victimId: message.victimId };
    if ((message.t === "pick" || message.t === "drop") && typeof message.pid === "string" && message.pid.length <= 16) return { t: message.t, pid: message.pid };
    if (message.t === "respawn") return { t: "respawn" };
    return null;
  } catch {
    return null;
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws: WebSocket): void => {
  const conn: Conn = { ws, id: null, attackerUntil: 0, victimImmuneUntil: 0, spawnAt: 0, lastCutAt: 0 };
  conns.add(conn);

  ws.on("message", (data: unknown): void => {
    const msg: ClientMsg | null = typeof data === "string" ? parse(data) : parse(String(data));
    if (msg === null) return;
    const now: number = Date.now();

    if (msg.t === "join") {
      if (conn.id !== null || room.players.size >= MAX_PLAYERS) return;
      const id: number = nextId++;
      const p: PlayerState = {
        id,
        name: msg.name.slice(0, 12) || `Tuk${id}`,
        x: 30 + id * 4,
        z: 30,
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
      };
      room.players.set(id, p);
      conn.id = id;
      conn.spawnAt = now;
      conn.victimImmuneUntil = now + SPAWN_SAFE_MS;
      send(ws, { t: "welcome", id, seed: room.seed, roomId: room.roomId, x: p.x, z: p.z, heading: p.heading, speed: p.speed, hearts: p.hearts, alive: p.alive, respawnAt: p.respawnAt, cash: p.cash, delivered: p.delivered });
      send(ws, passengerSnapshot());
      return;
    }

    if (conn.id === null) return;
    const me: PlayerState | undefined = room.players.get(conn.id);
    if (me === undefined || !me.online) return;
    if (msg.t === "respawn") {
      if (me.alive || now < me.respawnAt) return;
      me.x = 30 + (me.id % 20) * 4;
      me.z = 30;
      me.heading = 0;
      me.speed = 0;
      me.hearts = 3;
      me.alive = true;
      me.respawnAt = 0;
      conn.spawnAt = now;
      conn.victimImmuneUntil = now + SPAWN_SAFE_MS;
      const respawned: ServerMsg = { t: "respawned", id: me.id, x: me.x, z: me.z, heading: me.heading, hearts: me.hearts, shieldMs: 8_000 };
      for (const c of conns) send(c.ws, respawned);
      return;
    }
    if (!me.alive) return;
    if (msg.t === "pick") {
      handlePick(me, msg.pid);
      return;
    }
    if (msg.t === "drop") {
      handleDrop(me, msg.pid);
      return;
    }

    if (msg.t === "input") {
      // Sanity clamp (US-62): reject teleports/speed hacks, correct by ignoring.
      const dx: number = msg.x - me.x;
      const dz: number = msg.z - me.z;
      if (Math.hypot(dx, dz) > 30 || msg.speed > 15 || msg.speed < -6 || msg.x < WORLD_MIN_M || msg.x > WORLD_MAX_M || msg.z < WORLD_MIN_M || msg.z > WORLD_MAX_M) return;
      me.x = msg.x;
      me.z = msg.z;
      me.heading = msg.heading;
      me.speed = msg.speed;
      return;
    }

    if (msg.t === "cut") {
      if (now < conn.attackerUntil) return;
      const victim: PlayerState | undefined = room.players.get(msg.victimId);
      if (victim === undefined || victim.id === me.id || !victim.online || !victim.alive || victim.hearts <= 0) return;
      if (now - conn.spawnAt < SPAWN_SAFE_MS) return;
      if (now < conn.victimImmuneUntil) return;
      if (!isCutOff(me, victim)) return;
      conn.attackerUntil = now + ATTACK_CD_MS;
      conn.lastCutAt = now;
      // Mark victim immune: find their conn
      for (const c of conns) {
        if (c.id === victim.id) c.victimImmuneUntil = now + VICTIM_IMMUNE_MS;
      }
      const heartsLeft: number = Math.max(0, victim.hearts - 1);
      const ev = applyHit(room, { attackerId: me.id, victimId: victim.id, heartsLeft });
      const hitMsg: ServerMsg = { t: "hit", hit: { attackerId: me.id, victimId: victim.id, heartsLeft } };
      for (const c of conns) send(c.ws, hitMsg);
      if (ev !== null) {
        const wreck: ServerMsg = { t: "wrecked", ev };
        for (const c of conns) send(c.ws, wreck);
      }
    }
  });

  ws.on("close", (): void => {
    conns.delete(conn);
    if (conn.id !== null) {
      for (const passenger of room.passengers.values()) {
        if (passenger.ownerId === conn.id) respawnPassenger(room, passenger);
      }
      room.players.delete(conn.id);
    }
  });
});

setInterval((): void => {
  const msg: ServerMsg = snapshot();
  for (const c of conns) {
    if (c.ws.readyState === c.ws.OPEN) send(c.ws, msg);
  }
}, TICK_MS);

// eslint-disable-next-line no-console
console.log(`tuktuk room listening on ws://localhost:${PORT}`);
