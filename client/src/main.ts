// Offline vertical slice: drive + seeded city + toon cam + pick/drop (US-02/30/32/10/11).
// Strict TS: no `any`, explicit types, pure logic in shared/.

import * as THREE from "three";
import { buildRoadGraph, type RoadGraph } from "./city/roadGraph";
import { gearOf, stepTuk, type DriveInput, type TukState } from "./drive/tuk";
import { computeFare } from "../../shared/fare";
import type { Passenger } from "../../shared/types";
import { mulberry32 } from "../../shared/prng";
import { connectNet, type LobbyState, type NetHandle, type Remote } from "./net/socket";

interface Fare {
  readonly pid: string;
  readonly destX: number;
  readonly destZ: number;
  readonly pickupDist: number;
}

const SEED = 7;
const graph: RoadGraph = buildRoadGraph(SEED);

const app: HTMLElement | null = document.getElementById("app");
const hud: HTMLElement | null = document.getElementById("hud");
const hint: HTMLElement | null = document.getElementById("hint");
const mmapEl: HTMLElement | null = document.getElementById("minimap");
if (app === null || hud === null || hint === null || mmapEl === null) {
  throw new Error("missing DOM nodes");
}
if (!(mmapEl instanceof HTMLCanvasElement)) throw new Error("minimap not a canvas");
const mmap: HTMLCanvasElement = mmapEl;
const mapCtxRaw: CanvasRenderingContext2D | null = mmap.getContext("2d");
if (mapCtxRaw === null) throw new Error("no 2d context");
const hintEl: HTMLElement = hint;
const mapCtx: CanvasRenderingContext2D = mapCtxRaw;
const lobbyEl: HTMLElement | null = document.getElementById("lobby");
const roomFormEl: HTMLElement | null = document.getElementById("roomForm");
const roomNameEl: HTMLElement | null = document.getElementById("roomName");
const joinRoomEl: HTMLElement | null = document.getElementById("joinRoom");
const quickPlayEl: HTMLElement | null = document.getElementById("quickPlay");
const lobbyStatusEl: HTMLElement | null = document.getElementById("lobbyStatus");
const cashValueEl: HTMLElement | null = document.getElementById("cashValue");
const tripValueEl: HTMLElement | null = document.getElementById("tripValue");
const aboardValueEl: HTMLElement | null = document.getElementById("aboardValue");
const heartsValueEl: HTMLElement | null = document.getElementById("heartsValue");
const roomBadgeEl: HTMLElement | null = document.getElementById("roomBadge");
if (
  lobbyEl === null ||
  !(roomFormEl instanceof HTMLFormElement) ||
  !(roomNameEl instanceof HTMLInputElement) ||
  !(joinRoomEl instanceof HTMLButtonElement) ||
  !(quickPlayEl instanceof HTMLButtonElement) ||
  lobbyStatusEl === null ||
  cashValueEl === null ||
  tripValueEl === null ||
  aboardValueEl === null ||
  heartsValueEl === null ||
  roomBadgeEl === null
) {
  throw new Error("missing game UI nodes");
}
const lobby: HTMLElement = lobbyEl;
const roomForm: HTMLFormElement = roomFormEl;
const roomName: HTMLInputElement = roomNameEl;
const joinRoom: HTMLButtonElement = joinRoomEl;
const quickPlay: HTMLButtonElement = quickPlayEl;
const lobbyStatus: HTMLElement = lobbyStatusEl;
const cashValue: HTMLElement = cashValueEl;
const tripValue: HTMLElement = tripValueEl;
const aboardValue: HTMLElement = aboardValueEl;
const heartsValue: HTMLElement = heartsValueEl;
const roomBadge: HTMLElement = roomBadgeEl;
const query = new URLSearchParams(window.location.search);
const requestedRoom = query.get("room")?.trim();
const requestedMode: "named" | "quick" = query.get("mode") === "quick" ? "quick" : "named";
if (requestedRoom !== undefined && requestedRoom.length > 0) roomName.value = requestedRoom;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
let pixelRatio = Math.min(window.devicePixelRatio, 1.5); // NFR-06
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78b9d0);

const hemi = new THREE.HemisphereLight(0xd9f5ff, 0x315c58, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe4b5, 1.45);
sun.position.set(220, 180, -80); // east-ish, consistent with skybox sun + north=-Z
scene.add(sun);
const fill = new THREE.DirectionalLight(0x74c9d2, 0.28);
fill.position.set(-180, 90, 160);
scene.add(fill);

// 8px toon gradient (2-tone cell shade)
const gradient = new Uint8Array(4);
gradient[0] = 120;
gradient[1] = 200;
gradient[2] = 255;
gradient[3] = 255;
const gradientMap = new THREE.DataTexture(gradient, 4, 1, THREE.RedFormat);
gradientMap.needsUpdate = true;
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;

function toon(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap });
}

// Environment kit: sky respects north (-Z), roads/pavements share the graph
// with the minimap, buildings have 4 windowed types, barriers block exits.
import { buildBarriers, buildBuildings, buildGround, buildRoads, buildSky, buildStreetDetails } from "./env/assets";
import { People } from "./env/people";
buildSky(scene, graph.world);
buildGround(scene, toon, graph.world);
buildRoads(scene, toon, graph);
buildBuildings(scene, gradientMap, graph, SEED);
const bounds = buildBarriers(scene, toon, graph);
buildStreetDetails(scene, toon, graph, SEED);
const people = new People(scene, graph, SEED, gradientMap);

