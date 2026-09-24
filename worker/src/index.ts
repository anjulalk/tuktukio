import { DurableObject } from "cloudflare:workers";
import { isCutOff } from "../../shared/cutoff";
import type { ClientMsg, ServerMsg } from "../../shared/protocol";
import type { Passenger, PlayerState, Snapshot } from "../../shared/types";
import { computeFare } from "../../shared/fare";
import { applyHit, createRoom, respawnPassenger, type Room } from "../../server/src/room";
import {
  LOBBY_OBJECT_NAME,
  lobbyObjectNameForShard,
  lobbyShardForRequest,
  lobbyShardForRoomId,
  isLobbyShard,
  roomIdPrefixForShard,
  RECONNECT_GRACE_MS,
  ROOM_CAPACITY,
  TukTukLobby,
} from "./lobby";
export { TukTukLobby };

const TICK_MS = 66; // ~15Hz
const MAX_PLAYERS = ROOM_CAPACITY;
const SPAWN_SAFE_MS = 10_000;
const ATTACK_CD_MS = 3_000;
const VICTIM_IMMUNE_MS = 5_000;
const EMPTY_ROOM_TTL_MS = 15 * 60_000;
const MAX_INPUT_GAP_MS = 750;
const MAX_ACCELERATION = 18;
const MAX_TURN_RATE = 3.5;
const ROOM_CODE_PATTERN = /^[A-Z0-9_-]{1,32}$/;
const MAX_FARES = 3;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const PICKUP_RANGE_M = 3.4;
const DROPOFF_RANGE_M = 4.5;
const WORLD_MIN_M = -20;
const WORLD_MAX_M = 460;

interface RoomAttachment {
  readonly sessionId: string;
  readonly ticketId: string;
  readonly playerName: string;
  readonly playerId: number | null;
  readonly resumeRequested: boolean;
  readonly attackerUntil: number;
  readonly victimImmuneUntil: number;
  readonly spawnAt: number;
  readonly inputSeq: number;
  readonly lastInputAt: number;
  readonly lastInputX: number;
  readonly lastInputZ: number;
  readonly lastInputSpeed: number;
  readonly lastInputHeading: number;
  readonly movementStrikes: number;
  readonly joinDeadline: number;
  readonly lastSeenAt: number;
}

interface Session {
  ticketId: string;
  playerName: string;
  playerId: number | null;
  resumeRequested: boolean;
  lastMessageAt: number;
  lastSeenAt: number;
  lastLobbyTouchAt: number;
  attackerUntil: number;
  victimImmuneUntil: number;
  spawnAt: number;
  inputSeq: number;
  lastInputAt: number;
  lastInputX: number;
  lastInputZ: number;
  lastInputSpeed: number;
  lastInputHeading: number;
  movementStrikes: number;
  joinDeadline: number;
}

interface PersistedRoom {
  readonly version: 1;
  readonly roomId: string;
  readonly seed: number;
  readonly nextId: number;
  readonly players: readonly PlayerState[];
  readonly passengers: readonly Passenger[];
}

export interface Env {
  ROOM: DurableObjectNamespace<TukTukRoom>;
  LOBBY: DurableObjectNamespace<TukTukLobby>;
  LOBBY_RATE_LIMITER: RateLimit;
  ALLOWED_ORIGINS?: string;
  ASSETS: Fetcher;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeAttachment(value: unknown): RoomAttachment | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as {
    sessionId?: unknown;
    ticketId?: unknown;
    playerName?: unknown;
    playerId?: unknown;
    resumeRequested?: unknown;
    attackerUntil?: unknown;
    victimImmuneUntil?: unknown;
    spawnAt?: unknown;
    inputSeq?: unknown;
    lastInputAt?: unknown;
    lastInputX?: unknown;
    lastInputZ?: unknown;
    lastInputSpeed?: unknown;
    lastInputHeading?: unknown;
    movementStrikes?: unknown;
    joinDeadline?: unknown;
    lastSeenAt?: unknown;
  };
  if (typeof candidate.sessionId !== "string") return null;
  if (
    candidate.playerId !== null &&
    candidate.playerId !== undefined &&
    !(isFiniteNumber(candidate.playerId) && Number.isInteger(candidate.playerId))
  ) {
    return null;
  }
  return {
    sessionId: candidate.sessionId,
    ticketId: typeof candidate.ticketId === "string" ? candidate.ticketId : "",
    playerName: typeof candidate.playerName === "string" ? candidate.playerName : "",
    playerId: isFiniteNumber(candidate.playerId) ? candidate.playerId : null,
    resumeRequested: candidate.resumeRequested === true,
    attackerUntil: isFiniteNumber(candidate.attackerUntil) ? candidate.attackerUntil : 0,
    victimImmuneUntil: isFiniteNumber(candidate.victimImmuneUntil) ? candidate.victimImmuneUntil : 0,
    spawnAt: isFiniteNumber(candidate.spawnAt) ? candidate.spawnAt : 0,
    inputSeq: isFiniteNumber(candidate.inputSeq) ? candidate.inputSeq : 0,
    lastInputAt: isFiniteNumber(candidate.lastInputAt) ? candidate.lastInputAt : 0,
    lastInputX: isFiniteNumber(candidate.lastInputX) ? candidate.lastInputX : 0,
    lastInputZ: isFiniteNumber(candidate.lastInputZ) ? candidate.lastInputZ : 0,
    lastInputSpeed: isFiniteNumber(candidate.lastInputSpeed) ? candidate.lastInputSpeed : 0,
    lastInputHeading: isFiniteNumber(candidate.lastInputHeading) ? candidate.lastInputHeading : 0,
    movementStrikes: isFiniteNumber(candidate.movementStrikes) ? candidate.movementStrikes : 0,
    joinDeadline: isFiniteNumber(candidate.joinDeadline) ? candidate.joinDeadline : 0,
    lastSeenAt: isFiniteNumber(candidate.lastSeenAt) ? candidate.lastSeenAt : 0,
  };
}

