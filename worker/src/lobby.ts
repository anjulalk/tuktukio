import { DurableObject } from "cloudflare:workers";

export const LOBBY_OBJECT_NAME = "global";
export const LOBBY_SHARD_COUNT = 8;
export const ROOM_CAPACITY = 20;

const RESERVATION_TTL_MS = 30_000;
const WAITING_TTL_MS = 5 * 60_000;
const ACTIVE_TTL_MS = 5 * 60_000;
const QUEUE_RETRY_MS = 1_500;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ROOMS = 500;
const MAX_QUEUE_PER_ROOM = 100;
const ROOM_IDLE_TTL_MS = 60 * 60_000;
export const RECONNECT_GRACE_MS = 30_000;

type TicketStatus = "waiting" | "reserved" | "active" | "grace";

interface Ticket {
  readonly id: string;
  readonly roomId: string;
  readonly roomName: string;
  readonly playerName: string;
  playerId: number | null;
  status: TicketStatus;
  readonly createdAt: number;
  expiresAt: number;
}

interface RoomRecord {
  readonly roomId: string;
  readonly roomName: string;
  readonly mode: "named" | "quick";
  readonly capacity: number;
  connected: number;
  reserved: number;
  lastActivityAt: number;
}

interface LobbyState {
  readonly version: 1;
  readonly rooms: RoomRecord[];
  readonly tickets: Record<string, Ticket>;
  readonly waiters: Record<string, string[]>;
}

export interface LobbyJoinInput {
  readonly roomName: string;
  readonly playerName: string;
  readonly mode?: "named" | "quick";
  readonly roomIdPrefix?: string;
  readonly ticketId?: string;
}

export interface LobbyPollInput {
  readonly ticketId: string;
}

export interface AdmittedResponse {
  readonly status: "admitted";
  readonly ticketId: string;
  readonly roomId: string;
  readonly roomName: string;
  readonly playerName: string;
  readonly expiresAt: number;
  readonly players: number;
  readonly capacity: number;
  readonly lobbyId?: string;
}

export interface QueuedResponse {
  readonly status: "queued";
  readonly ticketId: string;
  readonly roomName: string;
  readonly position: number;
  readonly retryAfterMs: number;
  readonly players: number;
  readonly capacity: number;
  readonly lobbyId?: string;
}

export interface ActiveResponse {
  readonly status: "active";
  readonly ticketId: string;
  readonly roomId: string;
  readonly lobbyId?: string;
}

export interface ErrorResponse {
  readonly status: "error";
  readonly code: "INVALID_ROOM" | "INVALID_PLAYER" | "TICKET_NOT_FOUND" | "TICKET_EXPIRED" | "SERVER_BUSY";
  readonly message: string;
  readonly lobbyId?: string;
}

export type LobbyResponse = AdmittedResponse | QueuedResponse | ActiveResponse | ErrorResponse;

export interface ConsumeResponse {
  readonly ok: boolean;
  readonly playerName?: string;
  readonly roomName?: string;
  readonly playerId?: number;
  readonly resumed?: boolean;
}

export type LobbyEnv = Record<string, never>;

function emptyState(): LobbyState {
  return { version: 1, rooms: [], tickets: {}, waiters: {} };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRoomRecord(value: unknown): value is RoomRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { roomId?: unknown; roomName?: unknown; mode?: unknown; capacity?: unknown; connected?: unknown; reserved?: unknown; lastActivityAt?: unknown };
  return (
    typeof candidate.roomId === "string" &&
    typeof candidate.roomName === "string" &&
    (candidate.mode === undefined || candidate.mode === "named" || candidate.mode === "quick") &&
    isFiniteNumber(candidate.capacity) &&
    isFiniteNumber(candidate.connected) &&
    (candidate.reserved === undefined || isFiniteNumber(candidate.reserved)) &&
    isFiniteNumber(candidate.lastActivityAt)
  );
}

