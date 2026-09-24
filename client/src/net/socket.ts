// Client net: named-room admission, WebSocket room client, and reconnects.
// The same client works with the local Node server or the Cloudflare Worker.

import { joinNamedRoom, lobbyEnabled, pollLobby, randomPlayerName, type AdmittedResponse, type LobbyResponse } from "./lobby";
import type { ServerMsg } from "../../../shared/protocol";
import type { Passenger, Snapshot } from "../../../shared/types";

export interface Remote {
  id: number;
  tx: number;
  tz: number;
  heading: number;
  hearts: number;
  cash: number;
}

export type LobbyState =
  | { readonly kind: "searching"; readonly roomName: string }
  | { readonly kind: "queued"; readonly roomName: string; readonly position: number; readonly players: number; readonly capacity: number }
  | { readonly kind: "admitted"; readonly roomName: string; readonly players: number; readonly capacity: number }
  | { readonly kind: "error"; readonly message: string };

export interface NetEvents {
  onWelcome(id: number, x: number, z: number, heading: number, speed: number, hearts: number, alive: boolean, respawnAt: number): void;
  onRemotes(remotes: readonly Remote[]): void;
  onHitText(text: string): void;
  onWrecked(victimId: number, killerId: number, iAmVictim: boolean, respawnAt: number): void;
  onHearts(hearts: number): void;
  onRespawned(id: number, x: number, z: number, heading: number, hearts: number, shieldMs: number): void;
  onPassengers(passengers: readonly Passenger[]): void;
  onPassenger(passenger: Passenger, playerId: number, cash: number, delivered: number): void;
  onCash(cash: number, delivered: number): void;
  onLobby?(state: LobbyState): void;
}

export interface NetOptions {
  readonly roomName?: string;
  readonly mode?: "named" | "quick";
}

export interface NetHandle {
  tryCut(victimId: number): void;
  tryPick(pid: string): void;
  tryDrop(pid: string): void;
  tryRespawn(): void;
  pushState(x: number, z: number, heading: number, speed: number): void;
}

const DEFAULT_ROOM = "default";

function roomFromLocation(): string {
  return new URLSearchParams(window.location.search).get("room")?.trim() || DEFAULT_ROOM;
}

function websocketUrl(roomId: string, ticketId: string | null): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
  let endpoint: string;
  if (configured !== undefined && configured.length > 0) {
    const base = configured.replace(/\/+$/u, "");
    endpoint = base.endsWith("/ws") ? `${base}/${encodeURIComponent(roomId)}` : `${base}/ws/${encodeURIComponent(roomId)}`;
  } else if (import.meta.env.DEV) {
    // The local Node fallback has no lobby and uses one fixed development room.
    return "ws://localhost:8081";
  } else {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    endpoint = `${scheme}//${window.location.host}/ws/${encodeURIComponent(roomId)}`;
  }
  if (ticketId === null) return endpoint;
  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticketId)}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSnapshot(value: unknown): value is Snapshot {
  return Array.isArray(value) && value.length === 7 && value.every((entry) => isFiniteNumber(entry));
}

function isPassenger(value: unknown): value is Passenger {
  if (typeof value !== "object" || value === null) return false;
  const passenger = value as Record<string, unknown>;
  return typeof passenger.id === "string" && passenger.id.length <= 16 && isFiniteNumber(passenger.x) && isFiniteNumber(passenger.z) && isFiniteNumber(passenger.destX) && isFiniteNumber(passenger.destZ) && (passenger.ownerId === null || (isFiniteNumber(passenger.ownerId) && Number.isInteger(passenger.ownerId)));
}

