// Deterministic road graph (FR-20, NFR-12). Grid + jitter, connected by construction.

import { mulberry32 } from "../../../shared/prng";

export interface RoadNode {
  readonly x: number;
  readonly z: number;
}

export interface RoadGraph {
  readonly nodes: readonly RoadNode[];
  readonly cols: number;
  readonly rows: number;
  readonly block: number;
  readonly world: number;
}

export function buildRoadGraph(seed: number): RoadGraph {
  const rand: () => number = mulberry32(seed);
  const cols = 8;
  const rows = 8;
  const block = 55;
  const nodes: RoadNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jx: number = (rand() - 0.5) * 14;
      const jz: number = (rand() - 0.5) * 14;
      nodes.push({ x: c * block + jx, z: r * block + jz });
    }
  }
  const world: number = cols * block;
  return { nodes, cols, rows, block, world };
}

export function nearestNode(g: RoadGraph, x: number, z: number): RoadNode {
  let best: RoadNode = g.nodes[0] as RoadNode;
  let bd = Number.POSITIVE_INFINITY;
  for (const n of g.nodes) {
    const d: number = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}
