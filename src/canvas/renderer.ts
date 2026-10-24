/**
 * Pure 2D Canvas Renderer for Paper Atlas.
 * Architectural purity: Zero React dependencies, zero store access, zero setState calls.
 * Designed for pure functional portability (e.g. drop-in replacement with WebGL in future).
 */
import type { Graph, GNode, GEdge, Subfield } from '../data/schema.ts';
import type { CameraState } from './camera.ts';
import { computeLod } from './lod.ts';

export interface RenderState {
  graph: Graph;
  subfieldPositions: Map<string, { x: number; y: number; angle: number; radius: number }>;
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

// Color palette constants
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

function getNodeColor(kind: string): string {
  switch (kind) {
    case 'paper': return PALETTE.kindPaper;
    case 'review': return PALETTE.kindReview;
    case 'author': return PALETTE.kindAuthor;
    case 'venue': return PALETTE.kindVenue;
    default: return PALETTE.kindPaper;
  }
}

/**
 * Main Pure Render Function
 */
export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  camera: CameraState,
  timeSec: number,
  dims: RenderDimensions
): RenderMetrics {
  const startTime = performance.now();
  const { width, height } = dims;

  // Origin point according to prompt layout specs: (0.42W, 0.54H)
  const originX = width * 0.42;
  const originY = height * 0.54;

  let nodesDrawn = 0;
  let edgesDrawn = 0;

  // 1. Clear background completely across entire physical canvas buffer
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PALETTE.bgVoid;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

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

  // Compute LOD state from zoom scale
  const lod = computeLod(camera.scale);

  // Visible viewport bounding box in world coordinates (for frustum/viewport culling)
  const viewMargin = 80 / camera.scale;
  const worldMinX = (-originX - camera.x) / camera.scale - viewMargin;
  const worldMaxX = (width - originX - camera.x) / camera.scale + viewMargin;
  const worldMinY = (-originY - camera.y) / camera.scale - viewMargin;
  const worldMaxY = (height - originY - camera.y) / camera.scale + viewMargin;

  // Compute animated cluster positions
  // Amplitude 2.5px, phase = idx * 1.25 (never in sync)
  const animatedClusterAnchors = new Map<string, { x: number; y: number; isSelected: boolean; isHovered: boolean }>();
  state.graph.subfields.forEach((sf, idx) => {
    const rawPos = state.subfieldPositions.get(sf.id) || { x: 0, y: 0, angle: 0, radius: 260 };
    const isSelected = sf.id === state.selectedSubfieldId;
    const isHovered = sf.id === state.hoveredSubfieldId;

    // Center sine float: 2.5px amplitude, non-synchronous phase
    const floatOffset = Math.sin(timeSec * 1.2 + idx * 1.25) * 2.5;
    let effectiveRadius = rawPos.radius + floatOffset;

    // Hover expands 6px; Selected expands 1.18x
    if (isSelected) {
      effectiveRadius *= 1.18;
    } else if (isHovered) {
      effectiveRadius += 6;
    }

    const ax = Math.cos(rawPos.angle) * effectiveRadius;
    const ay = Math.sin(rawPos.angle) * effectiveRadius;
    animatedClusterAnchors.set(sf.id, { x: ax, y: ay, isSelected, isHovered });
  });

  // 3. Draw Orbit Rings (1px, subtle alpha 0.07 / 0.055 / 0.04)
  ctx.lineWidth = 1 / camera.scale;
  const alphas = [0.07, 0.055, 0.04];
  state.orbitRadii.forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alphas[idx]})`;
    ctx.stroke();
  });

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
  ctx.lineWidth = 1 / camera.scale;
  ctx.stroke();
  ctx.restore();

  // 5. Pre-map positioned active nodes for drawing and edge lookup
  const nodeRenderMap = new Map<string, {
    x: number;
    y: number;
    size: number;
    node: GNode;
    isPastYear: boolean;
    isSelectedCluster: boolean;
    isHovered: boolean;
    isSelected: boolean;
  }>();

  state.graph.nodes.forEach((node, k) => {
    let nx = 0;
    let ny = 0;

    if (node.id === state.graph.root.id || node.subfieldId === 'root') {
      nx = 0;
      ny = 0;
    } else {
      const clusterAnchor = animatedClusterAnchors.get(node.subfieldId);
      if (!clusterAnchor) return;

      // Intra-cluster node orbital micro-wobble:
      // angular velocity = 0.07 + k * 0.004, odd/even alternating
      const direction = (k % 2 === 0) ? 1 : -1;
      const wobbleSpeed = (0.07 + (k % 20) * 0.004) * direction;
      const currentAngle = node.orbitAngle + timeSec * wobbleSpeed;

      let r = node.orbitRadius;
      if (clusterAnchor.isSelected) {
        r *= 1.12; // Expansion within selected cluster
      }

      nx = clusterAnchor.x + Math.cos(currentAngle) * r;
      ny = clusterAnchor.y + Math.sin(currentAngle) * r;
    }

    const isPastYear = node.year > state.activeYear;
    const isSelectedCluster = node.subfieldId === state.selectedSubfieldId;
    const isHovered = node.id === state.hoveredNodeId;
    const isSelected = node.id === state.selectedNodeId;

    nodeRenderMap.set(node.id, {
      x: nx,
      y: ny,
      size: node.size,
      node,
      isPastYear,
      isSelectedCluster,
      isHovered,
      isSelected,
    });
  });

  // Precompute 1st-degree citation neighbors if a specific node is selected
  const selectedNodeNeighbors = new Set<string>();
  if (state.selectedNodeId) {
    selectedNodeNeighbors.add(state.selectedNodeId);
    state.graph.edges.forEach(edge => {
      if (edge.source === state.selectedNodeId) selectedNodeNeighbors.add(edge.target);
      if (edge.target === state.selectedNodeId) selectedNodeNeighbors.add(edge.source);
    });
  }

  // 6. Draw Edges
  // Clean citation highlighting:
  // - Node selected: highlight ONLY its direct 1st-degree citation edges in gold, dim all others!
  // - Subfield selected: highlight intra-cluster edges + root backbone, keep external cross-edges subtle.
  // - None selected: render uniform subtle ambient edges.
  const edgeParticles: Array<{ x: number; y: number; isSelected: boolean }> = [];

  state.graph.edges.forEach((edge, edgeIdx) => {
    const src = nodeRenderMap.get(edge.source);
    const tgt = nodeRenderMap.get(edge.target);
    if (!src || !tgt) return;

    // Viewport cull check
    const minEx = Math.min(src.x, tgt.x);
    const maxEx = Math.max(src.x, tgt.x);
    const minEy = Math.min(src.y, tgt.y);
    const maxEy = Math.max(src.y, tgt.y);
    if (maxEx < worldMinX || minEx > worldMaxX || maxEy < worldMinY || minEy > worldMaxY) {
      return;
    }

    const isDirectNodeEdge = state.selectedNodeId
      ? (edge.source === state.selectedNodeId || edge.target === state.selectedNodeId)
      : false;

    const isIntraClusterEdge = !state.selectedNodeId && state.selectedSubfieldId
      ? (src.node.subfieldId === state.selectedSubfieldId && tgt.node.subfieldId === state.selectedSubfieldId)
      : false;

    const connectsRoot = src.node.subfieldId === 'root' || tgt.node.subfieldId === 'root';
    const isRootBackboneEdge = !state.selectedNodeId && state.selectedSubfieldId && connectsRoot &&
      (src.node.subfieldId === state.selectedSubfieldId || tgt.node.subfieldId === state.selectedSubfieldId);

    const isEdgeSelected = isDirectNodeEdge || isIntraClusterEdge || isRootBackboneEdge;
    const isEdgePast = src.isPastYear || tgt.isPastYear;

    // In LOD 1 (scale < 0.8), only render backbone edges to root or selected
    if (!lod.showNodes && !connectsRoot && !isEdgeSelected) {
      return;
    }

    // Secondary quadratic bezier curve
    const mx = (src.x + tgt.x) * 0.5;
    const my = (src.y + tgt.y) * 0.5;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.hypot(dx, dy);

    // Perpendicular normal vector
    const perpX = -dy / (dist || 1);
    const perpY = dx / (dist || 1);
    const offsetMagnitude = dist * 0.22;
    const cx = mx + perpX * offsetMagnitude;
    const cy = my + perpY * offsetMagnitude;

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.quadraticCurveTo(cx, cy, tgt.x, tgt.y);

    if (isDirectNodeEdge) {
      // Crisp focal gold highlight for direct citations
      ctx.strokeStyle = isEdgePast ? 'rgba(230, 210, 154, 0.25)' : 'rgba(230, 210, 154, 0.85)';
      ctx.lineWidth = 1.75 / camera.scale;
    } else if (isIntraClusterEdge || isRootBackboneEdge) {
      // Subdued gold for intra-cluster connections
      ctx.strokeStyle = isEdgePast ? 'rgba(230, 210, 154, 0.16)' : 'rgba(230, 210, 154, 0.40)';
      ctx.lineWidth = 1.25 / camera.scale;
    } else {
      // Dim background edges when focusing, avoiding spaghetti clutter
      const bgAlpha = (state.selectedNodeId || state.selectedSubfieldId) ? 0.02 : 0.055;
      ctx.strokeStyle = isEdgePast ? 'rgba(255, 255, 255, 0.015)' : `rgba(255, 255, 255, ${bgAlpha})`;
      ctx.lineWidth = 0.75 / camera.scale;
    }
    ctx.stroke();
    edgesDrawn++;

    // Animated particles
    if (isDirectNodeEdge) {
      const pPhase = ((timeSec * 60 * 0.005) + (edgeIdx * 0.23)) % 1.0;
      const px = (1 - pPhase) * (1 - pPhase) * src.x + 2 * (1 - pPhase) * pPhase * cx + pPhase * pPhase * tgt.x;
      const py = (1 - pPhase) * (1 - pPhase) * src.y + 2 * (1 - pPhase) * pPhase * cy + pPhase * pPhase * tgt.y;
      edgeParticles.push({ x: px, y: py, isSelected: true });
    } else if (isIntraClusterEdge || isRootBackboneEdge) {
      const pPhase = ((timeSec * 60 * 0.0035) + (edgeIdx * 0.19)) % 1.0;
      const px = (1 - pPhase) * (1 - pPhase) * src.x + 2 * (1 - pPhase) * pPhase * cx + pPhase * pPhase * tgt.x;
      const py = (1 - pPhase) * (1 - pPhase) * src.y + 2 * (1 - pPhase) * pPhase * cy + pPhase * pPhase * tgt.y;
      edgeParticles.push({ x: px, y: py, isSelected: true });
    } else if (!state.selectedNodeId && !state.selectedSubfieldId && edgeIdx % 4 === 0) {
      const pPhase = ((timeSec * 60 * 0.002) + (edgeIdx * 0.17)) % 1.0;
      const px = (1 - pPhase) * (1 - pPhase) * src.x + 2 * (1 - pPhase) * pPhase * cx + pPhase * pPhase * tgt.x;
      const py = (1 - pPhase) * (1 - pPhase) * src.y + 2 * (1 - pPhase) * pPhase * cy + pPhase * pPhase * tgt.y;
      edgeParticles.push({ x: px, y: py, isSelected: false });
    }
  });

  // 7. Draw edge particles
  edgeParticles.forEach(p => {
    ctx.beginPath();
    const particleRadius = (p.isSelected ? 1.8 : 1.2) / camera.scale;
    ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
    ctx.fillStyle = p.isSelected ? PALETTE.accentHi : 'rgba(143, 182, 216, 0.45)';
    ctx.fill();
  });

  // 8. Draw Subfield Cluster Centers and Hull Rings
  animatedClusterAnchors.forEach((anchor, sfId) => {
    const isSelected = anchor.isSelected;
    const isHovered = anchor.isHovered;

    // Cluster outer halo ring
    ctx.beginPath();
    const haloRadius = isSelected ? 48 : (isHovered ? 44 : 36);
    ctx.arc(anchor.x, anchor.y, haloRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isSelected
      ? 'rgba(230, 210, 154, 0.45)'
      : (isHovered ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.06)');
    ctx.lineWidth = (isSelected ? 1.5 : 1) / camera.scale;
    ctx.stroke();

    // Cluster center core badge
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 4 / camera.scale, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? PALETTE.accentHi : PALETTE.textDim;
    ctx.fill();

    // Cluster title label with background pill for pristine legibility
    const subfield = state.graph.subfields.find(s => s.id === sfId);
    if (subfield) {
      const fontSize = Math.max(9, 10 / camera.scale);
      ctx.font = `500 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const labelText = subfield.name;
      const textMetrics = ctx.measureText(labelText);
      const textWidth = textMetrics.width;
      const labelY = anchor.y - (haloRadius + 10);

      // Pill backdrop
      ctx.fillStyle = 'rgba(10, 20, 23, 0.88)';
      ctx.beginPath();
      const padX = 6 / camera.scale;
      const padY = 3 / camera.scale;
      ctx.roundRect(
        anchor.x - textWidth / 2 - padX,
        labelY - fontSize / 2 - padY,
        textWidth + padX * 2,
        fontSize + padY * 2,
        4 / camera.scale
      );
      ctx.fill();

      // Pill subtle border
      ctx.strokeStyle = isSelected ? 'rgba(230, 210, 154, 0.4)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1 / camera.scale;
      ctx.stroke();

      // Text
      ctx.fillStyle = isSelected ? PALETTE.accentHi : (isHovered ? PALETTE.textHi : PALETTE.text);
      ctx.fillText(labelText, anchor.x, labelY);
    }
  });

  // 9. Draw Nodes
  // Separate into regular passes and glow pass to avoid unnecessary shadowBlur toggling
  nodeRenderMap.forEach(item => {
    const { x, y, size, node, isPastYear, isSelectedCluster, isHovered, isSelected } = item;

    // Viewport cull check
    if (x < worldMinX || x > worldMaxX || y < worldMinY || y > worldMaxY) {
      return;
    }

    // Skip root node here (handled in dedicated step with tick ring)
    if (node.id === state.graph.root.id || node.subfieldId === 'root') {
      return;
    }

    // LOD alpha check
    if (!lod.showNodes && !isSelectedCluster) {
      return;
    }

    const isDirectlySelected = node.id === state.selectedNodeId;
    const isNeighborOfSelected = state.selectedNodeId ? selectedNodeNeighbors.has(node.id) : false;

    // Focused alpha gating:
    // If a node is selected: focal node = 1.0, 1st-degree citation neighbors = 0.95, others gently dimmed
    // If a subfield is selected: cluster nodes = 1.0, outside clusters dimmed
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

    // Preserve semantic kind colors (papers remain blue, reviews remain gold, authors teal, venues pink)
    // Only the clicked focal node turns solid accentHi gold!
    const nodeColor = isDirectlySelected ? PALETTE.accentHi : getNodeColor(node.kind);

    ctx.save();
    ctx.globalAlpha = effectiveAlpha;

    // Apply shadow glow strictly to directly selected or hovered node
    if (isHovered || isDirectlySelected) {
      ctx.shadowColor = PALETTE.accentHi;
      ctx.shadowBlur = 14 * camera.scale;
    }

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = nodeColor;
    ctx.fill();

    // Focal highlight rings
    if (isDirectlySelected) {
      ctx.beginPath();
      ctx.arc(x, y, size + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = PALETTE.accentHi;
      ctx.lineWidth = 2 / camera.scale;
      ctx.stroke();
    } else if (isNeighborOfSelected) {
      ctx.beginPath();
      ctx.arc(x, y, size + 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(230, 210, 154, 0.7)';
      ctx.lineWidth = 1 / camera.scale;
      ctx.stroke();
    }

    // Inner ring for reviews/surveys
    if (node.kind === 'review' && !isDirectlySelected) {
      ctx.beginPath();
      ctx.arc(x, y, size + 2, 0, Math.PI * 2);
      ctx.strokeStyle = PALETTE.kindReview;
      ctx.lineWidth = 1 / camera.scale;
      ctx.stroke();
    }

    // Author icon badge representation: diamond
    if (node.kind === 'author') {
      ctx.beginPath();
      const d = size * 0.7;
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
      ctx.strokeStyle = PALETTE.kindAuthor;
      ctx.lineWidth = 1 / camera.scale;
      ctx.stroke();
    }

    // LOD 3: Node Label (scale >= 1.8 or when focused)
    if (lod.showLabels || isHovered || isDirectlySelected || isNeighborOfSelected) {
      ctx.globalAlpha = (isHovered || isDirectlySelected) ? 1.0 : (isNeighborOfSelected ? 0.95 : lod.labelAlpha);
      ctx.font = `${isDirectlySelected ? '500' : '400'} ${Math.max(8.5, 9 / camera.scale)}px Inter, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isDirectlySelected ? PALETTE.accentHi : (isNeighborOfSelected ? '#E2E8F0' : PALETTE.textHi);

      // Truncate long labels for visual cleanliness
      const displayLabel = node.label.length > 34 ? `${node.label.slice(0, 32)}...` : node.label;
      ctx.fillText(displayLabel, x + size + 5, y);

      // LOD 4: Citation count tag
      if (lod.showDetails || isHovered || isDirectlySelected) {
        ctx.fillStyle = isDirectlySelected ? '#E6D29A' : PALETTE.textDim;
        ctx.font = `400 ${Math.max(7.5, 8 / camera.scale)}px Inter, sans-serif`;
        ctx.fillText(`${node.year} · ${node.weight.toLocaleString()} cites`, x + size + 5, y + 11);
      }
    }

    ctx.restore();
    nodesDrawn++;
  });

  // 10. Draw Center Root Node & Breathing / 26-Notch Tick Ring
  const rootItem = nodeRenderMap.get(state.graph.root.id);
  const rootX = rootItem ? rootItem.x : 0;
  const rootY = rootItem ? rootItem.y : 0;

  // Breathing calculation: 1 + sin(t * 1.1) * 0.06
  const breathFactor = 1 + Math.sin(timeSec * 1.1) * 0.06;
  const baseRootRadius = 14;
  const rootRadius = baseRootRadius * breathFactor;

  ctx.save();
  // Outer 26-notch tick ring around root counter-rotating:
  const tickRadius = 32;
  const tickCount = 26;
  const tickRotation = -timeSec * 0.35; // Counter-rotating

  ctx.strokeStyle = 'rgba(185, 143, 232, 0.45)';
  ctx.lineWidth = 1.25 / camera.scale;

  for (let i = 0; i < tickCount; i++) {
    const tickAngle = tickRotation + (i / tickCount) * Math.PI * 2;
    const innerT = tickRadius - 3;
    const outerT = tickRadius + (i % 2 === 0 ? 3 : 1);
    const x1 = rootX + Math.cos(tickAngle) * innerT;
    const y1 = rootY + Math.sin(tickAngle) * innerT;
    const x2 = rootX + Math.cos(tickAngle) * outerT;
    const y2 = rootY + Math.sin(tickAngle) * outerT;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Root node glow & body (Rule: shadowBlur allowed for root node)
  ctx.shadowColor = PALETTE.rootNode;
  ctx.shadowBlur = 24 * camera.scale;

  // Root body gradient
  const rootFillGrad = ctx.createRadialGradient(rootX, rootY, 0, rootX, rootY, rootRadius);
  rootFillGrad.addColorStop(0, '#E9D5FF');
  rootFillGrad.addColorStop(0.7, PALETTE.rootNode);
  rootFillGrad.addColorStop(1, '#7C3AED');

  ctx.beginPath();
  ctx.arc(rootX, rootY, rootRadius, 0, Math.PI * 2);
  ctx.fillStyle = rootFillGrad;
  ctx.fill();

  // Root border
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#F3E8FF';
  ctx.lineWidth = 1.5 / camera.scale;
  ctx.stroke();

  // Root Label
  ctx.font = `500 ${Math.max(10, 11 / camera.scale)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.textHi;
  ctx.fillText('Foundation Benchmark', rootX, rootY + rootRadius + 10);

  ctx.font = `400 ${Math.max(8.5, 9 / camera.scale)}px Inter, sans-serif`;
  ctx.fillStyle = PALETTE.accentHi;
  const shortRootTitle = state.graph.root.label.length > 36
    ? `${state.graph.root.label.slice(0, 34)}...`
    : state.graph.root.label;
  ctx.fillText(shortRootTitle, rootX, rootY + rootRadius + 24);

  ctx.restore();
  nodesDrawn++;

  // Restore world transform
  ctx.restore();

  // Restore DPR transform
  ctx.restore();

  const renderTimeMs = performance.now() - startTime;
  return {
    nodesDrawn,
    edgesDrawn,
    renderTimeMs,
  };
}