// Tuk: a small layered silhouette reads much better than a single box while
// keeping the local player to one low-cost group of meshes.
const tukPaint = toon(0xffb52e);
const tukPaintLight = toon(0xffd66b);
const tukDark = toon(0x183b4a);
const tukGlass = new THREE.MeshToonMaterial({ color: 0x8bd3d6, gradientMap });
const tukTyre = toon(0x17252b);
const tukChrome = new THREE.MeshBasicMaterial({ color: 0xffdf8a });
const tukTail = new THREE.MeshBasicMaterial({ color: 0xff655d });
const tukBodyGeo = new THREE.BoxGeometry(2.25, 0.9, 3.5);
const tukUnderGeo = new THREE.BoxGeometry(2.0, 0.35, 2.9);
const tukHoodGeo = new THREE.BoxGeometry(2.05, 0.45, 1.25);
const tukCabinGeo = new THREE.BoxGeometry(1.9, 1.1, 1.75);
const tukRoofGeo = new THREE.BoxGeometry(2.15, 0.18, 1.95);
const tukGlassGeo = new THREE.BoxGeometry(1.62, 0.62, 0.06);
const tukBumperGeo = new THREE.BoxGeometry(2.35, 0.18, 0.22);
const tukWheelGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.3, 10);
tukWheelGeo.rotateZ(Math.PI / 2);
const tukHubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.32, 8);
tukHubGeo.rotateZ(Math.PI / 2);
const tukLightGeo = new THREE.SphereGeometry(0.16, 8, 6);

function createTukModel(paint: THREE.Material, detailed: boolean): THREE.Group {
  const model = new THREE.Group();
  const body = new THREE.Mesh(tukBodyGeo, paint);
  body.position.y = 0.82;
  model.add(body);
  if (!detailed) {
    const undercarriage = new THREE.Mesh(tukUnderGeo, tukDark);
    undercarriage.position.y = 0.43;
    const cabin = new THREE.Mesh(tukCabinGeo, tukDark);
    cabin.position.set(0, 1.72, -0.35);
    const roof = new THREE.Mesh(tukRoofGeo, paint);
    roof.position.set(0, 2.3, -0.35);
    model.add(undercarriage, cabin, roof);
    return model;
  }

  const hood = new THREE.Mesh(tukHoodGeo, tukPaintLight);
  hood.position.set(0, 1.25, 1.08);
  const cabin = new THREE.Mesh(tukCabinGeo, tukDark);
  cabin.position.set(0, 1.75, -0.35);
  const roof = new THREE.Mesh(tukRoofGeo, paint);
  roof.position.set(0, 2.35, -0.35);
  const frontGlass = new THREE.Mesh(tukGlassGeo, tukGlass);
  frontGlass.position.set(0, 1.82, 0.56);
  const rearGlass = new THREE.Mesh(tukGlassGeo, tukGlass);
  rearGlass.position.set(0, 1.82, -1.26);
  const frontBar = new THREE.Mesh(tukBumperGeo, tukChrome);
  frontBar.position.set(0, 0.67, 1.79);
  const rearBar = new THREE.Mesh(tukBumperGeo, tukTail);
  rearBar.position.set(0, 0.67, -1.79);
  model.add(hood, cabin, roof, frontGlass, rearGlass, frontBar, rearBar);

  for (const x of [-1.12, 1.12]) {
    for (const z of [-1.08, 1.08]) {
      const wheel = new THREE.Mesh(tukWheelGeo, tukTyre);
      wheel.position.set(x, 0.43, z);
      const hub = new THREE.Mesh(tukHubGeo, tukChrome);
      hub.position.copy(wheel.position);
      model.add(wheel, hub);
    }
  }
  for (const x of [-0.7, 0.7]) {
    const headlight = new THREE.Mesh(tukLightGeo, tukChrome);
    headlight.position.set(x, 1.18, 1.78);
    const tailLight = new THREE.Mesh(tukLightGeo, tukTail);
    tailLight.position.set(x, 1.18, -1.78);
    model.add(headlight, tailLight);
  }
  return model;
}

const tuk = createTukModel(tukPaint, true);
scene.add(tuk);
const playerShadow = new THREE.Mesh(
  new THREE.CircleGeometry(1.65, 16),
  new THREE.MeshBasicMaterial({ color: 0x092a32, transparent: true, opacity: 0.28, depthWrite: false }),
);
playerShadow.rotation.x = -Math.PI / 2;
playerShadow.position.y = 0.035;
scene.add(playerShadow);

// Guide arrow: shaded 3D arrow (shaft + head, toon) floating AHEAD of the Tuk
// toward the stop, so direction reads from position + shape, not just yaw.
const guideArrow = new THREE.Group();
const guideShaftGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.7, 8);
guideShaftGeo.rotateX(Math.PI / 2); // lie along +Z
const guideShaft = new THREE.Mesh(guideShaftGeo, toon(0xff9f1a));
guideShaft.position.z = -0.55;
const guideHeadGeo = new THREE.ConeGeometry(0.62, 1.5, 4);
guideHeadGeo.rotateX(Math.PI / 2); // tip -> +Z
guideHeadGeo.scale(1, 0.55, 1); // flatten vertically so it reads from chase cam
const guideHead = new THREE.Mesh(guideHeadGeo, toon(0xff9f1a));
guideHead.position.z = 0.85;
guideArrow.add(guideShaft, guideHead);
scene.add(guideArrow);

