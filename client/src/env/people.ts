// Pedestrians (FR-22): waiting groups at pickups, walk-to-Tuk on board,
// walk-away on drop, rare wanderers on pavements. Two InstancedMeshes total.

import * as THREE from "three";
import type { RoadGraph } from "../city/roadGraph";
import { mulberry32 } from "../../../shared/prng";

type Mode = "wait" | "toTuk" | "away" | "wander" | "hidden";

interface Person {
  mode: Mode;
  x: number;
  z: number;
  tx: number;
  tz: number;
  speed: number;
  phase: number;
  spot: number; // waiting-spot index, -1 = pool/wanderer
}

const MAX = 24;

export class People {
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private folks: Person[] = [];
  private rand: () => number;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, private graph: RoadGraph, seed: number, gradientMap: THREE.Texture) {
    this.rand = mulberry32(seed + 5);
    const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.75, 4, 8);
    const headGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const bodyMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap });
    const headMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap });
    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, MAX);
    const shirt = new THREE.Color();
    const skinTones: number[] = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
    for (let i = 0; i < MAX; i++) {
      shirt.setHSL(this.rand(), 0.65, 0.55);
      this.bodies.setColorAt(i, shirt);
      this.heads.setColorAt(i, new THREE.Color(skinTones[Math.floor(this.rand() * skinTones.length)] as number));
      this.folks.push({ mode: "hidden", x: 0, z: -50, tx: 0, tz: 0, speed: 1.2, phase: this.rand() * 6.28, spot: -1 });
    }
    if (this.bodies.instanceColor !== null) this.bodies.instanceColor.needsUpdate = true;
    if (this.heads.instanceColor !== null) this.heads.instanceColor.needsUpdate = true;
    // 6 wanderers on pavements
    for (let i = 0; i < 6; i++) {
      const p: Person | undefined = this.folks[i];
      if (p === undefined) continue;
      const n = this.graph.nodes[Math.floor(this.rand() * this.graph.nodes.length)] as { x: number; z: number };
      p.mode = "wander";
      p.x = n.x + 4;
      p.z = n.z;
      this.newWanderTarget(p);
    }
    scene.add(this.bodies, this.heads);
  }

  private newWanderTarget(p: Person): void {
    const n = this.graph.nodes[Math.floor(this.rand() * this.graph.nodes.length)] as { x: number; z: number };
    p.tx = n.x + 4 + (this.rand() - 0.5) * 6;
    p.tz = n.z + (this.rand() - 0.5) * 6;
    p.speed = 1.0 + this.rand() * 0.5;
  }

  /** Two figures per waiting spot (call on init + whenever fares respawn). */
  setWaiting(spots: ReadonlyArray<{ x: number; z: number }>): void {
    // Release old waiters back to hidden (keep wanderers 0..5).
    for (let i = 6; i < MAX; i++) {
      const p: Person | undefined = this.folks[i];
      if (p !== undefined && p.mode === "wait") p.mode = "hidden";
    }
    let slot = 6;
    spots.forEach((s: { x: number; z: number }, si: number): void => {
      for (let k = 0; k < 2 && slot < MAX; k++) {
        const p: Person | undefined = this.folks[slot];
        slot++;
        if (p === undefined) continue;
        p.mode = "wait";
        p.spot = si;
        p.x = s.x + (k === 0 ? -1.2 : 1.2) + (this.rand() - 0.5);
        p.z = s.z + (this.rand() - 0.5) * 2;
      }
    });
  }

  /** Figures at (x,z) walk to the Tuk door then hide (boarded). */
  onPickup(x: number, z: number): void {
    let sent = 0;
    for (const p of this.folks) {
      if (sent >= 2) break;
      if (p.mode !== "wait") continue;
      if (Math.hypot(p.x - x, p.z - z) > 6) continue;
      p.mode = "toTuk";
      p.tx = x;
      p.tz = z;
      p.speed = 2.2;
      sent++;
    }
  }

  /** Two figures appear at the drop and walk away, then hide. */
  onDrop(x: number, z: number): void {
    let sent = 0;
    for (const p of this.folks) {
      if (sent >= 2) break;
      if (p.mode !== "hidden") continue;
      p.mode = "away";
      p.x = x + (this.rand() - 0.5) * 2;
      p.z = z + (this.rand() - 0.5) * 2;
      const a: number = this.rand() * Math.PI * 2;
      p.tx = p.x + Math.sin(a) * 9;
      p.tz = p.z + Math.cos(a) * 9;
      p.speed = 1.6;
      sent++;
    }
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.folks.length; i++) {
      const p: Person | undefined = this.folks[i];
      if (p === undefined) continue;
      if (p.mode === "toTuk" || p.mode === "away" || p.mode === "wander") {
        const dx: number = p.tx - p.x;
        const dz: number = p.tz - p.z;
        const d: number = Math.hypot(dx, dz);
        if (d < 0.4) {
          if (p.mode === "wander") this.newWanderTarget(p);
          else p.mode = "hidden";
        } else {
          p.x += (dx / d) * p.speed * dt;
          p.z += (dz / d) * p.speed * dt;
        }
      }
      const walking: boolean = p.mode === "toTuk" || p.mode === "away" || p.mode === "wander";
      const bob: number = walking ? Math.abs(Math.sin(time * 9 + p.phase)) * 0.09 : Math.sin(time * 2 + p.phase) * 0.03;
      const yaw: number =
        walking && Math.hypot(p.tx - p.x, p.tz - p.z) > 0.2 ? Math.atan2(p.tx - p.x, p.tz - p.z) : p.phase;
      const hide: boolean = p.mode === "hidden";
      this.dummy.position.set(p.x, hide ? -60 : 0.85 + bob, p.z);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.setScalar(hide ? 0.001 : 1);
      this.dummy.updateMatrix();
      this.bodies.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.y = hide ? -60 : 1.72 + bob;
      this.dummy.updateMatrix();
      this.heads.setMatrixAt(i, this.dummy.matrix);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
}