function isPersistedRoom(value: unknown): value is PersistedRoom {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; roomId?: unknown; seed?: unknown; nextId?: unknown; players?: unknown; passengers?: unknown };
  return (
    (candidate.version === undefined || candidate.version === 1) &&
    typeof candidate.roomId === "string" &&
    isFiniteNumber(candidate.seed) &&
    isFiniteNumber(candidate.nextId) &&
    Array.isArray(candidate.players) &&
    (candidate.passengers === undefined || Array.isArray(candidate.passengers))
  );
}

function isPassenger(value: unknown): value is Passenger {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; x?: unknown; z?: unknown; destX?: unknown; destZ?: unknown; ownerId?: unknown };
  return (
    typeof candidate.id === "string" &&
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.z) &&
    isFiniteNumber(candidate.destX) &&
    isFiniteNumber(candidate.destZ) &&
    (candidate.ownerId === null || (isFiniteNumber(candidate.ownerId) && Number.isInteger(candidate.ownerId)))
  );
}

function parseMessage(raw: string): ClientMsg | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const message = value as { t?: unknown; name?: unknown; seq?: unknown; x?: unknown; z?: unknown; heading?: unknown; speed?: unknown; victimId?: unknown; pid?: unknown };
  if (message.t === "join" && typeof message.name === "string") {
    return { t: "join", name: message.name };
  }
  if (message.t === "ping") return { t: "ping" };
  if (
    message.t === "input" &&
    isFiniteNumber(message.seq) &&
    Number.isInteger(message.seq) &&
    message.seq > 0 &&
    isFiniteNumber(message.x) &&
    isFiniteNumber(message.z) &&
    isFiniteNumber(message.heading) &&
    isFiniteNumber(message.speed)
  ) {
    return { t: "input", seq: message.seq, x: message.x, z: message.z, heading: message.heading, speed: message.speed };
  }
  if (message.t === "cut" && isFiniteNumber(message.victimId) && Number.isInteger(message.victimId)) {
    return { t: "cut", victimId: message.victimId };
  }
  if ((message.t === "pick" || message.t === "drop") && typeof message.pid === "string" && message.pid.length <= 16) {
    return { t: message.t, pid: message.pid };
  }
  if (message.t === "respawn") return { t: "respawn" };
  return null;
}

function cleanName(name: string, id: number): string {
  const cleaned = name.replace(/[^\p{L}\p{N}_-]/gu, "").trim().slice(0, 12);
  return cleaned.length > 0 ? cleaned : `Tuk${id}`;
}

function headingDelta(a: number, b: number): number {
  let delta = (a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

function makeSnapshot(room: Room, tick: number): ServerMsg {
  const players: Snapshot[] = [...room.players.values()].filter((player) => player.online && player.alive).map(
    (player): Snapshot => [player.id, player.x, player.z, player.heading, player.speed, player.cash, player.hearts],
  );
  return { t: "snap", tick, players };
}

function sendEncoded(ws: WebSocket, payload: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(payload);
  } catch {
    // The close handler will remove the session if the socket is gone.
  }
}

function send(ws: WebSocket, message: ServerMsg): void {
  sendEncoded(ws, JSON.stringify(message));
}

function sendToAll(sessions: ReadonlyMap<WebSocket, Session>, message: ServerMsg): void {
  const payload = JSON.stringify(message);
  for (const ws of sessions.keys()) sendEncoded(ws, payload);
}

function roomIdFromPath(pathname: string): string | null {
  const exact = /^\/(?:ws|rooms)\/?$/u.exec(pathname);
  const match = /^\/(?:ws|rooms)\/([^/]+)\/?$/u.exec(pathname);
  const raw = exact !== null ? "default" : match?.[1];
  if (raw === undefined) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const roomId = decoded.toUpperCase();
  return ROOM_CODE_PATTERN.test(roomId) ? roomId : null;
}

function isAllowedHttpOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.origin === requestUrl.origin) return true;
    const configured = env.ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
    if (configured.includes(originUrl.origin)) return true;
    return originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function requestRegion(request: Request): string {
  const cf = (request as Request & { cf?: { colo?: string } }).cf;
  return typeof cf?.colo === "string" && cf.colo.length > 0 ? cf.colo : "global";
}