// Passengers: GTA-style markers (beam + ground ring + floating arrow).
// Waiting = green, destination = orange. Retention: aboard fares stay bound (FR-17).
interface Pax {
  id: string;
  x: number;
  z: number;
  destX: number;
  destZ: number;
  aboard: boolean;
  ownerId: number | null;
  pending: boolean;
  pendingAt: number;
  waitGroup: THREE.Group;
  destGroup: THREE.Group;
  waitRing: THREE.Mesh;
  destRing: THREE.Mesh;
  waitArrow: THREE.Mesh;
  destArrow: THREE.Mesh;
}
const paxRand: () => number = mulberry32(SEED + 2);
const waiting: Pax[] = [];
const beamGeo = new THREE.CylinderGeometry(1.7, 1.7, 30, 12, 1, true);
const ringGeo = new THREE.RingGeometry(1.9, 2.7, 28);
const arrowGeo = new THREE.ConeGeometry(0.7, 1.5, 10);
function gtaMats(color: number): { beam: THREE.MeshBasicMaterial; ring: THREE.MeshBasicMaterial; arrow: THREE.MeshBasicMaterial } {
  return {
    beam: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    ring: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    arrow: new THREE.MeshBasicMaterial({ color }),
  };
}
const greenMats = gtaMats(0x2ecc71);
const goldMats = gtaMats(0xff9f1a);
function makeGtaMarker(
  mats: { beam: THREE.Material; ring: THREE.Material; arrow: THREE.Material },
): { group: THREE.Group; ring: THREE.Mesh; arrow: THREE.Mesh } {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(beamGeo, mats.beam);
  beam.position.y = 15;
  const ring = new THREE.Mesh(ringGeo, mats.ring);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  const arrow = new THREE.Mesh(arrowGeo, mats.arrow);
  arrow.rotation.x = Math.PI; // point down like GTA
  arrow.position.y = 5.2;
  group.add(beam, ring, arrow);
  return { group, ring, arrow };
}
function randomNodeFar(fromX: number, fromZ: number, minDist: number): { x: number; z: number } {
  let best: { x: number; z: number } = graph.nodes[0] as { x: number; z: number };
  for (let tries = 0; tries < 12; tries++) {
    const n = graph.nodes[Math.floor(paxRand() * graph.nodes.length)] as { x: number; z: number };
    if (Math.hypot(n.x - fromX, n.z - fromZ) >= minDist) return n;
    best = n;
  }
  return best;
}
for (let k = 0; k < 5; k++) {
  const a = graph.nodes[Math.floor(paxRand() * graph.nodes.length)] as { x: number; z: number };
  let b = graph.nodes[Math.floor(paxRand() * graph.nodes.length)] as { x: number; z: number };
  if (b === a) b = graph.nodes[(graph.nodes.indexOf(a) + 13) % graph.nodes.length] as { x: number; z: number };
  const w = makeGtaMarker(greenMats);
  w.group.position.set(a.x + 5, 0, a.z + 5);
  const d = makeGtaMarker(goldMats);
  d.group.position.set(b.x, 0, b.z);
  d.group.visible = false;
  scene.add(w.group, d.group);
  waiting.push({
    id: `p${k}`,
    x: a.x + 5,
    z: a.z + 5,
    destX: b.x,
    destZ: b.z,
    aboard: false,
    ownerId: null,
    pending: false,
    pendingAt: 0,
    waitGroup: w.group,
    destGroup: d.group,
    waitRing: w.ring,
    destRing: d.ring,
    waitArrow: w.arrow,
    destArrow: d.arrow,
  });
}
people.setWaiting(waiting.map((w) => ({ x: w.x, z: w.z })));

