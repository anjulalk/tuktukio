// HTTP lobby client. Admission is obtained before a WebSocket is opened, so
// queued players do not consume room connections.

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
  readonly code: string;
  readonly message: string;
  readonly lobbyId?: string;
}

export type LobbyResponse = AdmittedResponse | QueuedResponse | ActiveResponse | ErrorResponse;

function configuredBase(): string | null {
  const configured = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
  return configured !== undefined && configured.length > 0 ? configured : null;
}

export function lobbyEnabled(): boolean {
  return configuredBase() !== null || !import.meta.env.DEV;
}

function apiUrl(path: string): string {
  const configured = configuredBase();
  if (configured === null) return path;
  const url = new URL(configured);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function post(path: string, body: unknown): Promise<LobbyResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null) throw new Error("Lobby returned an invalid response.");
    const status = (value as { status?: unknown }).status;
    if (status !== "admitted" && status !== "queued" && status !== "active" && status !== "error") {
      throw new Error("Lobby returned an invalid response.");
    }
    return value as LobbyResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function joinNamedRoom(roomName: string, playerName: string, mode: "named" | "quick" = "named", ticketId?: string, lobbyId?: string): Promise<LobbyResponse> {
  return post("/api/lobby/join", { roomName, playerName, mode, ...(ticketId === undefined ? {} : { ticketId }), ...(lobbyId === undefined ? {} : { lobbyId }) });
}

export function pollLobby(ticketId: string, lobbyId?: string): Promise<LobbyResponse> {
  return post("/api/lobby/poll", { ticketId, ...(lobbyId === undefined ? {} : { lobbyId }) });
}

export function randomPlayerName(): string {
  return `Tuk${Math.floor(Math.random() * 9000 + 1000)}`;
}
