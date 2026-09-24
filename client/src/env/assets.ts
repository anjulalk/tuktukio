// Reusable environment asset kit (FR-21). All procedural, zero downloads.
// One shared geometry/material per asset type + InstancedMesh everywhere.
// World north = -Z, matching the minimap N pointer.

import * as THREE from "three";
import type { RoadGraph } from "../city/roadGraph";
import { mulberry32 } from "../../../shared/prng";

export const WORLD_NORTH_Z = -1; // north = -Z

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c: HTMLCanvasElement = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g: CanvasRenderingContext2D | null = c.getContext("2d");
  if (g === null) throw new Error("no 2d context");
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sky dome (gradient sunrise in the EAST so north stays north) + sun + blob clouds. */
export function buildSky(scene: THREE.Scene, world: number): void {
  const skyTex: THREE.CanvasTexture = canvasTex(4, 128, (g): void => {
    const grad: CanvasGradient = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "#2f6fb4");
    grad.addColorStop(0.55, "#7fb8dd");
    grad.addColorStop(0.78, "#f6d9a8");
    grad.addColorStop(1, "#f2b134");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(650, 20, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.position.set(world / 2, 0, world / 2);
  dome.renderOrder = -10;
  scene.add(dome);
  // Sun low in the EAST (+X), slightly north — morning Colombo light.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  sun.position.set(world / 2 + 520, 150, world / 2 - 160);
  sun.lookAt(world / 2, 60, world / 2);
  scene.add(sun);
  // Flat cartoon clouds, batched into one instanced draw call.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.78, depthWrite: false });
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const rand: () => number = mulberry32(99);
  const cloudPuffs: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number }> = [];
  for (let i = 0; i < 9; i++) {
    const cx = rand() * (world + 500) - 100;
    const cy = 130 + rand() * 90;
    const cz = rand() * (world + 500) - 100;
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      cloudPuffs.push({
        x: cx + (k - (n - 1) / 2) * 13 + (rand() - 0.5) * 7,
        y: cy + (rand() - 0.5) * 5,
        z: cz + (rand() - 0.5) * 9,
        sx: 9 + rand() * 9,
        sy: 3.5 + rand() * 2.5,
        sz: 6 + rand() * 3,
      });
    }
  }
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudPuffs.length);
  const cloudDummy = new THREE.Object3D();
  cloudPuffs.forEach((puff, i): void => {
    cloudDummy.position.set(puff.x, puff.y, puff.z);
    cloudDummy.scale.set(puff.sx, puff.sy, puff.sz);
    cloudDummy.updateMatrix();
    clouds.setMatrixAt(i, cloudDummy.matrix);
  });
  clouds.instanceMatrix.needsUpdate = true;
  scene.add(clouds);

  const sunHalo = new THREE.Mesh(
    new THREE.CircleGeometry(50, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, fog: false, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  );
  sunHalo.position.copy(sun.position);
  sunHalo.lookAt(world / 2, 60, world / 2);
  sunHalo.renderOrder = -9;
  scene.add(sunHalo);
  scene.fog = new THREE.Fog(0xc4dce0, 160, 620);
}

/** Grass + sea strip on the SOUTH edge (Galle Face beach, FR-23 landmark). */
export function buildGround(scene: THREE.Scene, toon: (c: number) => THREE.MeshToonMaterial, world: number): void {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(world + 260, world + 260), toon(0x6fae7e));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(world / 2, -0.12, world / 2);
  scene.add(grass);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(world + 600, 220),
    new THREE.MeshToonMaterial({ color: 0x2e9fc4 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(world / 2, -0.05, world + 108);
  scene.add(sea);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(world + 260, 14), toon(0xe6d29a));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(world / 2, 0.0, world + 4);
  scene.add(sand);

  // A few quiet foam ribbons make the coast read as a place, not a flat blue plane.
  const foamGeo = new THREE.PlaneGeometry(1, 1);
  foamGeo.rotateX(-Math.PI / 2);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xd9fbf2, transparent: true, opacity: 0.38, depthWrite: false });
  const foamRand = mulberry32(404);
  const foam = new THREE.InstancedMesh(foamGeo, foamMat, 18);
  const foamDummy = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    foamDummy.position.set(foamRand() * (world + 420) - 210, 0.015, world + 16 + foamRand() * 110);
    foamDummy.scale.set(14 + foamRand() * 28, 1, 0.35 + foamRand() * 0.55);
    foamDummy.updateMatrix();
    foam.setMatrixAt(i, foamDummy.matrix);
  }
  foam.instanceMatrix.needsUpdate = true;
  scene.add(foam);
}