function isLobbyState(value: unknown): value is LobbyState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; rooms?: unknown; tickets?: unknown; waiters?: unknown };
  if (candidate.version !== undefined && candidate.version !== 1) return false;
  if (!Array.isArray(candidate.rooms) || typeof candidate.tickets !== "object" || candidate.tickets === null || typeof candidate.waiters !== "object" || candidate.waiters === null) return false;
  if (!candidate.rooms.every((room) => isRoomRecord(room))) return false;
  const tickets = candidate.tickets as Record<string, unknown>;
  if (Object.values(tickets).some((ticket) => !isTicket(ticket))) return false;
  const waiters = candidate.waiters as Record<string, unknown>;
  return Object.values(waiters).every((queue) => Array.isArray(queue) && queue.every((ticketId) => typeof ticketId === "string"));
}

export function normalizeRoomName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, "-").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 24);
  return normalized.length >= 2 ? normalized : null;
}

function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 12);
  return normalized.length > 0 ? normalized : null;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function lobbyShardForRequest(roomName: string, mode: "named" | "quick", region: string): string {
  const key = mode === "quick" ? `quick:${region || "global"}` : `named:${normalizeRoomName(roomName) ?? roomName.trim().toLowerCase()}`;
  const index = hashString(key) % LOBBY_SHARD_COUNT;
  return `${mode === "quick" ? "q" : "n"}${index}`;
}

export function isLobbyShard(value: string): boolean {
  return /^[nq][0-7]$/u.test(value);
}

export function lobbyObjectNameForShard(shard: string): string {
  return isLobbyShard(shard) ? `lobby-${shard}` : LOBBY_OBJECT_NAME;
}

export function roomIdPrefixForShard(shard: string): string {
  return isLobbyShard(shard) ? `${shard.toUpperCase()}-` : "";
}

export function lobbyShardForRoomId(roomId: string): string {
  const match = /^([NQ][0-7])-/u.exec(roomId.toUpperCase());
  return match?.[1]?.toLowerCase() ?? LOBBY_OBJECT_NAME;
}

function randomId(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = "";
  for (const byte of bytes) result += ROOM_ALPHABET.charAt(byte % ROOM_ALPHABET.length);
  return result;
}

function isTicket(value: unknown): value is Ticket {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; roomId?: unknown; roomName?: unknown; playerName?: unknown; playerId?: unknown; status?: unknown; createdAt?: unknown; expiresAt?: unknown };
  return (
    typeof candidate.id === "string" &&
    typeof candidate.roomId === "string" &&
    typeof candidate.roomName === "string" &&
    typeof candidate.playerName === "string" &&
    (candidate.playerId === null || candidate.playerId === undefined || (isFiniteNumber(candidate.playerId) && Number.isInteger(candidate.playerId))) &&
    (candidate.status === "waiting" || candidate.status === "reserved" || candidate.status === "active" || candidate.status === "grace") &&
    isFiniteNumber(candidate.createdAt) &&
    isFiniteNumber(candidate.expiresAt)
  );
}

/**
 * Allocation and wait queue for named rooms. All reservations for all rooms
 * are serialized through this one object, so two players cannot claim the
 * same final slot. Room Durable Objects consume/release their tickets when a
 * WebSocket connects or disconnects.
 */
export class TukTukLobby extends DurableObject<LobbyEnv> {
  private state: LobbyState = emptyState();
  private lastTouchPersistAt = 0;