function lobbyStub(env: Env, shard: string): DurableObjectStub<TukTukLobby> {
  return env.LOBBY.getByName(lobbyObjectNameForShard(shard));
}

function withLobbyId<T extends object>(value: T, shard: string): T & { lobbyId: string } {
  return { ...value, lobbyId: shard };
}

function corsHeaders(request?: Request, env?: Env): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  if (request !== undefined && env !== undefined && isAllowedHttpOrigin(request, env)) {
    const origin = request.headers.get("Origin");
    if (origin !== null) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Vary", "Origin");
    }
  }
  return headers;
}

function jsonResponse(value: unknown, status = 200, request?: Request, env?: Env): Response {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Request-Id", crypto.randomUUID());
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (request !== undefined && new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function isAllowedWebSocketOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.origin === requestUrl.origin) return true;
    const configured = env.ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
    if (configured.includes(originUrl.origin)) return true;
    return originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function enforceLobbyRateLimit(request: Request, env: Env, scope: string): Promise<Response | null> {
  // Cloudflare supplies this header at the edge. Anonymous guest play has no
  // account ID, so use the connection identity as a best-effort abuse key.
  const actor = request.headers.get("CF-Connecting-IP") ?? request.headers.get("User-Agent") ?? "anonymous";
  try {
    const result = await env.LOBBY_RATE_LIMITER.limit({ key: `${scope}:${actor}` });
    if (!result.success) {
      console.warn(JSON.stringify({ event: "lobby_rate_limited", scope }));
      const response = jsonResponse({ status: "error", code: "RATE_LIMITED", message: "Too many lobby requests. Try again shortly." }, 429, request, env);
      response.headers.set("Retry-After", "2");
      return response;
    }
  } catch (error) {
    // Fail open if the local runtime does not provide the optional binding;
    // deployed production Workers do provide it.
    console.error(JSON.stringify({ event: "lobby_rate_limiter_error", scope, message: error instanceof Error ? error.message : "unknown" }));
  }
  return null;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const maxBytes = 2_048;
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null && Number(contentLength) > maxBytes) return null;
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The request body is already consumed or cancelled.
    }
  }
}

/**
 * One Durable Object owns one TukTuk.io room. The room id is the stable object
 * name selected by the Worker, so all players in a room are serialized by the
 * same instance while different rooms scale independently.
 */
export class TukTukRoom extends DurableObject<Env> {
  private room: Room;
  private nextId: number;
  private readonly sessions: Map<WebSocket, Session>;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private lastPersistAt = 0;
  private persistQueued = false;
  private snapshotTick = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = createRoom("", 7);
    this.nextId = 1;
    this.sessions = new Map();

