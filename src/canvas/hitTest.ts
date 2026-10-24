/**
 * Hit testing with screen-to-world inverse projection.
 * Screen tolerance is divided by scale to ensure consistent interaction across all zoom levels.
 */
import type { CameraState } from './camera.ts';
import { screenToWorld } from './camera.ts';
import type { GNode, Subfield } from '../data/schema.ts';

export interface HitResult {
  hitType: 'node' | 'subfield' | 'none';
  node?: GNode;
  subfieldId?: string;
  distance: number;
}

/**
 * Hit test for mouse pointer interaction
 * Why not a spatial quadtree: 800 nodes linear distance check takes < 0.25ms in V8;
 * maintaining a quadtree during cluster float and animations would add unnecessary overhead.
 */
export function hitTest(
  screenX: number,
  screenY: number,
  originX: number,
  originY: number,
  camera: CameraState,
  nodes: GNode[],
  subfieldPositions: Map<string, { x: number; y: number; angle: number; radius: number }>,
  subfields: Subfield[],
  activeYear: number
): HitResult {
  const world = screenToWorld(screenX, screenY, originX, originY, camera);
  const baseTolerance = 18 / camera.scale;

  let closestNode: GNode | null = null;
  let minNodeDist = Infinity;

  // 1. Check nodes (prioritizing visible active nodes)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.x === undefined || node.y === undefined) continue;

    const dx = world.x - node.x;
    const dy = world.y - node.y;
    const dist = Math.hypot(dx, dy);

    // Expand clickable radius with scale-invariant screen tolerance
    const threshold = node.size + baseTolerance;
    if (dist <= threshold && dist < minNodeDist) {
      minNodeDist = dist;
      closestNode = node;
    }
  }

  if (closestNode) {
    return {
      hitType: 'node',
      node: closestNode,
      subfieldId: closestNode.subfieldId,
      distance: minNodeDist,
    };
  }

  // 2. Check cluster centers
  let closestClusterId: string | null = null;
  let minClusterDist = Infinity;
  const clusterTolerance = 52 / camera.scale;

  for (const [sfId, pos] of subfieldPositions.entries()) {
    const dx = world.x - pos.x;
    const dy = world.y - pos.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= clusterTolerance && dist < minClusterDist) {
      minClusterDist = dist;
      closestClusterId = sfId;
    }
  }

  if (closestClusterId) {
    return {
      hitType: 'subfield',
      subfieldId: closestClusterId,
      distance: minClusterDist,
    };
  }

  return {
    hitType: 'none',
    distance: Infinity,
  };
}