  constructor(ctx: DurableObjectState, env: LobbyEnv) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<unknown>("lobby-state");
      if (isLobbyState(saved)) {
        this.state = { ...saved, version: 1 };
        this.rebuildReservationCounters();
      }
      await this.scheduleCleanupAlarm();
    });
  }

  async join(input: LobbyJoinInput): Promise<LobbyResponse> {
    const now = Date.now();
    const cleaned = this.cleanup(now);
    if (cleaned) await this.persist();
    if (input.ticketId !== undefined) return this.ticketResponse(input.ticketId, now);

    const mode = input.mode === "quick" ? "quick" : "named";
    const roomName = mode === "quick" ? "quick" : normalizeRoomName(input.roomName);
    if (roomName === null) {
      return { status: "error", code: "INVALID_ROOM", message: "Room names must be 2-24 letters, numbers, spaces, - or _." };
    }
    const playerName = normalizePlayerName(input.playerName);
    if (playerName === null) {
      return { status: "error", code: "INVALID_PLAYER", message: "Enter a valid player name." };
    }

    this.promoteAvailable(now);
    let room: RoomRecord | undefined;
    if (mode === "quick") {
      // Quick Play consolidates into the first open public room. If that room
      // is full, create another public room instead of making random players
      // wait behind a named room's queue.
      room = this.state.rooms.find((candidate) => candidate.mode === "quick" && this.available(candidate) > 0);
    } else {
      room = this.state.rooms.find((candidate) => candidate.mode !== "quick" && candidate.roomName === roomName);
    }
    if (room === undefined) {
      if (this.state.rooms.length >= MAX_ROOMS) {
        return { status: "error", code: "SERVER_BUSY", message: "The lobby is full. Please try again shortly." };
      }
      room = {
        roomId: `${input.roomIdPrefix ?? ""}${randomId(8)}`,
        roomName,
        mode,
        capacity: ROOM_CAPACITY,
        connected: 0,
        reserved: 0,
        lastActivityAt: now,
      };
      this.state.rooms.push(room);
    }

    if (mode === "quick") return this.reserve(room, playerName, now);
    const waiters = this.state.waiters[room.roomId] ?? [];
    if (waiters.length > 0 || this.available(room) <= 0) return this.enqueue(room, playerName, now);
    return this.reserve(room, playerName, now);
  }

  async health(): Promise<{ rooms: number; tickets: number }> {
    return { rooms: this.state.rooms.length, tickets: Object.keys(this.state.tickets).length };
  }

  async poll(input: LobbyPollInput): Promise<LobbyResponse> {
    const now = Date.now();
    if (this.cleanup(now)) await this.persist();
    return this.ticketResponse(input.ticketId, now);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    if (this.cleanup(now)) await this.persist();
    else await this.scheduleCleanupAlarm();
  }

  async validate(roomId: string, ticketId: string): Promise<{ ok: boolean }> {
    const now = Date.now();
    if (this.cleanup(now)) await this.persist();
    const ticket = this.state.tickets[ticketId];
    const room = this.state.rooms.find((candidate) => candidate.roomId === roomId);
    return { ok: ticket !== undefined && room !== undefined && ticket.roomId === roomId && (ticket.status === "reserved" || ticket.status === "grace") && ticket.expiresAt > now };
  }

  async attachPlayer(roomId: string, ticketId: string, playerId: number): Promise<{ ok: boolean }> {
    const ticket = this.state.tickets[ticketId];
    const room = this.state.rooms.find((candidate) => candidate.roomId === roomId);
    if (ticket === undefined || room === undefined || ticket.roomId !== roomId || ticket.status !== "active") return { ok: false };
    ticket.playerId = playerId;
    await this.persist();
    return { ok: true };
  }

  async consume(roomId: string, ticketId: string): Promise<ConsumeResponse> {
    const now = Date.now();
    const cleaned = this.cleanup(now);
    if (cleaned) await this.persist();
    const ticket = this.state.tickets[ticketId];
    const room = this.state.rooms.find((candidate) => candidate.roomId === roomId);
    if (ticket === undefined || room === undefined || ticket.roomId !== roomId) return { ok: false };
    if (ticket.status === "waiting") return { ok: false };
    if (ticket.status === "active") return { ok: false };
    if (ticket.expiresAt <= now) {
      if (ticket.status === "reserved") room.reserved = Math.max(0, room.reserved - 1);
      if (ticket.status === "grace") room.connected = Math.max(0, room.connected - 1);
      delete this.state.tickets[ticketId];
      await this.persist();
      return { ok: false };
    }

    const resumed = ticket.status === "grace";
    ticket.status = "active";
    ticket.expiresAt = now + ACTIVE_TTL_MS;
    if (!resumed) {
      room.reserved = Math.max(0, room.reserved - 1);
      room.connected += 1;
    }
    room.lastActivityAt = now;
    await this.persist();
    return { ok: true, playerName: ticket.playerName, roomName: ticket.roomName, ...(ticket.playerId === null || ticket.playerId === undefined ? {} : { playerId: ticket.playerId }), resumed };
  }

  async release(roomId: string, ticketId: string, holdForReconnect = true): Promise<{ ok: boolean }> {
    const now = Date.now();
    const cleaned = this.cleanup(now);
    if (cleaned) await this.persist();
    const ticket = this.state.tickets[ticketId];
    const room = this.state.rooms.find((candidate) => candidate.roomId === roomId);
    if (ticket === undefined || room === undefined || ticket.roomId !== roomId) return { ok: false };

    const waiters = this.state.waiters[room.roomId];
    if (waiters !== undefined) {
      const index = waiters.indexOf(ticketId);
      if (index >= 0) waiters.splice(index, 1);
    }
    if (ticket.status === "active" && holdForReconnect) {
      // Hold the room slot during a short reconnect grace window.
      ticket.status = "grace";
      ticket.expiresAt = now + RECONNECT_GRACE_MS;
      room.lastActivityAt = now;
      await this.persist();
      return { ok: true };
    }
    if (ticket.status === "active" || ticket.status === "grace") room.connected = Math.max(0, room.connected - 1);
    if (ticket.status === "reserved") room.reserved = Math.max(0, room.reserved - 1);
    delete this.state.tickets[ticketId];
    room.lastActivityAt = now;
    this.promoteAvailable(now);
    await this.persist();
    return { ok: true };
  }

  async touch(roomId: string, ticketId: string): Promise<{ ok: boolean }> {
    const now = Date.now();
    const cleaned = this.cleanup(now);
    if (cleaned) await this.persist();
    const ticket = this.state.tickets[ticketId];
    if (ticket === undefined || ticket.roomId !== roomId || ticket.status !== "active") return { ok: false };
    ticket.expiresAt = now + ACTIVE_TTL_MS;
    if (now - this.lastTouchPersistAt >= 30_000) {
      this.lastTouchPersistAt = now;
      await this.persist();
    }
    return { ok: true };
  }

  private available(room: RoomRecord): number {
    return Math.max(0, room.capacity - room.connected - room.reserved);
  }

  private async enqueue(room: RoomRecord, playerName: string, now: number): Promise<LobbyResponse> {
    const currentWaiters = this.state.waiters[room.roomId] ?? [];
    if (currentWaiters.length >= MAX_QUEUE_PER_ROOM) return { status: "error", code: "SERVER_BUSY", message: "This room's waitroom is full. Please try again shortly." };
    const ticket: Ticket = {
      id: crypto.randomUUID(),
      roomId: room.roomId,
      roomName: room.roomName,
      playerName,
      playerId: null,
      status: "waiting",
      createdAt: now,
      expiresAt: now + WAITING_TTL_MS,
    };
    this.state.tickets[ticket.id] = ticket;
    const waiters = this.state.waiters[room.roomId] ?? [];
    waiters.push(ticket.id);
    this.state.waiters[room.roomId] = waiters;
    await this.persist();
    return this.queuedResponse(ticket, waiters.length, room);
  }

  private async reserve(room: RoomRecord, playerName: string, now: number): Promise<LobbyResponse> {
    const ticket: Ticket = {
      id: crypto.randomUUID(),
      roomId: room.roomId,
      roomName: room.roomName,
      playerName,
      playerId: null,
      status: "reserved",
      createdAt: now,
      expiresAt: now + RESERVATION_TTL_MS,
    };
    this.state.tickets[ticket.id] = ticket;
    room.reserved += 1;
    room.lastActivityAt = now;
    await this.persist();
    return this.admittedResponse(ticket, room);
  }

  private promoteAvailable(now: number): void {
    for (const room of this.state.rooms) {
      const waiters = this.state.waiters[room.roomId];
      if (waiters === undefined || waiters.length === 0) continue;
      while (waiters.length > 0 && this.available(room) > 0) {
        const ticketId = waiters.shift();
        if (ticketId === undefined) break;
        const ticket = this.state.tickets[ticketId];
        if (ticket === undefined || ticket.status !== "waiting") continue;
        ticket.status = "reserved";
        ticket.expiresAt = now + RESERVATION_TTL_MS;
        room.reserved += 1;
      }
      if (waiters.length === 0) delete this.state.waiters[room.roomId];
    }
  }

  private cleanup(now: number): boolean {
    let changed = false;
    for (const room of this.state.rooms) {
      const waiters = this.state.waiters[room.roomId];
      if (waiters === undefined) continue;
      for (let index = waiters.length - 1; index >= 0; index--) {
        const ticketId = waiters[index];
        const ticket = ticketId === undefined ? undefined : this.state.tickets[ticketId];
        if (ticket === undefined || ticket.status !== "waiting" || ticket.expiresAt <= now) {
          if (ticketId !== undefined) {
            waiters.splice(index, 1);
            if (ticket !== undefined) delete this.state.tickets[ticketId];
            changed = true;
          }
        }
      }
      if (waiters.length === 0) delete this.state.waiters[room.roomId];
    }

    for (const [ticketId, ticket] of Object.entries(this.state.tickets)) {
      if (ticket.expiresAt > now) continue;
      const room = this.state.rooms.find((candidate) => candidate.roomId === ticket.roomId);
      if (room !== undefined) {
        if (ticket.status === "active" || ticket.status === "grace") room.connected = Math.max(0, room.connected - 1);
        if (ticket.status === "reserved") room.reserved = Math.max(0, room.reserved - 1);
      }
      delete this.state.tickets[ticketId];
      changed = true;
    }

    const activeRoomIds = new Set(Object.values(this.state.tickets).map((ticket) => ticket.roomId));
    for (let index = this.state.rooms.length - 1; index >= 0; index--) {
      const room = this.state.rooms[index];
      if (room === undefined || activeRoomIds.has(room.roomId) || room.connected > 0 || room.reserved > 0) continue;
      if (now - room.lastActivityAt <= ROOM_IDLE_TTL_MS) continue;
      this.state.rooms.splice(index, 1);
      delete this.state.waiters[room.roomId];
      changed = true;
    }
    if (changed) this.promoteAvailable(now);
    return changed;
  }

  private ticketResponse(ticketId: string, now: number): LobbyResponse {
    const ticket = this.state.tickets[ticketId];
    if (ticket === undefined) return { status: "error", code: "TICKET_NOT_FOUND", message: "Your place expired. Please try again." };
    if (ticket.expiresAt <= now && ticket.status !== "active") {
      delete this.state.tickets[ticketId];
      return { status: "error", code: "TICKET_EXPIRED", message: "Your place expired. Please try again." };
    }
    const room = this.state.rooms.find((candidate) => candidate.roomId === ticket.roomId);
    if (room === undefined) return { status: "error", code: "TICKET_NOT_FOUND", message: "Room no longer exists." };
    if (ticket.status === "waiting") {
      const waiters = this.state.waiters[room.roomId] ?? [];
      return this.queuedResponse(ticket, Math.max(1, waiters.indexOf(ticket.id) + 1), room);
    }
    if (ticket.status === "active") return { status: "active", ticketId: ticket.id, roomId: ticket.roomId };
    return this.admittedResponse(ticket, room);
  }

  private admittedResponse(ticket: Ticket, room: RoomRecord): AdmittedResponse {
    return {
      status: "admitted",
      ticketId: ticket.id,
      roomId: room.roomId,
      roomName: room.roomName,
      playerName: ticket.playerName,
      expiresAt: ticket.expiresAt,
      players: room.connected,
      capacity: room.capacity,
    };
  }

  private queuedResponse(ticket: Ticket, position: number, room: RoomRecord): QueuedResponse {
    return {
      status: "queued",
      ticketId: ticket.id,
      roomName: room.roomName,
      position,
      retryAfterMs: QUEUE_RETRY_MS,
      players: room.connected,
      capacity: room.capacity,
    };
  }

  private rebuildReservationCounters(): void {
    const counts = new Map<string, number>();
    for (const ticket of Object.values(this.state.tickets)) {
      if (ticket.status !== "reserved") continue;
      counts.set(ticket.roomId, (counts.get(ticket.roomId) ?? 0) + 1);
    }
    for (const room of this.state.rooms) {
      room.reserved = counts.get(room.roomId) ?? 0;
      room.connected = Math.max(0, Math.min(room.capacity, room.connected));
    }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("lobby-state", this.state);
    await this.scheduleCleanupAlarm();
  }

  private async scheduleCleanupAlarm(): Promise<void> {
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const ticket of Object.values(this.state.tickets)) nextExpiry = Math.min(nextExpiry, ticket.expiresAt);
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (nextExpiry === Number.POSITIVE_INFINITY) {
      if (currentAlarm !== null) await this.ctx.storage.deleteAlarm();
      return;
    }
    const target = Math.max(Date.now() + 1_000, nextExpiry);
    if (currentAlarm === null || target < currentAlarm) await this.ctx.storage.setAlarm(target);
  }
}