    // Hibernatable sockets are restored when the object wakes up.
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = normalizeAttachment(ws.deserializeAttachment());
      if (attachment !== null) this.sessions.set(ws, this.newSession(attachment));
    }
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<unknown>("room-state");
      if (isPersistedRoom(saved)) this.restore(saved);
      this.ensureTicker();
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (!isWebSocketUpgrade(request)) return new Response("WebSocket upgrade required", { status: 426 });

    const url = new URL(request.url);
    if (this.cleanupDisconnectedPlayers(Date.now())) this.persistSoon();
    const requestedRoomId = roomIdFromPath(url.pathname) ?? "default";
    const ticketId = url.searchParams.get("ticket");
    if (ticketId === null || ticketId.length < 16 || ticketId.length > 64) {
      return new Response("A lobby admission ticket is required", { status: 401 });
    }
    if (this.room.roomId.length === 0) this.room.roomId = requestedRoomId;
    if (this.room.roomId !== requestedRoomId) return new Response("Room identifier mismatch", { status: 409 });

    const admission = await lobbyStub(this.env, lobbyShardForRoomId(this.room.roomId)).consume(requestedRoomId, ticketId);
    if (!admission.ok || admission.playerName === undefined) return new Response("Invalid or expired admission ticket", { status: 403 });
    const returningPlayer = admission.resumed === true && admission.playerId !== undefined;
    if (this.sessions.size >= MAX_PLAYERS || (!returningPlayer && this.room.players.size >= MAX_PLAYERS)) {
      await lobbyStub(this.env, lobbyShardForRoomId(this.room.roomId)).release(requestedRoomId, ticketId, false);
      return new Response("Room is full", { status: 429 });
    }
    await this.ctx.storage.deleteAlarm();

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const attachment: RoomAttachment = {
      sessionId: crypto.randomUUID(),
      ticketId,
      playerName: admission.playerName,
      playerId: admission.playerId ?? null,
      resumeRequested: admission.resumed === true,
      attackerUntil: 0,
      victimImmuneUntil: 0,
      spawnAt: 0,
      inputSeq: 0,
      lastInputAt: 0,
      lastInputX: 0,
      lastInputZ: 0,
      lastInputSpeed: 0,
      lastInputHeading: 0,
      movementStrikes: 0,
      joinDeadline: Date.now() + 5_000,
      lastSeenAt: Date.now(),
    };
    server.serializeAttachment(attachment);
    this.sessions.set(server, this.newSession(attachment));
    console.log(JSON.stringify({ event: "room_socket_accepted", roomId: this.room.roomId }));
    this.ensureTicker();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const session = this.sessions.get(ws) ?? this.restoreSession(ws);
    const now = Date.now();
    session.lastSeenAt = now;
    if (session.playerId === null && session.joinDeadline > 0 && now > session.joinDeadline) {
      try {
        ws.close(1008, "Join timeout");
      } catch {
        // The runtime will finish closing the socket.
      }
      return;
    }
    // 30 messages/second is enough for the current 10Hz input protocol.
    if (now - session.lastMessageAt < 30) return;
    session.lastMessageAt = now;

    if (typeof message !== "string" && message.byteLength > 2_048) {
      try {
        ws.close(1009, "Message too large");
      } catch {
        // The runtime will finish closing the socket.
      }
      return;
    }
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (raw.length > 2_048) {
      try {
        ws.close(1009, "Message too large");
      } catch {
        // The runtime will finish closing the socket.
      }
      return;
    }
    const parsed = parseMessage(raw);
    if (parsed === null) return;
    if (session.ticketId.length > 0 && now - session.lastLobbyTouchAt >= 30_000) {
      session.lastLobbyTouchAt = now;
      void lobbyStub(this.env, lobbyShardForRoomId(this.room.roomId)).touch(this.room.roomId, session.ticketId).catch((error: unknown) => {
        console.error(JSON.stringify({ event: "lobby_touch_failed", roomId: this.room.roomId, message: error instanceof Error ? error.message : "unknown" }));
      });
    }
    if (parsed.t === "ping") {
      this.syncAttachment(ws, session);
      return;
    }

    if (parsed.t === "join") {
      if (session.playerId !== null) {
        if (!session.resumeRequested) return;
        const resumedPlayer = this.room.players.get(session.playerId);
        if (resumedPlayer !== undefined) {
          resumedPlayer.online = true;
          resumedPlayer.disconnectAt = 0;
          session.resumeRequested = false;
          session.spawnAt = now;
          session.victimImmuneUntil = now + 2_000;
          session.inputSeq = 0;
          session.lastInputAt = now;
          session.lastInputX = resumedPlayer.x;
          session.lastInputZ = resumedPlayer.z;
          session.lastInputSpeed = resumedPlayer.speed;
          session.lastInputHeading = resumedPlayer.heading;
          session.movementStrikes = 0;
          session.joinDeadline = 0;
          this.syncAttachment(ws, session);
          send(ws, { t: "welcome", id: resumedPlayer.id, seed: this.room.seed, roomId: this.room.roomId, x: resumedPlayer.x, z: resumedPlayer.z, heading: resumedPlayer.heading, speed: resumedPlayer.speed, hearts: resumedPlayer.hearts, alive: resumedPlayer.alive, respawnAt: resumedPlayer.respawnAt, cash: resumedPlayer.cash, delivered: resumedPlayer.delivered });
          this.sendPassengers(ws);
          await this.persist();
          this.broadcastSnapshot();
          return;
        }
        session.playerId = null;
      }
      const id = this.nextId++;
      const player: PlayerState = {
        id,
        name: cleanName(session.playerName || parsed.name, id),
        x: 30 + (id % 20) * 4,
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
      this.room.players.set(id, player);
      session.playerId = id;
      session.resumeRequested = false;
      session.spawnAt = now;
      session.victimImmuneUntil = now + SPAWN_SAFE_MS;
      session.inputSeq = 0;
      session.lastInputAt = now;
      session.lastInputX = player.x;
      session.lastInputZ = player.z;
      session.lastInputSpeed = 0;
      session.lastInputHeading = player.heading;
      session.movementStrikes = 0;
      session.joinDeadline = 0;
      this.syncAttachment(ws, session);

      send(ws, { t: "welcome", id, seed: this.room.seed, roomId: this.room.roomId, x: player.x, z: player.z, heading: player.heading, speed: player.speed, hearts: player.hearts, alive: player.alive, respawnAt: player.respawnAt, cash: player.cash, delivered: player.delivered });
      this.sendPassengers(ws);
      try {
        await lobbyStub(this.env, lobbyShardForRoomId(this.room.roomId)).attachPlayer(this.room.roomId, session.ticketId, id);
      } catch (error) {
        console.error(JSON.stringify({ event: "lobby_player_attach_failed", roomId: this.room.roomId, message: error instanceof Error ? error.message : "unknown" }));
      }
      await this.persist();
      this.broadcastSnapshot();
      return;
    }

    if (session.playerId === null) return;
    const me = this.room.players.get(session.playerId);
    if (me === undefined || !me.online) return;
    if (parsed.t === "pick") {
      await this.handlePick(me, parsed.pid);
      return;
    }
    if (parsed.t === "drop") {
      await this.handleDrop(me, parsed.pid);
      return;
    }
    if (parsed.t === "respawn") {
      if (me.alive || now < me.respawnAt) return;
      me.x = 30 + (me.id % 20) * 4;
      me.z = 30;
      me.heading = 0;
      me.speed = 0;
      me.hearts = 3;
      me.alive = true;
      me.respawnAt = 0;
      me.online = true;
      me.disconnectAt = 0;
      session.spawnAt = now;
      session.victimImmuneUntil = now + SPAWN_SAFE_MS;
      session.lastInputAt = now;
      session.lastInputX = me.x;
      session.lastInputZ = me.z;
      session.lastInputSpeed = 0;
      session.lastInputHeading = 0;
      session.movementStrikes = 0;
      session.joinDeadline = 0;
      this.syncAttachment(ws, session);
      const shieldMs = 8_000;
      sendToAll(this.sessions, { t: "respawned", id: me.id, x: me.x, z: me.z, heading: me.heading, hearts: me.hearts, shieldMs });
      await this.persist();
      this.broadcastSnapshot();
      return;
    }
    if (!me.alive) return;

    if (parsed.t === "input") {
      if (parsed.seq <= session.inputSeq) return;
      const firstInput = session.inputSeq === 0;
      const elapsedMs = session.lastInputAt > 0 ? now - session.lastInputAt : 100;
      if (elapsedMs < 20) return;
      session.inputSeq = parsed.seq;
      if (elapsedMs > MAX_INPUT_GAP_MS) {
        session.lastInputAt = now;
        session.lastInputX = me.x;
        session.lastInputZ = me.z;
        session.lastInputSpeed = me.speed;
        session.lastInputHeading = me.heading;
        this.syncAttachment(ws, session);
        return;
      }
      const elapsed = elapsedMs / 1_000;
      const distance = Math.hypot(parsed.x - session.lastInputX, parsed.z - session.lastInputZ);
      const speedChange = Math.abs(parsed.speed - session.lastInputSpeed);
      const maxDistance = Math.max(1.5, 15 * elapsed + 1.5);
      const maxSpeedChange = MAX_ACCELERATION * elapsed + 2;
      const maxHeadingChange = MAX_TURN_RATE * elapsed + 0.35;
      const invalid =
        distance > maxDistance ||
        (!firstInput && speedChange > maxSpeedChange) ||
        (!firstInput && headingDelta(parsed.heading, session.lastInputHeading) > maxHeadingChange) ||
        parsed.speed > 15 ||
        parsed.speed < -6 ||
        parsed.x < WORLD_MIN_M ||
        parsed.x > WORLD_MAX_M ||
        parsed.z < WORLD_MIN_M ||
        parsed.z > WORLD_MAX_M;
      if (invalid) {
        session.movementStrikes += 1;
        session.lastInputAt = now;
        session.lastInputX = me.x;
        session.lastInputZ = me.z;
        session.lastInputSpeed = me.speed;
        session.lastInputHeading = me.heading;
        this.syncAttachment(ws, session);
        if (session.movementStrikes >= 8) {
          try {
            ws.close(1008, "Movement validation failed");
          } catch {
            // The runtime will finish closing the socket.
          }
        }
        return;
      }
      me.x = parsed.x;
      me.z = parsed.z;
      me.heading = parsed.heading;
      me.speed = parsed.speed;
      session.lastInputAt = now;
      session.lastInputX = parsed.x;
      session.lastInputZ = parsed.z;
      session.lastInputSpeed = parsed.speed;
      session.lastInputHeading = parsed.heading;
      this.syncAttachment(ws, session);
      this.persistSoon();
      return;
    }

    if (now < session.attackerUntil || now < session.victimImmuneUntil) return;
    const victim = this.room.players.get(parsed.victimId);
    if (victim === undefined || victim.id === me.id || !victim.online || !victim.alive || victim.hearts <= 0) return;
    if (now - session.spawnAt < SPAWN_SAFE_MS) return;
    if (!isCutOff(me, victim)) return;

    session.attackerUntil = now + ATTACK_CD_MS;
    this.syncAttachment(ws, session);
    for (const [otherWs, other] of this.sessions) {
      if (other.playerId === victim.id) {
        other.victimImmuneUntil = now + VICTIM_IMMUNE_MS;
        this.syncAttachment(otherWs, other);
      }
    }
    const heartsLeft = Math.max(0, victim.hearts - 1);
    const eliminated = applyHit(this.room, { attackerId: me.id, victimId: victim.id, heartsLeft });
    sendToAll(this.sessions, { t: "hit", hit: { attackerId: me.id, victimId: victim.id, heartsLeft } });
    if (eliminated !== null) sendToAll(this.sessions, { t: "wrecked", ev: eliminated });
    await this.persist();
    this.broadcastSnapshot();
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // The socket may already be closed by the runtime.
    }
    const session = this.sessions.get(ws);
    console.warn(JSON.stringify({ event: "room_socket_closed", roomId: this.room.roomId, code }));
    this.sessions.delete(ws);
    if (session?.playerId !== null && session?.playerId !== undefined) {
      const player = this.room.players.get(session.playerId);
      if (player !== undefined) {
        player.online = false;
        player.disconnectAt = Date.now() + RECONNECT_GRACE_MS;
      }
    }
    if (session?.ticketId) {
      try {
        await lobbyStub(this.env, lobbyShardForRoomId(this.room.roomId)).release(this.room.roomId, session.ticketId);
      } catch (error) {
        console.error(JSON.stringify({ event: "lobby_release_failed", roomId: this.room.roomId, message: error instanceof Error ? error.message : "unknown" }));
      }
    }
    if (this.sessions.size === 0) {
      this.stopTicker();
      await this.scheduleEmptyCleanup();
    }
    await this.persist();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const session = this.sessions.get(ws);
    console.error(JSON.stringify({ event: "room_socket_error", roomId: this.room.roomId }));
    this.sessions.delete(ws);
    if (session?.playerId !== null && session?.playerId !== undefined) {
      const player = this.room.players.get(session.playerId);
      if (player !== undefined) {
        player.online = false;
        player.disconnectAt = Date.now() + RECONNECT_GRACE_MS;
      }
    }
    if (session?.ticketId) {
      try {
        await lobbyStub(this.env, lobbyShardForRoomId(this.room.roomId)).release(this.room.roomId, session.ticketId);
      } catch (error) {
        console.error(JSON.stringify({ event: "lobby_release_failed", roomId: this.room.roomId, message: error instanceof Error ? error.message : "unknown" }));
      }
    }
    if (this.sessions.size === 0) {
      this.stopTicker();
      await this.scheduleEmptyCleanup();
    }
    await this.persist();
  }

  async alarm(): Promise<void> {
    if (this.sessions.size > 0) return;
    await this.ctx.storage.delete("room-state");
    this.room = createRoom("", 7);
    this.nextId = 1;
    this.lastPersistAt = 0;
  }

  private newSession(attachment: RoomAttachment): Session {
    return {
      ticketId: attachment.ticketId,
      playerName: attachment.playerName,
      playerId: attachment.playerId,
      resumeRequested: attachment.resumeRequested,
      lastMessageAt: 0,
      lastSeenAt: attachment.lastSeenAt > 0 ? attachment.lastSeenAt : Date.now(),
      lastLobbyTouchAt: 0,
      attackerUntil: attachment.attackerUntil,
      victimImmuneUntil: attachment.victimImmuneUntil,
      spawnAt: attachment.spawnAt,
      inputSeq: attachment.inputSeq,
      lastInputAt: attachment.lastInputAt,
      lastInputX: attachment.lastInputX,
      lastInputZ: attachment.lastInputZ,
      lastInputSpeed: attachment.lastInputSpeed,
      lastInputHeading: attachment.lastInputHeading,
      movementStrikes: attachment.movementStrikes,
      joinDeadline: attachment.joinDeadline,
    };
  }

  private restoreSession(ws: WebSocket): Session {
    const attachment = normalizeAttachment(ws.deserializeAttachment());
    const session = this.newSession(attachment ?? {
      sessionId: crypto.randomUUID(),
      ticketId: "",
      playerName: "",
      playerId: null,
      resumeRequested: false,
      attackerUntil: 0,
      victimImmuneUntil: 0,
      spawnAt: 0,
      inputSeq: 0,
      lastInputAt: 0,
      lastInputX: 0,
      lastInputZ: 0,
      lastInputSpeed: 0,
      lastInputHeading: 0,
      movementStrikes: 0,
      joinDeadline: 0,
      lastSeenAt: 0,
    });
    this.sessions.set(ws, session);
    this.syncAttachment(ws, session);
    return session;
  }

  private syncAttachment(ws: WebSocket, session: Session): void {
    const current = normalizeAttachment(ws.deserializeAttachment());
    ws.serializeAttachment({
      sessionId: current?.sessionId ?? crypto.randomUUID(),
      ticketId: session.ticketId,
      playerName: session.playerName,
      playerId: session.playerId,
      resumeRequested: session.resumeRequested,
      attackerUntil: session.attackerUntil,
      victimImmuneUntil: session.victimImmuneUntil,
      spawnAt: session.spawnAt,
      inputSeq: session.inputSeq,
      lastInputAt: session.lastInputAt,
      lastInputX: session.lastInputX,
      lastInputZ: session.lastInputZ,
      lastInputSpeed: session.lastInputSpeed,
      lastInputHeading: session.lastInputHeading,
      movementStrikes: session.movementStrikes,
      joinDeadline: session.joinDeadline,
      lastSeenAt: session.lastSeenAt,
    } satisfies RoomAttachment);
  }

  private restore(saved: PersistedRoom): void {
    const restored = createRoom(saved.roomId, saved.seed);
    let largestId = 0;
    for (const player of saved.players) {
      if (!isFiniteNumber(player.id) || !Number.isInteger(player.id)) continue;
      restored.players.set(player.id, {
        ...player,
        alive: player.alive !== false,
        respawnAt: isFiniteNumber(player.respawnAt) ? player.respawnAt : 0,
        online: player.online !== false,
        disconnectAt: isFiniteNumber(player.disconnectAt) ? player.disconnectAt : 0,
      });
      largestId = Math.max(largestId, player.id);
    }
    if (Array.isArray(saved.passengers)) {
      for (const passenger of saved.passengers) {
        if (isPassenger(passenger)) restored.passengers.set(passenger.id, { ...passenger });
      }
    }
    for (const passenger of restored.passengers.values()) {
      if (passenger.ownerId !== null && !restored.players.has(passenger.ownerId)) respawnPassenger(restored, passenger);
    }
    this.room = restored;
    this.nextId = Math.max(1, saved.nextId, largestId + 1);
  }

  private ownedFareCount(playerId: number): number {
    let count = 0;
    for (const passenger of this.room.passengers.values()) if (passenger.ownerId === playerId) count += 1;
    return count;
  }

  private async handlePick(player: PlayerState, pid: string): Promise<void> {
    if (this.ownedFareCount(player.id) >= MAX_FARES || Math.abs(player.speed) > 1) return;
    const passenger = this.room.passengers.get(pid);
    if (passenger === undefined || passenger.ownerId !== null) return;
    if (Math.hypot(player.x - passenger.x, player.z - passenger.z) > PICKUP_RANGE_M) return;
    passenger.ownerId = player.id;
    sendToAll(this.sessions, { t: "passenger", passenger: { ...passenger }, playerId: player.id, cash: player.cash, delivered: player.delivered });
    await this.persist();
  }

  private async handleDrop(player: PlayerState, pid: string): Promise<void> {
    const passenger = this.room.passengers.get(pid);
    if (passenger === undefined || passenger.ownerId !== player.id || Math.abs(player.speed) > 1.5) return;
    if (Math.hypot(player.x - passenger.destX, player.z - passenger.destZ) > DROPOFF_RANGE_M) return;
    const distance = Math.hypot(passenger.destX - passenger.x, passenger.destZ - passenger.z);
    const fare = computeFare(distance, { fast: false, clean: player.hearts === 3 });
    player.cash += fare;
    player.delivered += 1;
    respawnPassenger(this.room, passenger);
    sendToAll(this.sessions, { t: "passenger", passenger: { ...passenger }, playerId: player.id, cash: player.cash, delivered: player.delivered });
    await this.persist();
  }

  private sendPassengers(ws: WebSocket): void {
    send(ws, { t: "passengers", passengers: [...this.room.passengers.values()].map((passenger) => ({ ...passenger })) });
  }

  private cleanupDisconnectedPlayers(now: number): boolean {
    let changed = false;
    for (const [id, player] of this.room.players) {
      if (!player.online && player.disconnectAt > 0 && now >= player.disconnectAt) {
        this.room.players.delete(id);
        for (const passenger of this.room.passengers.values()) {
          if (passenger.ownerId !== id) continue;
          respawnPassenger(this.room, passenger);
        }
        changed = true;
      }
    }
    return changed;
  }

  private broadcastSnapshot(): void {
    this.snapshotTick = (this.snapshotTick + 1) >>> 0;
    sendToAll(this.sessions, makeSnapshot(this.room, this.snapshotTick));
  }

  private ensureTicker(): void {
    if (this.tickTimer !== undefined || this.sessions.size === 0) return;
    this.tickTimer = setInterval(() => {
      const now = Date.now();
      if (this.cleanupDisconnectedPlayers(now)) this.persistSoon();
      for (const [ws, session] of this.sessions) {
        if (session.playerId !== null && session.lastSeenAt > 0 && now - session.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
          try {
            ws.close(1001, "Heartbeat timeout");
          } catch {
            // The runtime will finish closing the socket.
          }
          continue;
        }
        if (session.playerId === null && session.joinDeadline > 0 && now > session.joinDeadline) {
          try {
            ws.close(1008, "Join timeout");
          } catch {
            // The runtime will finish closing the socket.
          }
        }
      }
      this.broadcastSnapshot();
    }, TICK_MS);
  }

  private stopTicker(): void {
    if (this.tickTimer === undefined) return;
    clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }

  private async scheduleEmptyCleanup(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS);
  }

  private persistSoon(): void {
    if (this.persistQueued || Date.now() - this.lastPersistAt < 1_000) return;
    this.persistQueued = true;
    this.lastPersistAt = Date.now();
    void this.persist()
      .catch((error: unknown) => {
        console.error(JSON.stringify({ event: "room_persist_failed", roomId: this.room.roomId, message: error instanceof Error ? error.message : "unknown" }));
      })
      .finally(() => {
        this.persistQueued = false;
      });
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("room-state", {
      version: 1,
      roomId: this.room.roomId,
      seed: this.room.seed,
      nextId: this.nextId,
      players: [...this.room.players.values()].map((player) => ({ ...player })),
      passengers: [...this.room.passengers.values()].map((passenger) => ({ ...passenger })),
    } satisfies PersistedRoom);
  }
}

