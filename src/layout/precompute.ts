/**
 * Precomputes polar coordinates into world Cartesian coordinates (x, y)
 * Rooted at (0, 0) in world coordinate space.
 * Why precomputed polar layout instead of force-directed:
 * Radial hierarchical structure communicates citation genesis without nondeterministic jitter,
 * saves hundreds of CPU cycles per frame, and gives an instant 60 FPS baseline on 800+ nodes.
 */
import type { Graph, GNode, Subfield } from '../data/schema.ts';

export interface LayoutResult {
  nodes: GNode[];
  subfieldPositions: Map<string, { x: number; y: number; angle: number; radius: number }>;
  orbitRadii: [number, number, number]; // Three subtle orbit rings
}

export const BASE_ORBIT_RADIUS = 260;

export function precomputeGraphLayout(graph: Graph): LayoutResult {
  const subfieldPositions = new Map<string, { x: number; y: number; angle: number; radius: number }>();
  const totalSubfields = graph.subfields.length;

  // 1. Calculate each subfield anchor in world polar space
  graph.subfields.forEach((sf, idx) => {
    // Offset starting angle so clusters don't overlap vertically
    const angle = (idx / totalSubfields) * Math.PI * 2 - Math.PI / 2;
    // Vary orbit radius slightly for organic visual rhythm without cluttering
    const radius = BASE_ORBIT_RADIUS + ((idx % 2 === 0) ? -12 : 14);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    subfieldPositions.set(sf.id, { x, y, angle, radius });
  });

  // 2. Precompute world coordinates for every node
  const positionedNodes: GNode[] = graph.nodes.map(node => {
    // Root node sits at (0, 0)
    if (node.id === graph.root.id || node.subfieldId === 'root') {
      return {
        ...node,
        x: 0,
        y: 0,
      };
    }

    const clusterAnchor = subfieldPositions.get(node.subfieldId) || { x: 0, y: 0, angle: 0, radius: BASE_ORBIT_RADIUS };

    // Compute relative world coordinate from local polar angle and radius
    const nx = clusterAnchor.x + Math.cos(node.orbitAngle) * node.orbitRadius;
    const ny = clusterAnchor.y + Math.sin(node.orbitAngle) * node.orbitRadius;

    return {
      ...node,
      x: nx,
      y: ny,
    };
  });

  return {
    nodes: positionedNodes,
    subfieldPositions,
    orbitRadii: [BASE_ORBIT_RADIUS * 0.6, BASE_ORBIT_RADIUS, BASE_ORBIT_RADIUS * 1.35],
  };
}
