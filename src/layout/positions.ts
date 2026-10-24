/**
 * Single source of truth for animated world-space coordinates of subfield cluster anchors
 * and intra-cluster nodes. Shared identically by both renderer.ts and hitTest.ts.
 *
 * When an `out` Map is supplied (e.g. from RenderScratch), entry objects are mutated in-place
 * to guarantee zero heap allocations per animation frame after warmup.
 */
import type { GNode, Subfield } from '../data/schema.ts';
import { BASE_ORBIT_RADIUS, type SubfieldBasePolar } from './precompute.ts';

export interface ClusterAnchor {
  x: number;
  y: number;
  isSelected: boolean;
  isHovered: boolean;
}

export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * Computes animated world-space positions of subfield cluster centers at `timeSec`.
 * Preserves exact visual parameters:
 * - Float amplitude: 2.5px, angular frequency 1.2 rad/s, phase offset idx * 1.25
 * - Selected cluster radial expansion: 1.18x
 * - Hovered cluster radial offset: +6px
 */
export function computeClusterAnchors(
  subfields: readonly Subfield[],
  base: ReadonlyMap<string, SubfieldBasePolar>,
  timeSec: number,
  selectedSubfieldId: string | null,
  hoveredSubfieldId: string | null,
  out?: Map<string, ClusterAnchor>
): Map<string, ClusterAnchor> {
  const result = out ?? new Map<string, ClusterAnchor>();

  for (let idx = 0; idx < subfields.length; idx++) {
    const sf = subfields[idx];
    const rawPos = base.get(sf.id);
    const angle = rawPos ? rawPos.angle : 0;
    const baseRadius = rawPos ? rawPos.radius : BASE_ORBIT_RADIUS;

    const isSelected = sf.id === selectedSubfieldId;
    const isHovered = sf.id === hoveredSubfieldId;

    const floatOffset = Math.sin(timeSec * 1.2 + idx * 1.25) * 2.5;
    let effectiveRadius = baseRadius + floatOffset;

    if (isSelected) {
      effectiveRadius *= 1.18;
    } else if (isHovered) {
      effectiveRadius += 6;
    }

    const ax = Math.cos(angle) * effectiveRadius;
    const ay = Math.sin(angle) * effectiveRadius;

    const existing = result.get(sf.id);
    if (existing) {
      existing.x = ax;
      existing.y = ay;
      existing.isSelected = isSelected;
      existing.isHovered = isHovered;
    } else {
      result.set(sf.id, {
        x: ax,
        y: ay,
        isSelected,
        isHovered,
      });
    }
  }

  if (result.size > subfields.length) {
    const validIds = new Set<string>();
    for (let i = 0; i < subfields.length; i++) validIds.add(subfields[i].id);
    for (const k of result.keys()) {
      if (!validIds.has(k)) result.delete(k);
    }
  }

  return result;
}

/**
 * Computes animated world-space positions of all graph nodes at `timeSec`.
 * Preserves exact visual parameters:
 * - Root node anchored at (0, 0)
 * - Alternating CW/CCW intra-cluster orbital wobble: (0.07 + (k % 20) * 0.004) * direction
 * - Intra-cluster expansion when parent subfield is selected: 1.12x
 */
export function computeNodePositions(
  nodes: readonly GNode[],
  rootId: string,
  anchors: ReadonlyMap<string, ClusterAnchor>,
  timeSec: number,
  out?: Map<string, WorldPoint>
): Map<string, WorldPoint> {
  const result = out ?? new Map<string, WorldPoint>();

  for (let k = 0; k < nodes.length; k++) {
    const node = nodes[k];

    if (node.id === rootId || node.subfieldId === 'root') {
      const existingRoot = result.get(node.id);
      if (existingRoot) {
        existingRoot.x = 0;
        existingRoot.y = 0;
      } else {
        result.set(node.id, { x: 0, y: 0 });
      }
      continue;
    }

    const clusterAnchor = anchors.get(node.subfieldId);
    if (!clusterAnchor) {
      continue;
    }

    const direction = k % 2 === 0 ? 1 : -1;
    const wobbleSpeed = (0.07 + (k % 20) * 0.004) * direction;
    const currentAngle = node.orbitAngle + timeSec * wobbleSpeed;

    let r = node.orbitRadius;
    if (clusterAnchor.isSelected) {
      r *= 1.12;
    }

    const nx = clusterAnchor.x + Math.cos(currentAngle) * r;
    const ny = clusterAnchor.y + Math.sin(currentAngle) * r;

    const existing = result.get(node.id);
    if (existing) {
      existing.x = nx;
      existing.y = ny;
    } else {
      result.set(node.id, { x: nx, y: ny });
    }
  }

  if (result.size > nodes.length) {
    const validIds = new Set<string>();
    for (let i = 0; i < nodes.length; i++) validIds.add(nodes[i].id);
    for (const key of result.keys()) {
      if (!validIds.has(key)) result.delete(key);
    }
  }

  return result;
}