function apiRoomCode(pathname: string): string | null {
  const match = /^\/api\/rooms\/([^/]+)\/?$/u.exec(pathname);
  if (match === null || match[1] === undefined) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(match[1]).toUpperCase();
  } catch {
    return null;
  }
  return ROOM_CODE_PATTERN.test(decoded) ? decoded : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({ ok: true, service: "tuktuk.io", roomServer: "durable-object", lobby: "named-room-queue+quick-play" }, 200, request, env);
    }
    if (pathname === "/api/ready" && request.method === "GET") {
      try {
        const lobby = await env.LOBBY.getByName(LOBBY_OBJECT_NAME).health();
        const ready = env.ROOM !== undefined && env.ASSETS !== undefined;
        return jsonResponse({ ok: ready, checks: { room: ready, lobby: true, assets: ready }, lobby }, ready ? 200 : 503, request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "readiness_check_failed", message: error instanceof Error ? error.message : "unknown" }));
        return jsonResponse({ ok: false, checks: { room: false, lobby: false, assets: false } }, 503, request, env);
      }
    }
    if (pathname === "/api/lobby/join" && request.method === "POST") {
      const limited = await enforceLobbyRateLimit(request, env, "join");
      if (limited !== null) return limited;
      const body = await readJsonObject(request);
      if (body === null) return jsonResponse({ status: "error", code: "INVALID_ROOM", message: "Expected a JSON request body." }, 400, request, env);
      const mode = body.mode === "quick" ? "quick" : "named";
      const roomName = typeof body.roomName === "string" ? body.roomName : "";
      const requestedShard = typeof body.lobbyId === "string" ? body.lobbyId : undefined;
      const shard = requestedShard === LOBBY_OBJECT_NAME || (requestedShard !== undefined && isLobbyShard(requestedShard))
        ? requestedShard
        : lobbyShardForRequest(roomName, mode, requestRegion(request));
      const result = await lobbyStub(env, shard).join({
        roomName,
        playerName: typeof body.playerName === "string" ? body.playerName : "",
        mode,
        roomIdPrefix: roomIdPrefixForShard(shard),
        ...(typeof body.ticketId === "string" ? { ticketId: body.ticketId } : {}),
      });
      return jsonResponse(withLobbyId(result, shard), result.status === "error" ? 400 : 200, request, env);
    }
    if (pathname === "/api/lobby/poll" && request.method === "POST") {
      const body = await readJsonObject(request);
      const ticketId = body?.ticketId;
      if (typeof ticketId !== "string" || ticketId.length < 16 || ticketId.length > 64) return jsonResponse({ status: "error", code: "TICKET_NOT_FOUND", message: "Missing or invalid ticket." }, 400, request, env);
      const requestedShard = typeof body?.lobbyId === "string" ? body.lobbyId : LOBBY_OBJECT_NAME;
      if (requestedShard !== LOBBY_OBJECT_NAME && !isLobbyShard(requestedShard)) return jsonResponse({ status: "error", code: "TICKET_NOT_FOUND", message: "Invalid lobby shard." }, 400, request, env);
      const limited = await enforceLobbyRateLimit(request, env, `poll:${ticketId}`);
      if (limited !== null) return limited;
      const result = await lobbyStub(env, requestedShard).poll({ ticketId });
      return jsonResponse(withLobbyId(result, requestedShard), result.status === "error" ? 404 : 200, request, env);
    }
    if (pathname === "/api/rooms" && request.method === "POST") {
      // Legacy/simple API: use the same allocator so this route cannot bypass
      // the named-room queue.
      const limited = await enforceLobbyRateLimit(request, env, "join");
      if (limited !== null) return limited;
      const body = (await readJsonObject(request)) ?? {};
      const mode = body.mode === "quick" ? "quick" : "named";
      const roomName = typeof body.roomName === "string" ? body.roomName : "quick";
      const shard = lobbyShardForRequest(roomName, mode, requestRegion(request));
      const result = await lobbyStub(env, shard).join({
        roomName,
        playerName: typeof body.playerName === "string" ? body.playerName : `Tuk${crypto.randomUUID().slice(0, 4)}`,
        mode,
        roomIdPrefix: roomIdPrefixForShard(shard),
      });
      if (result.status === "admitted") {
        return jsonResponse({ ...withLobbyId(result, shard), websocketPath: `/ws/${result.roomId}?ticket=${encodeURIComponent(result.ticketId)}` }, 201, request, env);
      }
      return jsonResponse(withLobbyId(result, shard), result.status === "error" ? 400 : 202, request, env);
    }
    if (pathname.startsWith("/api/rooms/") && request.method === "GET") {
      const roomId = apiRoomCode(pathname);
      return roomId === null ? jsonResponse({ error: "invalid room code" }, 400, request, env) : jsonResponse({ roomId }, 200, request, env);
    }

    const roomId = roomIdFromPath(pathname);
    if (roomId !== null) {
      if (!isWebSocketUpgrade(request)) return new Response("WebSocket upgrade required", { status: 426 });
      if (!isAllowedWebSocketOrigin(request, env)) return new Response("WebSocket origin not allowed", { status: 403 });
      const limited = await enforceLobbyRateLimit(request, env, "ws");
      if (limited !== null) return limited;
      const ticketId = url.searchParams.get("ticket");
      if (ticketId === null || ticketId.length < 16 || ticketId.length > 64) return new Response("A lobby admission ticket is required", { status: 401 });
      const valid = await lobbyStub(env, lobbyShardForRoomId(roomId)).validate(roomId, ticketId);
      if (!valid.ok) return new Response("Invalid or expired admission ticket", { status: 403 });
      return env.ROOM.getByName(roomId).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