function parseServerMessage(data: unknown): ServerMsg | null {
  if (typeof data !== "string") return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== "object" || value === null) return null;
    const message = value as Record<string, unknown>;
    if (message.t === "welcome" && isFiniteNumber(message.id) && Number.isInteger(message.id) && message.id > 0 && isFiniteNumber(message.seed) && typeof message.roomId === "string" && isFiniteNumber(message.x) && isFiniteNumber(message.z) && isFiniteNumber(message.heading) && isFiniteNumber(message.speed) && isFiniteNumber(message.hearts) && typeof message.alive === "boolean" && isFiniteNumber(message.respawnAt) && isFiniteNumber(message.cash) && isFiniteNumber(message.delivered)) return value as ServerMsg;
    if (message.t === "snap" && isFiniteNumber(message.tick) && Array.isArray(message.players) && message.players.length <= 64 && message.players.every(isSnapshot)) return value as ServerMsg;
    if (message.t === "hit" && typeof message.hit === "object" && message.hit !== null) {
      const hit = message.hit as Record<string, unknown>;
      if (isFiniteNumber(hit.attackerId) && isFiniteNumber(hit.victimId) && isFiniteNumber(hit.heartsLeft)) return value as ServerMsg;
    }
    if (message.t === "wrecked" && typeof message.ev === "object" && message.ev !== null) {
      const event = message.ev as Record<string, unknown>;
      if (isFiniteNumber(event.victimId) && isFiniteNumber(event.killerId) && isFiniteNumber(event.cashStolen) && isFiniteNumber(event.respawnAt)) return value as ServerMsg;
    }
    if (message.t === "respawned" && isFiniteNumber(message.id) && isFiniteNumber(message.x) && isFiniteNumber(message.z) && isFiniteNumber(message.heading) && isFiniteNumber(message.hearts) && isFiniteNumber(message.shieldMs)) return value as ServerMsg;
    if (message.t === "passengers" && Array.isArray(message.passengers) && message.passengers.length <= 64 && message.passengers.every(isPassenger)) return value as ServerMsg;
    if (message.t === "passenger" && isPassenger(message.passenger) && isFiniteNumber(message.playerId) && isFiniteNumber(message.cash) && isFiniteNumber(message.delivered)) return value as ServerMsg;
  } catch {
    return null;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function connectNet(ev: NetEvents, options: NetOptions = {}): NetHandle {
  const mode = options.mode === "quick" ? "quick" : "named";
  const roomName = mode === "quick" ? "quick" : options.roomName?.trim() || roomFromLocation();
  const playerName = randomPlayerName();
  const resumeStorageKey = `tuktuk.resume.${mode}:${roomName}`;
  const resumeLobbyStorageKey = `${resumeStorageKey}.lobby`;
  let resumeTicketId: string | null = null;
  let resumeLobbyId: string | null = null;
  try {
    resumeTicketId = window.sessionStorage.getItem(resumeStorageKey);
    resumeLobbyId = window.sessionStorage.getItem(resumeLobbyStorageKey);
  } catch {
    resumeTicketId = null;
    resumeLobbyId = null;
  }
  let ws: WebSocket | null = null;
  let reconnectTimer: number | undefined;
  let reconnectAttempt = 0;
  let connecting = false;
  let stopped = false;
  let myId = -1;
  let myHearts = 3;
  let myCash = 0;
  let myDelivered = 0;
  let lastPush = 0;
  let inputSequence = 0;
  const remotes = new Map<number, Remote>();
  const heartbeatTimer = window.setInterval(() => {
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "ping" }));
  }, 15_000);

  function publishLobby(state: LobbyState): void {
    ev.onLobby?.(state);
  }

  function tryCut(victimId: number): void {
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "cut", victimId }));
  }

  function tryPick(pid: string): void {
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "pick", pid }));
  }

  function tryDrop(pid: string): void {
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "drop", pid }));
  }

  function tryRespawn(): void {
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "respawn" }));
  }

  function pushState(x: number, z: number, heading: number, speed: number): void {
    const now = performance.now();
    if (ws === null || ws.readyState !== WebSocket.OPEN || now - lastPush < 100) return;
    lastPush = now;
    inputSequence += 1;
    ws.send(JSON.stringify({ t: "input", seq: inputSequence, x, z, heading, speed }));
  }

  async function obtainAdmission(): Promise<AdmittedResponse | null> {
    if (!lobbyEnabled()) return null;
    publishLobby({ kind: "searching", roomName });
    let response: LobbyResponse;
    try {
      response = await joinNamedRoom(roomName, playerName, mode, resumeTicketId ?? undefined, resumeLobbyId ?? undefined);
    } catch (error) {
      publishLobby({ kind: "error", message: error instanceof Error ? error.message : "Could not reach the lobby." });
      return null;
    }

    let restarts = 0;
    while (!stopped) {
      if (response.status === "admitted") {
        resumeTicketId = response.ticketId;
        resumeLobbyId = response.lobbyId ?? null;
        try {
          window.sessionStorage.setItem(resumeStorageKey, response.ticketId);
          if (response.lobbyId !== undefined) window.sessionStorage.setItem(resumeLobbyStorageKey, response.lobbyId);
        } catch {
          // Session storage is optional; the in-memory token still works.
        }
        publishLobby({ kind: "admitted", roomName: response.roomName, players: response.players, capacity: response.capacity });
        return response;
      }
      if (response.status === "queued") {
        publishLobby({
          kind: "queued",
          roomName: response.roomName,
          position: response.position,
          players: response.players,
          capacity: response.capacity,
        });
        await delay(response.retryAfterMs + Math.floor(Math.random() * 250));
        if (stopped) return null;
        try {
          response = await pollLobby(response.ticketId, response.lobbyId ?? resumeLobbyId ?? undefined);
        } catch (error) {
          publishLobby({ kind: "error", message: error instanceof Error ? error.message : "Lost contact with the lobby." });
          return null;
        }
        continue;
      }
      if (response.status === "active") {
        await delay(750);
        try {
          response = await pollLobby(response.ticketId, response.lobbyId ?? resumeLobbyId ?? undefined);
        } catch {
          return null;
        }
        continue;
      }

      if ((response.code === "TICKET_EXPIRED" || response.code === "TICKET_NOT_FOUND") && restarts < 1) {
        restarts += 1;
        resumeTicketId = null;
        resumeLobbyId = null;
        try {
          window.sessionStorage.removeItem(resumeStorageKey);
          window.sessionStorage.removeItem(resumeLobbyStorageKey);
        } catch {
          // Session storage is optional.
        }
        try {
          response = await joinNamedRoom(roomName, playerName, mode, resumeTicketId ?? undefined, resumeLobbyId ?? undefined);
        } catch (error) {
          publishLobby({ kind: "error", message: error instanceof Error ? error.message : "Could not rejoin the lobby." });
        }
        continue;
      }
      publishLobby({ kind: "error", message: response.message });
      return null;
    }
    return null;
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer !== undefined) return;
    if (reconnectAttempt >= 12) {
      publishLobby({ kind: "error", message: "Connection lost. Please refresh to rejoin." });
      stopped = true;
      return;
    }
    const wait = Math.min(5_000, 500 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, wait);
  }

  function openSocket(admission: AdmittedResponse | null): void {
    const ticketId = admission?.ticketId ?? null;
    const roomId = admission?.roomId ?? roomName;
    const endpoint = websocketUrl(roomId, ticketId);
    try {
      ws = new WebSocket(endpoint);
    } catch {
      ws = null;
      scheduleReconnect();
      return;
    }

    ws.onopen = (): void => {
      reconnectAttempt = 0;
      ws?.send(JSON.stringify({ t: "join", name: admission?.playerName ?? playerName }));
    };
    ws.onmessage = (event: MessageEvent): void => {
      const msg = parseServerMessage(event.data);
      if (msg === null) return;
      if (msg.t === "welcome") {
        myId = msg.id;
        myHearts = msg.hearts;
        myCash = msg.cash;
        myDelivered = msg.delivered;
        ev.onWelcome(myId, msg.x, msg.z, msg.heading, msg.speed, msg.hearts, msg.alive, msg.respawnAt);
        ev.onCash(msg.cash, msg.delivered);
      } else if (msg.t === "snap") {
        const list: Remote[] = [];
        const seen = new Set<number>();
        for (const s of msg.players as readonly Snapshot[]) {
          const [id, x, z, h, , cash, hearts] = s;
          seen.add(id);
          if (id === myId) {
            if (hearts !== myHearts) {
              myHearts = hearts;
              ev.onHearts(hearts);
            }
            if (cash !== myCash) {
              myCash = cash;
              ev.onCash(cash, myDelivered);
            }
            continue;
          }
          const prev = remotes.get(id);
          if (prev === undefined) remotes.set(id, { id, tx: x, tz: z, heading: h, hearts, cash });
          else {
            prev.tx = x;
            prev.tz = z;
            prev.heading = h;
            prev.hearts = hearts;
            prev.cash = cash;
          }
          const remote = remotes.get(id);
          if (remote !== undefined) list.push(remote);
        }
        for (const id of remotes.keys()) if (!seen.has(id)) remotes.delete(id);
        ev.onRemotes(list);
      } else if (msg.t === "hit") {
        ev.onHitText(msg.hit.attackerId === myId ? `Cut! victim ♥${msg.hit.heartsLeft}` : `Hit: ${msg.hit.attackerId}→${msg.hit.victimId}`);
      } else if (msg.t === "wrecked") {
        ev.onWrecked(msg.ev.victimId, msg.ev.killerId, msg.ev.victimId === myId, msg.ev.respawnAt);
      } else if (msg.t === "respawned") {
        ev.onRespawned(msg.id, msg.x, msg.z, msg.heading, msg.hearts, msg.shieldMs);
      } else if (msg.t === "passengers") {
        ev.onPassengers(msg.passengers);
      } else if (msg.t === "passenger") {
        ev.onPassenger(msg.passenger, msg.playerId, msg.cash, msg.delivered);
      }
    };
    ws.onerror = (): void => {
      ws?.close();
    };
    ws.onclose = (event: CloseEvent): void => {
      ws = null;
      if (event.code === 1008 || event.code === 1009 || event.code === 1013) {
        publishLobby({ kind: "error", message: event.code === 1009 ? "The server rejected an oversized message." : "The server rejected the connection." });
        stopped = true;
        return;
      }
      scheduleReconnect();
    };
  }

  async function connect(): Promise<void> {
    if (stopped || connecting || ws !== null) return;
    connecting = true;
    try {
      const admission = await obtainAdmission();
      if (stopped || (admission === null && lobbyEnabled())) return;
      openSocket(admission);
    } finally {
      connecting = false;
    }
  }

  window.addEventListener("beforeunload", () => {
    stopped = true;
    window.clearInterval(heartbeatTimer);
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
  });
  void connect();

  return { tryCut, tryPick, tryDrop, tryRespawn, pushState };
}
