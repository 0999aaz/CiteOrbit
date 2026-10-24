/**
 * Pure 2D Canvas Renderer for Paper Atlas.
 * Architectural purity: Zero React dependencies, zero store access, zero setState calls.
 * Supports reusable `RenderScratch` buffers for zero-allocation 60 FPS rendering,
 * compound path batching for edges/particles, and zero per-node save/restore overhead.
 */
import type { Graph, GNode, Subfield } from '../data/schema.ts';
import type { CameraState } from './camera.ts';
import { computeLod } from './lod.ts';
import type { SubfieldBasePolar } from '../layout/precompute.ts';
import {
  computeClusterAnchors,
  computeNodePositions,
  type ClusterAnchor,
  type WorldPoint,
} from '../layout/positions.ts';

export interface RenderState {
  graph: Graph;
  subfieldPositions: ReadonlyMap<string, SubfieldBasePolar>;
  orbitRadii: [number, number, number];
  selectedSubfieldId: string | null;
  hoveredSubfieldId: string | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  activeYear: number;
  isForecasting: boolean;
}

export interface RenderDimensions {
  width: number;
  height: number;
  dpr: number;
}

export interface RenderMetrics {
  nodesDrawn: number;
  edgesDrawn: number;
  renderTimeMs: number;
}

export interface NodeRenderEntry {
  x: number;
  y: number;
  size: number;
  node: GNode;
  isPastYear: boolean;
  isSelectedCluster: boolean;
  isHovered: boolean;
  isSelected: boolean;
}

/**
 * Reusable frame scratchpad passed from host ref so steady-state frames allocate
 * zero Maps, Sets, or edge/particle coordinate objects.
 */
export interface RenderScratch {
  clusterAnchors: Map<string, ClusterAnchor>;
  nodePositions: Map<string, WorldPoint>;
  nodeRenderMap: Map<string, NodeRenderEntry>;
  subfieldById: Map<string, Subfield>;
  cachedGraphRef: Graph | null;
  selectedNodeNeighbors: Set<string>;
  cachedSelectedNodeId: string | null;
  // Flat numeric segment buffers: [sx, sy, cx, cy, tx, ty, ...]
  directActiveSegs: number[];
  directPastSegs: number[];
  clusterActiveSegs: number[];
  clusterPastSegs: number[];
  bgActiveSegs: number[];
  bgPastSegs: number[];
  // Flat numeric particle coordinate buffers: [px, py, ...]
  selectedParticles: number[];
  ambientParticles: number[];
  // Cached font strings keyed by camera.scale
  cachedScale: number;
  fontCluster: string;
  fontNodeRegular: string;
  fontNodeSelected: string;
  fontNodeDetail: string;
  fontRootTitle: string;
  fontRootSub: string;
}

export function createRenderScratch(): RenderScratch {
  return {
    clusterAnchors: new Map(),
    nodePositions: new Map(),
    nodeRenderMap: new Map(),
    subfieldById: new Map(),
    cachedGraphRef: null,
    selectedNodeNeighbors: new Set(),
    cachedSelectedNodeId: '__uninitialized__',
    directActiveSegs: [],
    directPastSegs: [],
    clusterActiveSegs: [],
    clusterPastSegs: [],
    bgActiveSegs: [],
    bgPastSegs: [],
    selectedParticles: [],
    ambientParticles: [],
    cachedScale: -1,
    fontCluster: '',
    fontNodeRegular: '',
    fontNodeSelected: '',
    fontNodeDetail: '',
    fontRootTitle: '',
    fontRootSub: '',
  };
}

const PALETTE = {
  bgVoid: '#030607',
  bgDeep: '#0A1417',
  border: 'rgba(255, 255, 255, 0.07)',
  textHi: '#DDDFE0',
  text: '#A6A6A6',
  textDim: '#7B848B',
  textFaint: '#4E6069',
  accent: '#956256',
  accentHi: '#E6D29A',
  kindPaper: '#8FB6D8',
  kindReview: '#E6D29A',
  kindAuthor: '#8FC9C0',
  kindVenue: '#C58FB8',
  rootNode: '#B98FE8',
};