interface Edge {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
}

export function graphEdges(graph: RoadGraph): Edge[] {
  const edges: Edge[] = [];
  for (let r = 0; r < graph.rows; r++) {
    for (let c = 0; c < graph.cols; c++) {
      const idx: number = r * graph.cols + c;
      const a: { x: number; z: number } | undefined = graph.nodes[idx];
      if (a === undefined) continue;
      if (c + 1 < graph.cols) {
        const b: { x: number; z: number } | undefined = graph.nodes[idx + 1];
        if (b !== undefined) edges.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
      }
      if (r + 1 < graph.rows) {
        const b: { x: number; z: number } | undefined = graph.nodes[idx + graph.cols];
        if (b !== undefined) edges.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
      }
    }
  }
  return edges;
}

/** Roads + lane dashes + pavements. Same graph the minimap draws. */
export function buildRoads(scene: THREE.Scene, toon: (c: number) => THREE.MeshToonMaterial, graph: RoadGraph): void {
  const edges: Edge[] = graphEdges(graph);
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  // Asphalt segments
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, toon(0x3d3d44), edges.length);
    edges.forEach((e: Edge, i: number): void => {
      const dx: number = e.bx - e.ax;
      const dz: number = e.bz - e.az;
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      pos.set((e.ax + e.bx) / 2, 0.02, (e.az + e.bz) / 2);
      scl.set(7, 1, Math.hypot(dx, dz) + 7);
      m.compose(pos, q, scl);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
  // Centre dashes: small cream quads every 6m along each edge.
  {
    const spots: Array<{ x: number; z: number; yaw: number }> = [];
    for (const e of edges) {
      const dx: number = e.bx - e.ax;
      const dz: number = e.bz - e.az;
      const len: number = Math.hypot(dx, dz);
      const yaw: number = Math.atan2(dx, dz);
      const n: number = Math.max(1, Math.floor(len / 6));
      for (let k = 0; k < n; k++) {
        const t: number = (k + 0.5) / n;
        spots.push({ x: e.ax + dx * t, z: e.az + dz * t, yaw });
      }
    }
    const geo = new THREE.PlaneGeometry(0.35, 2.2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((s: { x: number; z: number; yaw: number }, i: number): void => {
      q.setFromAxisAngle(up, s.yaw);
      pos.set(s.x, 0.045, s.z);
      scl.set(1, 1, 1);
      m.compose(pos, q, scl);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
  // Warm edge lines add depth to the asphalt without another texture.
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5d486, transparent: true, opacity: 0.62 });
    const inst = new THREE.InstancedMesh(geo, mat, edges.length * 2);
    let i = 0;
    for (const e of edges) {
      const dx = e.bx - e.ax;
      const dz = e.bz - e.az;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const nx = Math.cos(yaw);
      const nz = -Math.sin(yaw);
      for (const side of [1, -1]) {
        q.setFromAxisAngle(up, yaw);
        pos.set((e.ax + e.bx) / 2 + nx * 3.05 * side, 0.052, (e.az + e.bz) / 2 + nz * 3.05 * side);
        scl.set(0.12, 1, len);
        m.compose(pos, q, scl);
        inst.setMatrixAt(i, m);
        i++;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // Pavements: raised light strips offset both sides of every edge.
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat: THREE.MeshToonMaterial = toon(0x9aa0a6);
    const inst = new THREE.InstancedMesh(geo, mat, edges.length * 2);
    let i = 0;
    for (const e of edges) {
      const dx: number = e.bx - e.ax;
      const dz: number = e.bz - e.az;
      const len: number = Math.hypot(dx, dz);
      const yaw: number = Math.atan2(dx, dz);
      const nx: number = Math.cos(yaw);
      const nz: number = -Math.sin(yaw);
      for (const side of [1, -1]) {
        q.setFromAxisAngle(up, yaw);
        pos.set((e.ax + e.bx) / 2 + nx * 4.8 * side, 0.09, (e.az + e.bz) / 2 + nz * 4.8 * side);
        scl.set(2.4, 1, len + 4);
        m.compose(pos, q, scl);
        inst.setMatrixAt(i, m);
        i++;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
}

/** Street life and navigation details, all instanced to keep draw calls low. */
export function buildStreetDetails(
  scene: THREE.Scene,
  toon: (c: number) => THREE.MeshToonMaterial,
  graph: RoadGraph,
  seed: number,
): void {
  const edges = graphEdges(graph);
  const rand = mulberry32(seed + 31);
  const up = new THREE.Vector3(0, 1, 0);
  const dummy = new THREE.Object3D();
  const treeSpots: Array<{ x: number; z: number; scale: number }> = [];
  const lampSpots: Array<{ x: number; z: number }> = [];
  const reflectorSpots: Array<{ x: number; z: number; yaw: number }> = [];

  edges.forEach((edge, edgeIndex) => {
    const dx = edge.bx - edge.ax;
    const dz = edge.bz - edge.az;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const nx = Math.cos(yaw);
    const nz = -Math.sin(yaw);
    const treeCount = Math.max(1, Math.floor(length / 42));
    for (let k = 0; k < treeCount; k++) {
      if (rand() < 0.18) continue;
      const t = (k + 0.55) / treeCount;
      const side = (edgeIndex + k) % 2 === 0 ? 1 : -1;
      treeSpots.push({
        x: edge.ax + dx * t + nx * (7.8 + rand() * 1.1) * side,
        z: edge.az + dz * t + nz * (7.8 + rand() * 1.1) * side,
        scale: 0.82 + rand() * 0.42,
      });
    }
    if (edgeIndex % 2 === 0) {
      const t = 0.5;
      const side = edgeIndex % 4 === 0 ? 1 : -1;
      lampSpots.push({ x: edge.ax + dx * t + nx * 7.1 * side, z: edge.az + dz * t + nz * 7.1 * side });
    }
    const studCount = Math.max(1, Math.floor(length / 13));
    for (let k = 0; k < studCount; k++) {
      const t = (k + 0.5) / studCount;
      reflectorSpots.push({ x: edge.ax + dx * t, z: edge.az + dz * t, yaw });
    }
  });

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 4.5, 6);
  trunkGeo.translate(0, 2.25, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8b5b3e), treeSpots.length);
  const crownGeo = new THREE.DodecahedronGeometry(1.8, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, toon(0x3d956e), treeSpots.length);
  treeSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0, spot.z);
    dummy.scale.set(spot.scale, spot.scale, spot.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spot.x, 4.55 * spot.scale, spot.z);
    dummy.scale.set(1.35 * spot.scale, 0.62 * spot.scale, 1.35 * spot.scale);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);

  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 4.4, 6);
  poleGeo.translate(0, 2.2, 0);
  const poles = new THREE.InstancedMesh(poleGeo, toon(0x304d55), lampSpots.length);
  const bulbGeo = new THREE.SphereGeometry(0.3, 8, 6);
  const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffd98a }), lampSpots.length);
  lampSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0, spot.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spot.x, 4.55, spot.z);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  scene.add(poles, bulbs);

  const reflectorGeo = new THREE.BoxGeometry(0.16, 0.06, 0.42);
  const reflectors = new THREE.InstancedMesh(
    reflectorGeo,
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.75 }),
    reflectorSpots.length,
  );
  const q = new THREE.Quaternion();
  reflectorSpots.forEach((spot, i) => {
    q.setFromAxisAngle(up, spot.yaw);
    dummy.position.set(spot.x, 0.075, spot.z);
    dummy.quaternion.copy(q);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    reflectors.setMatrixAt(i, dummy.matrix);
  });
  reflectors.instanceMatrix.needsUpdate = true;
  scene.add(reflectors);
}

