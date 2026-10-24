/**
 * Precomputes static polar baselines (angle, radius) for subfields and orbit rings.
 * Dynamic world Cartesian coordinates (x, y) are computed exclusively via src/layout/positions.ts
 * so renderer and hit-testing never diverge.
 */
import type { Graph, GNode } from '../data/schema.ts';

export interface SubfieldBasePolar {
  angle: number;
  radius: number;
}

export interface LayoutResult {
  nodes: GNode[];
  subfieldPositions: Map<string, SubfieldBasePolar>;
  orbitRadii: [number, number, number];
}

export const BASE_ORBIT_RADIUS = 260;

export function precomputeGraphLayout(graph: Graph): LayoutResult {
  const subfieldPositions = new Map<string, SubfieldBasePolar>();
  const totalSubfields = graph.subfields.length || 1;

  // Compute each subfield's static polar baseline (angle, radius)
  graph.subfields.forEach((sf, idx) => {
    const angle = (idx / totalSubfields) * Math.PI * 2 - Math.PI / 2;
    const radius = BASE_ORBIT_RADIUS + (idx % 2 === 0 ? -12 : 14);
    subfieldPositions.set(sf.id, { angle, radius });
  });

  return {
    nodes: graph.nodes,
    subfieldPositions,
    orbitRadii: [BASE_ORBIT_RADIUS * 0.6, BASE_ORBIT_RADIUS, BASE_ORBIT_RADIUS * 1.35],
  };
}
