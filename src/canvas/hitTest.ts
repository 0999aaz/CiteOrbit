/**
 * Hit testing with screen-to-world inverse projection against animated world positions.
 * Screen tolerance is divided by scale to ensure consistent interaction across all zoom levels.
 */
import type { CameraState } from './camera.ts';
import { screenToWorld } from './camera.ts';
import type { GNode } from '../data/schema.ts';
import type { ClusterAnchor, WorldPoint } from '../layout/positions.ts';

export interface HitResult {
  hitType: 'node' | 'subfield' | 'none';
  node?: GNode;
  subfieldId?: string;
  distance: number;
}

/**
 * Hit test for mouse pointer interaction using the exact animated coordinates
 * from the most recently rendered frame.
 */
export function hitTest(
  screenX: number,
  screenY: number,
  originX: number,
  originY: number,
  camera: CameraState,
  nodes: readonly GNode[],
  nodePositions: ReadonlyMap<string, WorldPoint>,
  clusterAnchors: ReadonlyMap<string, ClusterAnchor>
): HitResult {
  const world = screenToWorld(screenX, screenY, originX, originY, camera);
  const baseTolerance = 18 / camera.scale;

  let closestNode: GNode | null = null;
  let minNodeDist = Infinity;

  // 1. Check nodes using animated world coordinates
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const pos = nodePositions.get(node.id);
    if (!pos) continue;

    const dx = world.x - pos.x;
    const dy = world.y - pos.y;
    const dist = Math.hypot(dx, dy);

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

  // 2. Check animated cluster centers
  let closestClusterId: string | null = null;
  let minClusterDist = Infinity;
  const clusterTolerance = 52 / camera.scale;

  for (const [sfId, anchor] of clusterAnchors.entries()) {
    const dx = world.x - anchor.x;
    const dy = world.y - anchor.y;
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