function facadeTex(base: string, win: string, floors: number, colsN: number, shop: boolean): THREE.CanvasTexture {
  return canvasTex(64, 96, (g): void => {
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 96);
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < colsN; c++) {
        g.fillStyle = win;
        g.fillRect(6 + c * ((64 - 12) / colsN), 8 + f * ((72 - 8) / floors), (64 - 12) / colsN - 4, 10);
      }
    }
    if (shop) {
      g.fillStyle = "#7a4a21";
      g.fillRect(10, 76, 44, 18);
      g.fillStyle = "#ffe9a8";
      g.fillRect(12, 78, 40, 6);
    } else {
      g.fillStyle = "#4a2f1d";
      g.fillRect(26, 78, 12, 16);
    }
  });
}

/** 4 windowed/door building types (shop, house, office, temple-hall). */
export function buildBuildings(
  scene: THREE.Scene,
  gradientMap: THREE.Texture,
  graph: RoadGraph,
  seed: number,
): void {
  const rand: () => number = mulberry32(seed + 1);
  const mkMat = (tex: THREE.Texture): THREE.MeshToonMaterial =>
    new THREE.MeshToonMaterial({ map: tex, gradientMap });
  const mats: THREE.MeshToonMaterial[] = [
    mkMat(facadeTex("#e8b04b", "#3d5a73", 3, 3, true)), // Pettah shop
    mkMat(facadeTex("#d96f4e", "#33475e", 2, 2, false)), // house
    mkMat(facadeTex("#cfd6da", "#2c3e50", 5, 4, true)), // office
    mkMat(facadeTex("#f2ead8", "#8a5a2b", 1, 5, false)), // temple hall
  ];
  interface BuildingInstance {
    readonly type: number;
    readonly x: number;
    readonly z: number;
    readonly sx: number;
    readonly sz: number;
    readonly height: number;
  }
  const instances: BuildingInstance[] = [];
  for (let r = 0; r < graph.rows - 1; r++) {
    for (let c = 0; c < graph.cols - 1; c++) {
      const a = graph.nodes[r * graph.cols + c] as { x: number; z: number };
      const type = Math.floor(rand() * 4) as number;
      instances.push({
        type,
        x: a.x + graph.block / 2 + (rand() - 0.5) * 6,
        z: a.z + graph.block / 2 + (rand() - 0.5) * 6,
        sx: 0.8 + rand() * 0.5,
        sz: 0.8 + rand() * 0.5,
        height: type === 2 ? 16 + rand() * 14 : 7 + rand() * 7,
      });
    }
  }

  // Soft contact shadows ground the procedural buildings without shadow maps.
  const shadowGeo = new THREE.CircleGeometry(1, 12);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x12313a, transparent: true, opacity: 0.16, depthWrite: false });
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, instances.length);
  const dummy = new THREE.Object3D();
  instances.forEach((building, i): void => {
    dummy.position.set(building.x, 0.012, building.z);
    dummy.scale.set(building.sx * 8.6, 1, building.sz * 8.6);
    dummy.updateMatrix();
    shadows.setMatrixAt(i, dummy.matrix);
  });
  shadows.instanceMatrix.needsUpdate = true;
  scene.add(shadows);

  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshToonMaterial({ color: 0x24515a, gradientMap });
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, instances.length);
  instances.forEach((building, i): void => {
    dummy.position.set(building.x, building.height + 0.18, building.z);
    dummy.scale.set(building.sx * 14.1, 0.36, building.sz * 14.1);
    dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
  });
  roofs.instanceMatrix.needsUpdate = true;
  scene.add(roofs);

  // A single bright awning batch gives the shopfronts a human scale.
  const awningBuildings = instances.filter((building) => building.type === 0);
  if (awningBuildings.length > 0) {
    const awnings = new THREE.InstancedMesh(
      roofGeo,
      new THREE.MeshToonMaterial({ color: 0xf2b134, gradientMap }),
      awningBuildings.length,
    );
    awningBuildings.forEach((building, i): void => {
      dummy.position.set(building.x, 2.55, building.z - 7.1);
      dummy.scale.set(building.sx * 8.5, 0.2, 2.1);
      dummy.updateMatrix();
      awnings.setMatrixAt(i, dummy.matrix);
    });
    awnings.instanceMatrix.needsUpdate = true;
    scene.add(awnings);
  }

  const geo = new THREE.BoxGeometry(13, 1, 13);
  geo.translate(0, 0.5, 0); // scale Y = height from ground
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  mats.forEach((mat: THREE.MeshToonMaterial, type: number): void => {
    const buildings = instances.filter((building) => building.type === type);
    if (buildings.length === 0) return;
    const inst = new THREE.InstancedMesh(geo, mat, buildings.length);
    buildings.forEach((building, i): void => {
      m.makeScale(building.sx, building.height, building.sz);
      m.setPosition(building.x, 0, building.z);
      inst.setMatrixAt(i, m);
      col.setHSL(0, 0, 0.92 + rand() * 0.08);
      inst.setColorAt(i, col);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor !== null) inst.instanceColor.needsUpdate = true;
    scene.add(inst);
  });
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Perimeter barriers (striped) + temple + market landmark huts. Returns clamped bounds. */
export function buildBarriers(
  scene: THREE.Scene,
  toon: (c: number) => THREE.MeshToonMaterial,
  graph: RoadGraph,
): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const n of graph.nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minZ = Math.min(minZ, n.z);
    maxZ = Math.max(maxZ, n.z);
  }
  minX -= 10;
  maxX += 10;
  minZ -= 10;
  maxZ += 10;
  const stripe: THREE.CanvasTexture = canvasTex(32, 16, (g): void => {
    g.fillStyle = "#e67e22";
    g.fillRect(0, 0, 32, 16);
    g.fillStyle = "#f5f5f5";
    for (let x = -16; x < 32; x += 16) {
      g.beginPath();
      g.moveTo(x, 16);
      g.lineTo(x + 8, 0);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 8, 16);
      g.fill();
    }
  });
  stripe.wrapS = THREE.RepeatWrapping;
  stripe.repeat.set(4, 1);
  const mat = new THREE.MeshToonMaterial({ map: stripe });
  const wallGeo = new THREE.BoxGeometry(8, 1.6, 0.6);
  const spots: Array<{ x: number; z: number; yaw: number }> = [];
  for (let x = minX; x <= maxX; x += 8) {
    spots.push({ x, z: minZ, yaw: 0 });
    spots.push({ x, z: maxZ, yaw: 0 });
  }
  for (let z = minZ; z <= maxZ; z += 8) {
    spots.push({ x: minX, z, yaw: Math.PI / 2 });
    spots.push({ x: maxX, z, yaw: Math.PI / 2 });
  }
  const inst = new THREE.InstancedMesh(wallGeo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((s: { x: number; z: number; yaw: number }, i: number): void => {
    q.setFromAxisAngle(up, s.yaw);
    m.compose(new THREE.Vector3(s.x, 0.8, s.z), q, new THREE.Vector3(1, 1, 1));
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);
  // Dagoba landmark near centre-north (respects N: unmistakably north of spawn).
  const cx: number = (minX + maxX) / 2;
  const stupa = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 1.2, 12), toon(0xc8b58e));
  base.position.y = 0.6;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 8.8, 1.1, 12), toon(0xf5efe0));
  collar.position.y = 1.65;
  const domeM = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xf5efe0));
  domeM.position.y = 2.1;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 8), toon(0xd4a017));
  spire.position.y = 10.1;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), toon(0xffd36a));
  finial.position.y = 13.2;
  stupa.add(base, collar, domeM, spire, finial);
  stupa.position.set(cx, 0, minZ + 26);
  scene.add(stupa);
  return { minX, maxX, minZ, maxZ };
}