const ORBIT_RING_STYLES = [
  'rgba(255, 255, 255, 0.07)',
  'rgba(255, 255, 255, 0.055)',
  'rgba(255, 255, 255, 0.04)',
] as const;

function getNodeColor(kind: string): string {
  switch (kind) {
    case 'paper':
      return PALETTE.kindPaper;
    case 'review':
      return PALETTE.kindReview;
    case 'author':
      return PALETTE.kindAuthor;
    case 'venue':
      return PALETTE.kindVenue;
    default:
      return PALETTE.kindPaper;
  }
}

function strokeBezierBucket(
  ctx: CanvasRenderingContext2D,
  segs: readonly number[],
  strokeStyle: string,
  lineWidth: number
): void {
  if (segs.length === 0) return;
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 6) {
    ctx.moveTo(segs[i], segs[i + 1]);
    ctx.quadraticCurveTo(segs[i + 2], segs[i + 3], segs[i + 4], segs[i + 5]);
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function fillParticleBucket(
  ctx: CanvasRenderingContext2D,
  coords: readonly number[],
  radius: number,
  fillStyle: string
): void {
  if (coords.length === 0) return;
  ctx.beginPath();
  const twoPi = Math.PI * 2;
  for (let i = 0; i < coords.length; i += 2) {
    const px = coords[i];
    const py = coords[i + 1];
    ctx.moveTo(px + radius, py);
    ctx.arc(px, py, radius, 0, twoPi);
  }
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function updateCachedFonts(scratch: RenderScratch, scale: number): void {
  if (scratch.cachedScale === scale) return;
  scratch.cachedScale = scale;
  scratch.fontCluster = `500 ${Math.max(9, 10 / scale)}px Inter, sans-serif`;
  const nodeLabelPx = Math.max(8.5, 9 / scale);
  scratch.fontNodeRegular = `400 ${nodeLabelPx}px Inter, sans-serif`;
  scratch.fontNodeSelected = `500 ${nodeLabelPx}px Inter, sans-serif`;
  scratch.fontNodeDetail = `400 ${Math.max(7.5, 8 / scale)}px Inter, sans-serif`;
  scratch.fontRootTitle = `500 ${Math.max(10, 11 / scale)}px Inter, sans-serif`;
  scratch.fontRootSub = `400 ${Math.max(8.5, 9 / scale)}px Inter, sans-serif`;
}

const fallbackScratch = createRenderScratch();

/**
 * Main Pure Render Function
 */
export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  camera: CameraState,
  timeSec: number,
  dims: RenderDimensions,
  scratch: RenderScratch = fallbackScratch
): RenderMetrics {
  const startTime = performance.now();
  const { width, height } = dims;

  // Origin point according to layout specs: (0.42W, 0.54H)
  const originX = width * 0.42;
  const originY = height * 0.54;
  const invScale = 1 / camera.scale;

  let nodesDrawn = 0;
  let edgesDrawn = 0;

  updateCachedFonts(scratch, camera.scale);

  if (scratch.cachedGraphRef !== state.graph) {
    scratch.cachedGraphRef = state.graph;
    scratch.subfieldById.clear();
    for (let i = 0; i < state.graph.subfields.length; i++) {
      const sf = state.graph.subfields[i];
      scratch.subfieldById.set(sf.id, sf);
    }
    scratch.cachedSelectedNodeId = '__uninitialized__';
  }

  // 1. Clear background completely across entire physical canvas buffer
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.bgVoid;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 2. Set DPR transform once for uniform logical coordinate space
  ctx.save();
  ctx.scale(dims.dpr, dims.dpr);

  // Subtle ambient radial backdrop glow from center root
  const rootGrad = ctx.createRadialGradient(
    originX + camera.x,
    originY + camera.y,
    10 * camera.scale,
    originX + camera.x,
    originY + camera.y,
    Math.min(width, height) * 0.48 * camera.scale
  );
  rootGrad.addColorStop(0, 'rgba(185, 143, 232, 0.04)');
  rootGrad.addColorStop(0.5, 'rgba(10, 20, 23, 0.4)');
  rootGrad.addColorStop(1, 'rgba(3, 6, 7, 0)');
  ctx.fillStyle = rootGrad;
  ctx.fillRect(0, 0, width, height);

  // 3. Setup Camera World Space Transform (inside DPR)
  ctx.save();
  ctx.translate(originX + camera.x, originY + camera.y);
  ctx.scale(camera.scale, camera.scale);

  const lod = computeLod(camera.scale);

  // Visible viewport bounding box in world coordinates (frustum culling)
  const viewMargin = 80 * invScale;
  const worldMinX = (-originX - camera.x) * invScale - viewMargin;
  const worldMaxX = (width - originX - camera.x) * invScale + viewMargin;
  const worldMinY = (-originY - camera.y) * invScale - viewMargin;
  const worldMaxY = (height - originY - camera.y) * invScale + viewMargin;

  // Compute animated cluster positions in-place via shared positions.ts
  const animatedClusterAnchors = computeClusterAnchors(
    state.graph.subfields,
    state.subfieldPositions,
    timeSec,
    state.selectedSubfieldId,
    state.hoveredSubfieldId,
    scratch.clusterAnchors
  );

  // Draw Orbit Rings (1px, subtle alpha 0.07 / 0.055 / 0.04)
  ctx.lineWidth = invScale;
  for (let idx = 0; idx < state.orbitRadii.length; idx++) {
    ctx.beginPath();
    ctx.arc(0, 0, state.orbitRadii[idx], 0, Math.PI * 2);
    ctx.strokeStyle = ORBIT_RING_STYLES[idx] ?? ORBIT_RING_STYLES[2];
    ctx.stroke();
  }

  // 4. Draw Radar Sweep line (0.9 rad/s, linear gradient fade)
  const radarSweepAngle = (timeSec * 0.9) % (Math.PI * 2);
  const radarMaxRadius = state.orbitRadii[2] || 350;
  ctx.save();
  ctx.rotate(radarSweepAngle);
  const sweepGrad = ctx.createLinearGradient(0, 0, radarMaxRadius, 0);
  sweepGrad.addColorStop(0, 'rgba(230, 210, 154, 0.18)');
  sweepGrad.addColorStop(0.7, 'rgba(230, 210, 154, 0.06)');
  sweepGrad.addColorStop(1, 'rgba(230, 210, 154, 0)');
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radarMaxRadius, -0.22, 0, false);
  ctx.closePath();
  ctx.fillStyle = sweepGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(radarMaxRadius, 0);
  ctx.strokeStyle = 'rgba(230, 210, 154, 0.28)';
  ctx.lineWidth = invScale;
  ctx.stroke();
  ctx.restore();

  // 5. Compute animated node positions in-place and update reusable nodeRenderMap
  const animatedNodePositions = computeNodePositions(
    state.graph.nodes,
    state.graph.root.id,
    animatedClusterAnchors,
    timeSec,
    scratch.nodePositions
  );

  const nodeRenderMap = scratch.nodeRenderMap;
  const graphNodes = state.graph.nodes;
  for (let i = 0; i < graphNodes.length; i++) {
    const node = graphNodes[i];
    const pos = animatedNodePositions.get(node.id);
    if (!pos) continue;

    const isPastYear = node.year > state.activeYear;
    const isSelectedCluster = node.subfieldId === state.selectedSubfieldId;
    const isHovered = node.id === state.hoveredNodeId;
    const isSelected = node.id === state.selectedNodeId;

    const existing = nodeRenderMap.get(node.id);
    if (existing) {
      existing.x = pos.x;
      existing.y = pos.y;
      existing.size = node.size;
      existing.node = node;
      existing.isPastYear = isPastYear;
      existing.isSelectedCluster = isSelectedCluster;
      existing.isHovered = isHovered;
      existing.isSelected = isSelected;
    } else {
      nodeRenderMap.set(node.id, {
        x: pos.x,
        y: pos.y,
        size: node.size,
        node,
        isPastYear,
        isSelectedCluster,
        isHovered,
        isSelected,
      });
    }
  }

  // Update 1st-degree citation neighbors only when selectedNodeId changes
  const selectedNodeNeighbors = scratch.selectedNodeNeighbors;
  if (scratch.cachedSelectedNodeId !== state.selectedNodeId) {
    scratch.cachedSelectedNodeId = state.selectedNodeId;
    selectedNodeNeighbors.clear();
    if (state.selectedNodeId) {
      selectedNodeNeighbors.add(state.selectedNodeId);
      const edges = state.graph.edges;
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        if (edge.source === state.selectedNodeId) selectedNodeNeighbors.add(edge.target);
        if (edge.target === state.selectedNodeId) selectedNodeNeighbors.add(edge.source);
      }
    }
  }

  // 6. Batch Edges & Particles into flat reusable arrays (6 stroke passes instead of 3,600+)
  const directActiveSegs = scratch.directActiveSegs;
  const directPastSegs = scratch.directPastSegs;
  const clusterActiveSegs = scratch.clusterActiveSegs;
  const clusterPastSegs = scratch.clusterPastSegs;
  const bgActiveSegs = scratch.bgActiveSegs;
  const bgPastSegs = scratch.bgPastSegs;
  const selectedParticles = scratch.selectedParticles;
  const ambientParticles = scratch.ambientParticles;

  directActiveSegs.length = 0;
  directPastSegs.length = 0;
  clusterActiveSegs.length = 0;
  clusterPastSegs.length = 0;
  bgActiveSegs.length = 0;
  bgPastSegs.length = 0;
  selectedParticles.length = 0;
  ambientParticles.length = 0;

  const hasFocus = Boolean(state.selectedNodeId || state.selectedSubfieldId);
  const edges = state.graph.edges;

  for (let edgeIdx = 0; edgeIdx < edges.length; edgeIdx++) {
    const edge = edges[edgeIdx];
    const src = nodeRenderMap.get(edge.source);
    const tgt = nodeRenderMap.get(edge.target);
    if (!src || !tgt) continue;

    const minEx = src.x < tgt.x ? src.x : tgt.x;
    const maxEx = src.x > tgt.x ? src.x : tgt.x;
    const minEy = src.y < tgt.y ? src.y : tgt.y;
    const maxEy = src.y > tgt.y ? src.y : tgt.y;
    if (maxEx < worldMinX || minEx > worldMaxX || maxEy < worldMinY || minEy > worldMaxY) {
      continue;
    }

    const isDirectNodeEdge = state.selectedNodeId !== null &&
      (edge.source === state.selectedNodeId || edge.target === state.selectedNodeId);

    const isIntraClusterEdge = !state.selectedNodeId && state.selectedSubfieldId !== null &&
      src.node.subfieldId === state.selectedSubfieldId &&
      tgt.node.subfieldId === state.selectedSubfieldId;

    const connectsRoot = src.node.subfieldId === 'root' || tgt.node.subfieldId === 'root';
    const isRootBackboneEdge = !state.selectedNodeId && state.selectedSubfieldId !== null && connectsRoot &&
      (src.node.subfieldId === state.selectedSubfieldId || tgt.node.subfieldId === state.selectedSubfieldId);

    const isEdgeSelected = isDirectNodeEdge || isIntraClusterEdge || isRootBackboneEdge;
    if (!lod.showNodes && !connectsRoot && !isEdgeSelected) {
      continue;
    }

    const isEdgePast = src.isPastYear || tgt.isPastYear;

    const mx = (src.x + tgt.x) * 0.5;
    const my = (src.y + tgt.y) * 0.5;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    // Algebraic identity: (-dy / dist) * (0.22 * dist) === -dy * 0.22 (saves 3,600+ sqrt calls/frame)
    const cx = mx - dy * 0.22;
    const cy = my + dx * 0.22;

    if (isDirectNodeEdge) {
      const targetArr = isEdgePast ? directPastSegs : directActiveSegs;
      targetArr.push(src.x, src.y, cx, cy, tgt.x, tgt.y);
      const pPhase = (timeSec * 0.3 + edgeIdx * 0.23) % 1.0;
      const omt = 1 - pPhase;
      selectedParticles.push(
        omt * omt * src.x + 2 * omt * pPhase * cx + pPhase * pPhase * tgt.x,
        omt * omt * src.y + 2 * omt * pPhase * cy + pPhase * pPhase * tgt.y
      );
    } else if (isIntraClusterEdge || isRootBackboneEdge) {
      const targetArr = isEdgePast ? clusterPastSegs : clusterActiveSegs;
      targetArr.push(src.x, src.y, cx, cy, tgt.x, tgt.y);
      const pPhase = (timeSec * 0.21 + edgeIdx * 0.19) % 1.0;
      const omt = 1 - pPhase;
      selectedParticles.push(
        omt * omt * src.x + 2 * omt * pPhase * cx + pPhase * pPhase * tgt.x,
        omt * omt * src.y + 2 * omt * pPhase * cy + pPhase * pPhase * tgt.y
      );
    } else {
      const targetArr = isEdgePast ? bgPastSegs : bgActiveSegs;
      targetArr.push(src.x, src.y, cx, cy, tgt.x, tgt.y);
      if (!hasFocus && edgeIdx % 4 === 0) {
        const pPhase = (timeSec * 0.12 + edgeIdx * 0.17) % 1.0;
        const omt = 1 - pPhase;
        ambientParticles.push(
          omt * omt * src.x + 2 * omt * pPhase * cx + pPhase * pPhase * tgt.x,
          omt * omt * src.y + 2 * omt * pPhase * cy + pPhase * pPhase * tgt.y
        );
      }
    }

    edgesDrawn++;
  }

  // Render batched edge buckets back-to-front so focal gold edges sit crisply on top
  const bgActiveStyle = hasFocus ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.055)';
  strokeBezierBucket(ctx, bgPastSegs, 'rgba(255, 255, 255, 0.015)', 0.75 * invScale);
  strokeBezierBucket(ctx, bgActiveSegs, bgActiveStyle, 0.75 * invScale);
  strokeBezierBucket(ctx, clusterPastSegs, 'rgba(230, 210, 154, 0.16)', 1.25 * invScale);
  strokeBezierBucket(ctx, clusterActiveSegs, 'rgba(230, 210, 154, 0.40)', 1.25 * invScale);
  strokeBezierBucket(ctx, directPastSegs, 'rgba(230, 210, 154, 0.25)', 1.75 * invScale);
  strokeBezierBucket(ctx, directActiveSegs, 'rgba(230, 210, 154, 0.85)', 1.75 * invScale);

  // 7. Draw batched edge particles (2 fill calls total)
  fillParticleBucket(ctx, ambientParticles, 1.2 * invScale, 'rgba(143, 182, 216, 0.45)');
  fillParticleBucket(ctx, selectedParticles, 1.8 * invScale, PALETTE.accentHi);

  // 8. Draw Subfield Cluster Centers and Hull Rings
  ctx.font = scratch.fontCluster;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const clusterFontSize = Math.max(9, 10 * invScale);

  for (const [sfId, anchor] of animatedClusterAnchors.entries()) {
    const isSelected = anchor.isSelected;
    const isHovered = anchor.isHovered;

    ctx.beginPath();
    const haloRadius = isSelected ? 48 : isHovered ? 44 : 36;
    ctx.arc(anchor.x, anchor.y, haloRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isSelected
      ? 'rgba(230, 210, 154, 0.45)'
      : isHovered
        ? 'rgba(255, 255, 255, 0.22)'
        : 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = (isSelected ? 1.5 : 1) * invScale;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 4 * invScale, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? PALETTE.accentHi : PALETTE.textDim;
    ctx.fill();

    const subfield = scratch.subfieldById.get(sfId);
    if (subfield) {
      const labelText = subfield.name;
      const textWidth = ctx.measureText(labelText).width;
      const labelY = anchor.y - (haloRadius + 10);

      ctx.fillStyle = 'rgba(10, 20, 23, 0.88)';
      ctx.beginPath();
      const padX = 6 * invScale;
      const padY = 3 * invScale;
      ctx.roundRect(
        anchor.x - textWidth / 2 - padX,
        labelY - clusterFontSize / 2 - padY,
        textWidth + padX * 2,
        clusterFontSize + padY * 2,
        4 * invScale
      );
      ctx.fill();

      ctx.strokeStyle = isSelected ? 'rgba(230, 210, 154, 0.4)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = invScale;
      ctx.stroke();

      ctx.fillStyle = isSelected ? PALETTE.accentHi : isHovered ? PALETTE.textHi : PALETTE.text;
      ctx.fillText(labelText, anchor.x, labelY);
    }
  }

  // 9. Draw Nodes (zero per-node ctx.save/restore; hoisted text alignment & cached fonts)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let currentFont = '';
  const twoPi = Math.PI * 2;
  const rootNodeId = state.graph.root.id;

  for (let i = 0; i < graphNodes.length; i++) {
    const node = graphNodes[i];
    if (node.id === rootNodeId || node.subfieldId === 'root') continue;

    const item = nodeRenderMap.get(node.id);
    if (!item) continue;

    const { x, y, size, isPastYear, isSelectedCluster, isHovered } = item;

    if (x < worldMinX || x > worldMaxX || y < worldMinY || y > worldMaxY) {
      continue;
    }

    if (!lod.showNodes && !isSelectedCluster) {
      continue;
    }

    const isDirectlySelected = item.isSelected;
    const isNeighborOfSelected = state.selectedNodeId !== null && selectedNodeNeighbors.has(node.id);

    let effectiveAlpha = isPastYear ? 0.16 : 0.85 * lod.nodeAlpha;
    if (state.selectedNodeId) {
      if (isDirectlySelected) {
        effectiveAlpha = 1.0;
      } else if (isNeighborOfSelected) {
        effectiveAlpha = isPastYear ? 0.25 : 0.95;
      } else {
        effectiveAlpha = isPastYear ? 0.05 : 0.22;
      }
    } else if (state.selectedSubfieldId) {
      if (isSelectedCluster) {
        effectiveAlpha = isPastYear ? 0.20 : 1.0;
      } else {
        effectiveAlpha = isPastYear ? 0.06 : 0.28;
      }
    }

    ctx.globalAlpha = effectiveAlpha;
    const nodeColor = isDirectlySelected ? PALETTE.accentHi : getNodeColor(node.kind);

    if (isHovered || isDirectlySelected) {
      ctx.shadowColor = PALETTE.accentHi;
      ctx.shadowBlur = 14 * camera.scale;
    }

    ctx.beginPath();
    ctx.arc(x, y, size, 0, twoPi);
    ctx.fillStyle = nodeColor;
    ctx.fill();

    if (isHovered || isDirectlySelected) {
      ctx.shadowBlur = 0;
    }

    if (isDirectlySelected) {
      ctx.beginPath();
      ctx.arc(x, y, size + 3.5, 0, twoPi);
      ctx.strokeStyle = PALETTE.accentHi;
      ctx.lineWidth = 2 * invScale;
      ctx.stroke();
    } else if (isNeighborOfSelected) {
      ctx.beginPath();
      ctx.arc(x, y, size + 2, 0, twoPi);
      ctx.strokeStyle = 'rgba(230, 210, 154, 0.7)';
      ctx.lineWidth = invScale;
      ctx.stroke();
    }

    if (node.kind === 'review' && !isDirectlySelected) {
      ctx.beginPath();
      ctx.arc(x, y, size + 2, 0, twoPi);
      ctx.strokeStyle = PALETTE.kindReview;
      ctx.lineWidth = invScale;
      ctx.stroke();
    }

    if (node.kind === 'author') {
      ctx.beginPath();
      const d = size * 0.7;
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
      ctx.strokeStyle = PALETTE.kindAuthor;
      ctx.lineWidth = invScale;
      ctx.stroke();
    }

    if (lod.showLabels || isHovered || isDirectlySelected || isNeighborOfSelected) {
      ctx.globalAlpha = isHovered || isDirectlySelected
        ? 1.0
        : isNeighborOfSelected
          ? 0.95
          : lod.labelAlpha;

      const desiredFont = isDirectlySelected ? scratch.fontNodeSelected : scratch.fontNodeRegular;
      if (currentFont !== desiredFont) {
        ctx.font = desiredFont;
        currentFont = desiredFont;
      }

      ctx.fillStyle = isDirectlySelected
        ? PALETTE.accentHi
        : isNeighborOfSelected
          ? '#E2E8F0'
          : PALETTE.textHi;

      const displayLabel = node.label.length > 34 ? `${node.label.slice(0, 32)}...` : node.label;
      ctx.fillText(displayLabel, x + size + 5, y);

      if (lod.showDetails || isHovered || isDirectlySelected) {
        if (currentFont !== scratch.fontNodeDetail) {
          ctx.font = scratch.fontNodeDetail;
          currentFont = scratch.fontNodeDetail;
        }
        ctx.fillStyle = isDirectlySelected ? '#E6D29A' : PALETTE.textDim;
        const detailText =
          node.kind === 'author' || node.kind === 'venue'
            ? `${node.paperCount ?? 0} papers · ${(node.citationSum ?? node.weight).toLocaleString()} cites`
            : `${node.year} · ${node.weight.toLocaleString()} cites`;
        ctx.fillText(detailText, x + size + 5, y + 11);
      }
    }

    nodesDrawn++;
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // 10. Draw Center Root Node & Breathing / 26-Notch Tick Ring
  const rootItem = nodeRenderMap.get(rootNodeId);
  const rootX = rootItem ? rootItem.x : 0;
  const rootY = rootItem ? rootItem.y : 0;

  const breathFactor = 1 + Math.sin(timeSec * 1.1) * 0.06;
  const baseRootRadius = 14;
  const rootRadius = baseRootRadius * breathFactor;

  const tickRadius = 32;
  const tickCount = 26;
  const tickRotation = -timeSec * 0.35;

  ctx.beginPath();
  for (let i = 0; i < tickCount; i++) {
    const tickAngle = tickRotation + (i / tickCount) * twoPi;
    const innerT = tickRadius - 3;
    const outerT = tickRadius + (i % 2 === 0 ? 3 : 1);
    const cosA = Math.cos(tickAngle);
    const sinA = Math.sin(tickAngle);
    ctx.moveTo(rootX + cosA * innerT, rootY + sinA * innerT);
    ctx.lineTo(rootX + cosA * outerT, rootY + sinA * outerT);
  }
  ctx.strokeStyle = 'rgba(185, 143, 232, 0.45)';
  ctx.lineWidth = 1.25 * invScale;
  ctx.stroke();

  ctx.shadowColor = PALETTE.rootNode;
  ctx.shadowBlur = 24 * camera.scale;

  const rootFillGrad = ctx.createRadialGradient(rootX, rootY, 0, rootX, rootY, rootRadius);
  rootFillGrad.addColorStop(0, '#E9D5FF');
  rootFillGrad.addColorStop(0.7, PALETTE.rootNode);
  rootFillGrad.addColorStop(1, '#7C3AED');

  ctx.beginPath();
  ctx.arc(rootX, rootY, rootRadius, 0, twoPi);
  ctx.fillStyle = rootFillGrad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#F3E8FF';
  ctx.lineWidth = 1.5 * invScale;
  ctx.stroke();

  ctx.font = scratch.fontRootTitle;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.textHi;
  ctx.fillText('Foundation Benchmark', rootX, rootY + rootRadius + 10);

  ctx.font = scratch.fontRootSub;
  ctx.fillStyle = PALETTE.accentHi;
  const shortRootTitle =
    state.graph.root.label.length > 36
      ? `${state.graph.root.label.slice(0, 34)}...`
      : state.graph.root.label;
  ctx.fillText(shortRootTitle, rootX, rootY + rootRadius + 24);

  nodesDrawn++;

  // Restore world & DPR transforms
  ctx.restore();
  ctx.restore();

  const renderTimeMs = performance.now() - startTime;
  return {
    nodesDrawn,
    edgesDrawn,
    renderTimeMs,
  };
}