const tukState: TukState = { x: 30, z: 30, heading: 0, speed: 0 };
let cash = 0;
let delivered = 0;
let hearts = 3;
let wrecked = false;
let shieldUntil = 0;
let respawnAvailableAt = 0;
let respawnTimer: number | undefined;
let lastCutAttempt = 0;
let aboard: Fare[] = [];
let remotes: readonly Remote[] = [];
const remotePaint = toon(0xef6b5e);
const remoteMeshes = new Map<number, THREE.Group>();
// Speedometer (themed SVG, smoothed needle + sweep arc).
const needleEl: SVGElement | null = document.querySelector("#needle");
const speedNumEl: SVGElement | null = document.querySelector("#speedNum");
const speedArcEl: SVGPathElement | null = document.querySelector("#speedArc");
const gearEl: SVGElement | null = document.querySelector("#gear");
let dispSpeed = 0;
function polar(cx: number, cy: number, r: number, degFromUp: number): { x: number; y: number } {
  const a: number = (degFromUp * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}
function updateSpeedo(speed: number, dt: number): void {
  dispSpeed += (speed - dispSpeed) * Math.min(1, dt * 7);
  if (Math.abs(speed - dispSpeed) < 0.02) dispSpeed = speed;
  const frac: number = Math.min(1, Math.max(0, Math.abs(dispSpeed) / 12.5));
  const ang: number = -120 + frac * 240;
  if (needleEl !== null) needleEl.setAttribute("transform", `rotate(${ang.toFixed(1)} 66 66)`);
  if (speedNumEl !== null) speedNumEl.textContent = String(Math.round(Math.abs(dispSpeed) * 3.6));
  const gear = gearOf(speed);
  if (gearEl !== null) {
    gearEl.textContent = gear;
    gearEl.setAttribute("fill", gear === "R" ? "#e74c3c" : gear === "D" ? "#1e8449" : "#5d6d7e");
  }
  if (speedArcEl !== null) {
    if (frac <= 0.005) {
      speedArcEl.setAttribute("d", "");
    } else {
      const p0 = polar(66, 66, 58, -120);
      const p1 = polar(66, 66, 58, ang);
      const large: number = frac * 240 > 180 ? 1 : 0;
      speedArcEl.setAttribute("d", `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A 58 58 0 ${large} 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`);
      speedArcEl.setAttribute("stroke", frac < 0.5 ? "#2ecc71" : frac < 0.8 ? "#f2b134" : "#e74c3c");
    }
  }
}
const feed: HTMLElement | null = document.getElementById("feed");
const wreckDiv: HTMLElement | null = document.getElementById("wreck");
const wreckText: HTMLElement | null = document.getElementById("wreckText");
const againBtn: HTMLButtonElement | null = document.querySelector<HTMLButtonElement>("#again");
const feedEl: HTMLElement | null = feed;
function feedMsg(t: string): void {
  if (feedEl !== null) feedEl.textContent = t;
}
let net: NetHandle | null = null;
let currentPlayerId = -1;
let networkStarted = false;
let currentRoomName = "";
let currentLobbyMode: "named" | "quick" = "named";

function syncPassengerState(state: Passenger): void {
  const passenger = waiting.find((candidate) => candidate.id === state.id);
  if (passenger === undefined) return;
  passenger.x = state.x;
  passenger.z = state.z;
  passenger.destX = state.destX;
  passenger.destZ = state.destZ;
  passenger.ownerId = state.ownerId;
  passenger.aboard = state.ownerId !== null;
  passenger.pending = false;
  passenger.waitGroup.position.set(passenger.x, 0, passenger.z);
  passenger.destGroup.position.set(passenger.destX, 0, passenger.destZ);
  passenger.waitGroup.visible = !passenger.aboard;
  passenger.destGroup.visible = passenger.aboard;
  aboard = aboard.filter((fare) => fare.pid !== passenger.id);
  if (passenger.ownerId === currentPlayerId) aboard.push({ pid: passenger.id, destX: passenger.destX, destZ: passenger.destZ, pickupDist: 0 });
  people.setWaiting(waiting.filter((candidate) => !candidate.aboard).map((candidate) => ({ x: candidate.x, z: candidate.z })));
}

function localPickup(passenger: Pax): void {
  passenger.aboard = true;
  passenger.ownerId = currentPlayerId;
  passenger.pending = false;
  passenger.waitGroup.visible = false;
  passenger.destGroup.visible = true;
  aboard.push({ pid: passenger.id, destX: passenger.destX, destZ: passenger.destZ, pickupDist: 0 });
  people.onPickup(passenger.x, passenger.z);
  people.setWaiting(waiting.filter((candidate) => !candidate.aboard).map((candidate) => ({ x: candidate.x, z: candidate.z })));
}

function localDrop(passenger: Pax): number {
  const fare = computeFare(120 + Math.hypot(passenger.destX - tukState.x, passenger.destZ - tukState.z) * 2, { fast: true, clean: hearts === 3 });
  cash += fare;
  delivered += 1;
  aboard = aboard.filter((entry) => entry.pid !== passenger.id);
  passenger.aboard = false;
  passenger.ownerId = null;
  passenger.pending = false;
  passenger.destGroup.visible = false;
  const next = randomNodeFar(tukState.x, tukState.z, 80);
  const destination = randomNodeFar(next.x, next.z, 100);
  passenger.x = next.x + 5;
  passenger.z = next.z + 5;
  passenger.destX = destination.x;
  passenger.destZ = destination.z;
  passenger.waitGroup.position.set(passenger.x, 0, passenger.z);
  passenger.destGroup.position.set(passenger.destX, 0, passenger.destZ);
  passenger.waitGroup.visible = true;
  people.onDrop(tukState.x, tukState.z);
  people.setWaiting(waiting.filter((candidate) => !candidate.aboard).map((candidate) => ({ x: candidate.x, z: candidate.z })));
  return fare;
}

function lobbyMessage(state: LobbyState): void {
  const roomLabel = currentLobbyMode === "quick" ? "Quick Play" : state.kind === "error" ? "room" : state.roomName;
  if (state.kind === "searching") {
    lobbyStatus.textContent = currentLobbyMode === "quick" ? "Finding random players…" : `Looking for an open room named "${state.roomName}"…`;
  } else if (state.kind === "queued") {
    lobbyStatus.textContent = `Room "${roomLabel}" is full. Waitroom position ${state.position} (${state.players}/${state.capacity} players).`;
  } else if (state.kind === "admitted") {
    lobbyStatus.textContent = `Joining ${roomLabel}…`;
  } else {
    lobbyStatus.textContent = state.message;
    joinRoom.disabled = false;
    quickPlay.disabled = false;
    networkStarted = false;
  }
}

function startNetwork(name: string, mode: "named" | "quick" = "named"): void {
  const normalized = mode === "quick" ? "quick" : name.trim();
  if (mode === "named" && normalized.length < 2) {
    lobbyStatus.textContent = "Enter at least 2 characters for the room name.";
    return;
  }
  if (networkStarted) return;
  networkStarted = true;
  currentLobbyMode = mode;
  currentRoomName = mode === "quick" ? "QUICK PLAY" : normalized;
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set("room", normalized);
  if (mode === "quick") shareUrl.searchParams.set("mode", "quick");
  else shareUrl.searchParams.delete("mode");
  window.history.replaceState(null, "", shareUrl);
  joinRoom.disabled = true;
  quickPlay.disabled = true;
  lobbyStatus.textContent = mode === "quick" ? "Finding random players…" : "Finding a room…";
  net = connectNet(
    {
      onWelcome: (id: number, x: number, z: number, heading: number, speed: number, initialHearts: number, alive: boolean, respawnAt: number): void => {
        currentPlayerId = id;
        tukState.x = x;
        tukState.z = z;
        tukState.heading = heading;
        tukState.speed = speed;
        hearts = initialHearts;
        wrecked = !alive;
        if (wrecked) {
          respawnAvailableAt = Math.max(performance.now(), respawnAt - Date.now());
          if (againBtn !== null) againBtn.disabled = true;
          if (respawnTimer !== undefined) window.clearTimeout(respawnTimer);
          respawnTimer = window.setTimeout(() => {
            if (againBtn !== null) againBtn.disabled = false;
          }, Math.max(0, respawnAvailableAt - performance.now()));
          if (wreckDiv !== null) wreckDiv.style.display = "flex";
          if (wreckText !== null) wreckText.textContent = "Wrecked — waiting for the respawn lease.";
        } else {
          if (wreckDiv !== null) wreckDiv.style.display = "none";
        }
        lobby.classList.add("hidden");
        joinRoom.disabled = false;
        quickPlay.disabled = false;
        feedMsg(`Connected to ${currentRoomName} — SPACE to cut off!`);
      },
      onRemotes: (r: readonly Remote[]): void => {
        remotes = r;
      },
      onLobby: lobbyMessage,
      onHitText: (t: string): void => feedMsg(t),
      onWrecked: (victimId: number, killerId: number, iAmVictim: boolean, respawnAt: number): void => {
        if (iAmVictim) {
          wrecked = true;
          hearts = 0;
          respawnAvailableAt = Math.max(performance.now(), respawnAt - Date.now());
          if (respawnTimer !== undefined) window.clearTimeout(respawnTimer);
          if (againBtn !== null) againBtn.disabled = true;
          respawnTimer = window.setTimeout(() => {
            if (againBtn !== null) againBtn.disabled = false;
          }, Math.max(0, respawnAvailableAt - performance.now()));
          // Retention: fares stay bound (FR-17) — aboard[] untouched.
          if (wreckDiv !== null) wreckDiv.style.display = "flex";
          if (wreckText !== null) wreckText.textContent = `Wrecked by ${killerId}! Fares kept (${aboard.length} aboard).`;
        } else {
          feedMsg(`Wrecked: ${killerId}→${victimId}`);
        }
      },
      onPassengers: (states: readonly Passenger[]): void => {
        for (const state of states) syncPassengerState(state);
      },
      onPassenger: (state: Passenger, playerId: number, authoritativeCash: number, authoritativeDelivered: number): void => {
        if (playerId === currentPlayerId) {
          cash = authoritativeCash;
          delivered = authoritativeDelivered;
        }
        syncPassengerState(state);
      },
      onRespawned: (id: number, x: number, z: number, heading: number, h: number, shieldMs: number): void => {
        if (id !== currentPlayerId) return;
        wrecked = false;
        hearts = h;
        tukState.x = x;
        tukState.z = z;
        tukState.heading = heading;
        tukState.speed = 0;
        shieldUntil = performance.now() + shieldMs;
        respawnAvailableAt = 0;
        if (respawnTimer !== undefined) window.clearTimeout(respawnTimer);
        if (againBtn !== null) againBtn.disabled = false;
        if (wreckDiv !== null) wreckDiv.style.display = "none";
        feedMsg("Respawned with a revenge shield — fares kept!");
      },
      onHearts: (h: number): void => {
        hearts = h;
      },
      onCash: (authoritativeCash: number, authoritativeDelivered: number): void => {
        cash = authoritativeCash;
        delivered = authoritativeDelivered;
      },
    },
    { roomName: normalized, mode },
  );
}

roomForm.addEventListener("submit", (event: SubmitEvent): void => {
  event.preventDefault();
  startNetwork(roomName.value, "named");
});
quickPlay.addEventListener("click", (): void => {
  startNetwork("quick", "quick");
});
if (requestedRoom !== undefined && requestedRoom.length > 0) startNetwork(requestedRoom, requestedMode);
if (againBtn !== null) {
  againBtn.addEventListener("click", (): void => {
    if (performance.now() < respawnAvailableAt) return;
    if (net !== null) {
      net.tryRespawn();
      feedMsg("Respawning…");
      return;
    }
    wrecked = false;
    hearts = 3;
    tukState.x = 20;
    tukState.z = 20;
    tukState.speed = 0;
    shieldUntil = performance.now() + 8000;
    if (wreckDiv !== null) wreckDiv.style.display = "none";
    feedMsg("Respawned with shield — fares kept!");
  });
}
const keys = new Set<string>();
for (const button of document.querySelectorAll<HTMLButtonElement>("#touchControls button")) {
  const key = button.dataset.driveKey;
  if (key === undefined) continue;
  const release = (): void => {
    keys.delete(key);
    button.classList.remove("held");
  };
  button.addEventListener("pointerdown", (event: PointerEvent): void => {
    event.preventDefault();
    keys.add(key);
    button.classList.add("held");
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
window.addEventListener("keydown", (e: KeyboardEvent): void => {
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", (e: KeyboardEvent): void => {
  keys.delete(e.key.toLowerCase());
});
window.addEventListener("blur", (): void => {
  keys.clear();
});
window.addEventListener("resize", (): void => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
const clock = new THREE.Clock();
let lowFpsSeconds = 0;
function updatePixelBudget(dt: number): void {
  if (dt <= 0) return;
  const fps = 1 / dt;
  lowFpsSeconds = fps < 45 ? lowFpsSeconds + dt : Math.max(0, lowFpsSeconds - dt * 0.5);
  if (lowFpsSeconds > 3 && pixelRatio > 0.75) {
    pixelRatio = Math.max(0.75, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    lowFpsSeconds = 0;
  }
}
let camFov = 60;
const camTarget = new THREE.Vector3();
let camInit = false;
const vignetteEl: HTMLElement | null = document.getElementById("vignette");

function input(): DriveInput {
  const up: boolean = keys.has("w") || keys.has("arrowup");
  const down: boolean = keys.has("s") || keys.has("arrowdown");
  const left: boolean = keys.has("a") || keys.has("arrowleft");
  const right: boolean = keys.has("d") || keys.has("arrowright");
  return {
    throttle: up ? 1 : 0,
    brake: down ? 1 : 0,
    steer: (left ? -1 : 0) + (right ? 1 : 0),
  };
}

function tick(): void {
  requestAnimationFrame(tick);
  const dt: number = Math.min(clock.getDelta(), 0.05);
  updatePixelBudget(dt);
  if (!wrecked) stepTuk(tukState, input(), dt);
  // Hard bounds: barriers are visual, clamp is physical (non-playable blocked).
  {
    const cx: number = Math.min(bounds.maxX, Math.max(bounds.minX, tukState.x));
    const cz: number = Math.min(bounds.maxZ, Math.max(bounds.minZ, tukState.z));
    if (cx !== tukState.x || cz !== tukState.z) {
      tukState.x = cx;
      tukState.z = cz;
      tukState.speed *= 0.5; // thud into the barrier
    }
  }
  tuk.position.set(tukState.x, 0, tukState.z);
  tuk.rotation.y = tukState.heading;
  playerShadow.position.x = tukState.x;
  playerShadow.position.z = tukState.z;
  playerShadow.scale.setScalar(1 + Math.min(0.22, Math.abs(tukState.speed) * 0.012));
  net?.pushState(tukState.x, tukState.z, tukState.heading, tukState.speed);

  // Remotes interp + lightweight layered tuk silhouette
  for (const r of remotes) {
    let m: THREE.Group | undefined = remoteMeshes.get(r.id);
    if (m === undefined) {
      m = createTukModel(remotePaint, false);
      scene.add(m);
      remoteMeshes.set(r.id, m);
    }
    m.position.x += (r.tx - m.position.x) * Math.min(1, dt * 8);
    m.position.z += (r.tz - m.position.z) * Math.min(1, dt * 8);
    m.rotation.y = r.heading;
  }

  const activeRemoteIds = new Set(remotes.map((remote) => remote.id));
  for (const [id, mesh] of remoteMeshes) {
    if (activeRemoteIds.has(id)) continue;
    scene.remove(mesh);
    remoteMeshes.delete(id);
  }

  // Cut attempt on SPACE: nearest remote within 4m
  if (keys.has(" ") && !wrecked && performance.now() > shieldUntil - 8000 + 3000 && performance.now() - lastCutAttempt > 250) {
    let bestId = -1;
    let bestD = 4.0;
    for (const r of remotes) {
      const d: number = Math.hypot(r.tx - tukState.x, r.tz - tukState.z);
      if (d < bestD) {
        bestD = d;
        bestId = r.id;
      }
    }
    if (bestId >= 0) {
      lastCutAttempt = performance.now();
      net?.tryCut(bestId);
    }
  }

  // Chase cam, NFS Most Wanted style: smooth FOV swell + gentle pullback,
  // damped follow for weight, faint vignette. No shake — stable horizon.
  const speedFrac: number = Math.min(1, Math.abs(tukState.speed) / 12.5);
  camFov += (60 + speedFrac * 8 - camFov) * Math.min(1, dt * 2.5);
  if (Math.abs(camera.fov - camFov) > 0.05) {
    camera.fov = camFov;
    camera.updateProjectionMatrix();
  }
  const camBack: number = 9 + speedFrac * 1.1;
  const camUp: number = 5.2 - speedFrac * 0.25;
  const fx: number = Math.sin(tukState.heading);
  const fz: number = Math.cos(tukState.heading);
  camTarget.set(tukState.x - fx * camBack, camUp, tukState.z - fz * camBack);
  if (!camInit) {
    camera.position.copy(camTarget);
    camInit = true;
  } else {
    camera.position.lerp(camTarget, Math.min(1, dt * 5));
  }
  camera.lookAt(tukState.x + fx * 6, 1.5, tukState.z + fz * 6);
  if (vignetteEl !== null) vignetteEl.style.opacity = (Math.pow(speedFrac, 1.2) * 0.85).toFixed(2);

  // Pick / drop — deliver counts ONCE then passenger respawns elsewhere (no farm).
  let msg = "WASD drive · stop on GREEN to pick · ORANGE to drop";
  const nowS: number = clock.elapsedTime;
  for (const p of waiting) {
    // GTA pulse: ring breathes, arrow bobs, dest ring spins.
    const pulse: number = 1 + 0.16 * Math.sin(nowS * 4 + p.x);
    p.waitRing.scale.set(pulse, pulse, 1);
    p.destRing.scale.set(pulse, pulse, 1);
    p.destRing.rotation.z += dt * 1.2;
    p.waitArrow.position.y = 5.2 + Math.sin(nowS * 3 + p.z) * 0.5;
    p.destArrow.position.y = 5.2 + Math.sin(nowS * 3 + p.destX) * 0.5;
    if (p.pending && nowS * 1000 - p.pendingAt > 1_000) p.pending = false;
    const dWait: number = Math.hypot(p.x - tukState.x, p.z - tukState.z);
    if (!p.aboard && !p.pending && dWait < 3.4 && Math.abs(tukState.speed) < 1 && aboard.length < 3) {
      if (net !== null) {
        p.pending = true;
        p.pendingAt = nowS * 1000;
        net.tryPick(p.id);
        msg = `Requesting ${p.id}…`;
      } else {
        localPickup(p);
        msg = `Picked ${p.id} — go to ORANGE! (${aboard.length} aboard)`;
      }
    }
    if (p.aboard && p.ownerId === currentPlayerId) {
      const dDest: number = Math.hypot(p.destX - tukState.x, p.destZ - tukState.z);
      if (dDest < 4.5 && Math.abs(tukState.speed) < 1.5 && !p.pending) {
        if (net !== null) {
          p.pending = true;
          p.pendingAt = nowS * 1000;
          net.tryDrop(p.id);
          msg = `Dropping ${p.id}…`;
        } else {
          const fare = localDrop(p);
          msg = `+Rs.${fare} delivered! (${delivered} trips)`;
        }
      }
    }
  }

  const shield: boolean = performance.now() < shieldUntil;
  cashValue.textContent = `Rs.${cash}`;
  tripValue.textContent = String(delivered);
  aboardValue.textContent = String(aboard.length);
  heartsValue.textContent = "♥".repeat(Math.max(0, hearts));
  heartsValue.setAttribute("aria-label", `${Math.max(0, hearts)} hearts`);
  roomBadge.textContent = shield ? "SHIELD" : currentRoomName ? currentRoomName.toUpperCase() : "LOBBY";
  hintEl.textContent = wrecked ? "Wrecked — Play Again keeps fares!" : msg;
  updateSpeedo(wrecked ? 0 : tukState.speed, dt);

  // Floating guide arrow: nearest aboard dest, else nearest waiting pickup.
  {
    let tx: number | null = null;
    let tz: number | null = null;
    let isDrop = false;
    let best = Number.POSITIVE_INFINITY;
    for (const f of aboard) {
      const d: number = Math.hypot(f.destX - tukState.x, f.destZ - tukState.z);
      if (d < best) {
        best = d;
        tx = f.destX;
        tz = f.destZ;
        isDrop = true;
      }
    }
    if (tx === null) {
      for (const p of waiting) {
        if (p.aboard) continue;
        const d: number = Math.hypot(p.x - tukState.x, p.z - tukState.z);
        if (d < best) {
          best = d;
          tx = p.x;
          tz = p.z;
          isDrop = false;
        }
      }
    }
    if (tx !== null && tz !== null) {
      const dx: number = tx - tukState.x;
      const dz: number = tz - tukState.z;
      const len: number = Math.max(0.001, Math.hypot(dx, dz));
      // Sit ahead of the Tuk toward the stop so direction reads instantly.
      const ahead = 5.0;
      guideArrow.position.set(
        tukState.x + (dx / len) * ahead,
        3.4 + Math.sin(nowS * 4) * 0.2,
        tukState.z + (dz / len) * ahead,
      );
      // lookAt orients +Z toward target (arrow built pointing +Z).
      guideArrow.lookAt(tx, guideArrow.position.y, tz);
      guideShaft.material.color.set(isDrop ? 0xff9f1a : 0x2ecc71);
      guideHead.material.color.set(isDrop ? 0xff9f1a : 0x2ecc71);
      guideArrow.visible = !wrecked;
      if (!wrecked && (msg.startsWith("WASD") || msg.startsWith("Picked"))) {
        msg = `${isDrop ? "ORANGE" : "GREEN"} ${Math.round(best)}m ${isDrop ? "drop" : "pickup"} — follow arrow`;
        hintEl.textContent = msg;
      }
    } else {
      guideArrow.visible = false;
    }
  }

  // Minimap (FR-42): circular, player-centered, player faces up.
  // Same graph segments as the 3D instanced roads. World north = -Z.
  // Canvas backing is 336px; CSS scales to 168px circle.
  const MSIZE: number = mmap.width;
  const MC: number = MSIZE / 2;
  const RANGE_M = 120;
  const K: number = MC / RANGE_M;
  const px: number = tukState.x;
  const pz: number = tukState.z;
  const hd: number = tukState.heading;
  const toMap = (wx: number, wz: number): { mx: number; my: number; dist: number } => {
    const dx: number = wx - px;
    const dz: number = wz - pz;
    const dist: number = Math.hypot(dx, dz);
    const bearing: number = Math.atan2(dx, dz);
    const rel: number = bearing - hd;
    return { mx: MC + dist * K * Math.sin(rel), my: MC - dist * K * Math.cos(rel), dist };
  };
  mapCtx.save();
  mapCtx.clearRect(0, 0, MSIZE, MSIZE);
  mapCtx.beginPath();
  mapCtx.arc(MC, MC, MC - 2, 0, Math.PI * 2);
  mapCtx.clip();
  const mapGradient = mapCtx.createRadialGradient(MC, MC, 10, MC, MC, MC);
  mapGradient.addColorStop(0, "#1b5a55");
  mapGradient.addColorStop(0.72, "#123e43");
  mapGradient.addColorStop(1, "#0a2934");
  mapCtx.fillStyle = mapGradient;
  mapCtx.fillRect(0, 0, MSIZE, MSIZE);
  mapCtx.strokeStyle = "rgba(152, 226, 207, .12)";
  mapCtx.lineWidth = 1;
  for (const radius of [MC * 0.33, MC * 0.66, MC - 12]) {
    mapCtx.beginPath();
    mapCtx.arc(MC, MC, radius, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  const drawRoads = (width: number, color: string): void => {
    mapCtx.strokeStyle = color;
    mapCtx.lineWidth = width;
    mapCtx.lineCap = "round";
    for (let r = 0; r < graph.rows; r++) {
      for (let c = 0; c < graph.cols; c++) {
        const idx: number = r * graph.cols + c;
        const a: { x: number; z: number } | undefined = graph.nodes[idx];
        if (a === undefined) continue;
        const neighbors: Array<{ x: number; z: number } | undefined> = [
          c + 1 < graph.cols ? graph.nodes[idx + 1] : undefined,
          r + 1 < graph.rows ? graph.nodes[idx + graph.cols] : undefined,
        ];
        for (const b of neighbors) {
          if (b === undefined) continue;
          const pa = toMap(a.x, a.z);
          const pb = toMap(b.x, b.z);
          if (pa.dist > RANGE_M * 1.5 && pb.dist > RANGE_M * 1.5) continue;
          mapCtx.beginPath();
          mapCtx.moveTo(pa.mx, pa.my);
          mapCtx.lineTo(pb.mx, pb.my);
          mapCtx.stroke();
        }
      }
    }
  };
  drawRoads(9, "rgba(4, 20, 27, .8)");
  drawRoads(4, "#6d8987");

  const drawDot = (x: number, y: number, radius: number, color: string): void => {
    mapCtx.save();
    mapCtx.shadowColor = color;
    mapCtx.shadowBlur = 9;
    mapCtx.fillStyle = color;
    mapCtx.beginPath();
    mapCtx.arc(x, y, radius, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.shadowBlur = 0;
    mapCtx.fillStyle = "#effff8";
    mapCtx.beginPath();
    mapCtx.arc(x, y, Math.max(1.5, radius * 0.32), 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.restore();
  };

  for (const p of waiting) {
    const m = p.aboard ? toMap(p.destX, p.destZ) : toMap(p.x, p.z);
    if (m.dist > RANGE_M) continue;
    drawDot(m.mx, m.my, p.aboard ? 5 : 4, p.aboard ? "#ffc857" : "#63e0bb");
  }
  for (const remote of remotes) {
    const m = toMap(remote.tx, remote.tz);
    if (m.dist > RANGE_M) continue;
    drawDot(m.mx, m.my, 3.5, "#ff766d");
  }

  mapCtx.save();
  mapCtx.shadowColor = "#ffc857";
  mapCtx.shadowBlur = 15;
  mapCtx.fillStyle = "#ffc857";
  mapCtx.beginPath();
  mapCtx.arc(MC, MC, 8, 0, Math.PI * 2);
  mapCtx.fill();
  mapCtx.shadowBlur = 0;
  mapCtx.fillStyle = "#fff9df";
  mapCtx.beginPath();
  mapCtx.moveTo(MC, MC - 11);
  mapCtx.lineTo(MC - 6, MC + 6);
  mapCtx.lineTo(MC + 6, MC + 6);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();

  const relN: number = Math.atan2(0, -1) - hd;
  const nx: number = MC + (MC - 23) * Math.sin(relN);
  const ny: number = MC - (MC - 23) * Math.cos(relN);
  mapCtx.strokeStyle = "#ffc857";
  mapCtx.lineWidth = 2;
  mapCtx.beginPath();
  mapCtx.moveTo(MC, MC);
  mapCtx.lineTo(nx, ny);
  mapCtx.stroke();
  mapCtx.fillStyle = "#ffe7a6";
  mapCtx.font = "800 16px system-ui, sans-serif";
  mapCtx.textAlign = "center";
  mapCtx.textBaseline = "middle";
  mapCtx.fillText("N", nx, ny);
  mapCtx.fillStyle = "rgba(232, 255, 246, .68)";
  mapCtx.font = "700 11px system-ui, sans-serif";
  mapCtx.fillText("120m", MC, MC - 16);
  mapCtx.restore();

  // Dynamic resolution guard (NFR-06): drop to 0.75x if slow — stub via pixelRatio check omitted here.
  people.update(dt, nowS);
  renderer.render(scene, camera);
}
tick();
