/**
 * Level of Detail (LOD) management based on camera zoom scale.
 * Provides smooth alpha cross-fades rather than abrupt popping.
 */

export interface LodState {
  showClusters: boolean;
  clusterAlpha: number;

  showNodes: boolean;
  nodeAlpha: number;

  showLabels: boolean;
  labelAlpha: number;

  showDetails: boolean;
  detailAlpha: number;
}

export function computeLod(scale: number): LodState {
  // Level 1: Cluster centers & major backbone links (always visible)
  const clusterAlpha = 1.0;

  // Level 2: Intra-cluster nodes and secondary citation curves
  // Fades in between scale 0.70 and 0.95
  let nodeAlpha = 0;
  if (scale >= 0.95) {
    nodeAlpha = 1.0;
  } else if (scale >= 0.70) {
    nodeAlpha = (scale - 0.70) / (0.95 - 0.70);
  }

  // Level 3: Node labels and kind badges
  // Fades in between scale 1.70 and 2.10
  let labelAlpha = 0;
  if (scale >= 2.10) {
    labelAlpha = 1.0;
  } else if (scale >= 1.70) {
    labelAlpha = (scale - 1.70) / (2.10 - 1.70);
  }

  // Level 4: Full citation stats tag
  let detailAlpha = 0;
  if (scale >= 2.8) {
    detailAlpha = 1.0;
  } else if (scale >= 2.4) {
    detailAlpha = (scale - 2.4) / (2.8 - 2.4);
  }

  return {
    showClusters: true,
    clusterAlpha,
    showNodes: nodeAlpha > 0.01,
    nodeAlpha,
    showLabels: labelAlpha > 0.01,
    labelAlpha,
    showDetails: detailAlpha > 0.01,
    detailAlpha,
  };
}
