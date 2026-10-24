import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type { Graph } from '../data/schema.ts';
import rawGraphData from '../data/graph.json';
import { precomputeGraphLayout } from '../layout/precompute.ts';
import {
  computeClusterAnchors,
  computeNodePositions,
  type ClusterAnchor,
  type WorldPoint,
} from '../layout/positions.ts';
import {
  renderCanvas,
  createRenderScratch,
  type RenderScratch,
  type RenderState,
} from './renderer.ts';
import { zoomAtPoint, type CameraState } from './camera.ts';
import { hitTest } from './hitTest.ts';
import { coverage, calculateGrowth } from '../data/derive.ts';
import { useDashboard } from '../store/useDashboard.ts';
import { useAnimationFrame } from '../hooks/useAnimationFrame.ts';
import { useResizeObserver } from '../hooks/useResizeObserver.ts';

const graph = rawGraphData as unknown as Graph;

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomHudRef = useRef<HTMLDivElement>(null);

  // Zustand selectors: intentionally DO NOT subscribe to `s.camera` so pan/zoom causes zero React re-renders
  const selectedSubfieldId = useDashboard(s => s.selectedSubfieldId);
  const setSelectedSubfieldId = useDashboard(s => s.setSelectedSubfieldId);
  const hoveredSubfieldId = useDashboard(s => s.hoveredSubfieldId);
  const setHoveredSubfieldId = useDashboard(s => s.setHoveredSubfieldId);
  const selectedNodeId = useDashboard(s => s.selectedNodeId);
  const setSelectedNodeId = useDashboard(s => s.setSelectedNodeId);
  const hoveredNodeId = useDashboard(s => s.hoveredNodeId);
  const setHoveredNodeId = useDashboard(s => s.setHoveredNodeId);
  const hoverTooltip = useDashboard(s => s.hoverTooltip);
  const setHoverTooltip = useDashboard(s => s.setHoverTooltip);
  const year = useDashboard(s => s.year);
  const activeTool = useDashboard(s => s.activeTool);
  const setCamera = useDashboard(s => s.setCamera);
  const resetCamera = useDashboard(s => s.resetCamera);
  const isForecasting = useDashboard(s => s.isForecasting);
  const setFpsStats = useDashboard(s => s.setFpsStats);

  // Precompute static polar layout once
  const layout = useMemo(() => precomputeGraphLayout(graph), []);

  // Mutable refs for high-frequency animation and pointer interaction (zero React re-renders)
  const cameraRef = useRef<CameraState>({ ...useDashboard.getState().camera });
  const cameraDirtyRef = useRef(false);
  const lastHudScaleTextRef = useRef('');

  // Sync imperative cameraRef if store camera is reset externally (e.g. resetCamera)
  useEffect(() => {
    const unsubscribe = useDashboard.subscribe((state, prevState) => {
      if (state.camera !== prevState.camera && state.camera !== cameraRef.current) {
        cameraRef.current = state.camera;
      }
    });
    return unsubscribe;
  }, []);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; camX: number; camY: number }>({
    x: 0,
    y: 0,
    camX: 0,
    camY: 0,
  });
  const hasMovedRef = useRef(false);

  // FPS calculation buffer (last 30 frame deltas), exact rendered frame timestamp, and reusable scratchpads
  const frameDeltasRef = useRef<number[]>([]);
  const lastFpsUpdateRef = useRef(0);
  const nodesDrawnRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  const renderScratchRef = useRef<RenderScratch | null>(null);
  if (renderScratchRef.current === null) {
    renderScratchRef.current = createRenderScratch();
  }
  const hitAnchorsRef = useRef<Map<string, ClusterAnchor>>(new Map());
  const hitNodesRef = useRef<Map<string, WorldPoint>>(new Map());

  // Canvas size and DPR ref
  const dimensionsRef = useRef({ width: 700, height: 490, dpr: 1 });

  // Handle Canvas Resize and DPI Scaling via shared imperative ResizeObserver hook
  useResizeObserver(
    containerRef,
    useCallback(({ width, height }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = width || 700;
      const h = height || 490;

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      dimensionsRef.current = { width: w, height: h, dpr };
    }, [])
  );

  // Main 60 FPS Animation Frame Loop
  useAnimationFrame(
    useCallback((timeSec: number, deltaTimeMs: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height, dpr } = dimensionsRef.current;

      // Flush pending camera updates to store at most once per rAF
      if (cameraDirtyRef.current) {
        cameraDirtyRef.current = false;
        setCamera(cameraRef.current);
      }

      // Imperatively update zoom HUD text via DOM ref without React re-render
      const hudEl = zoomHudRef.current;
      if (hudEl) {
        const scaleText = cameraRef.current.scale.toFixed(2);
        if (lastHudScaleTextRef.current !== scaleText) {
          lastHudScaleTextRef.current = scaleText;
          hudEl.textContent = `polar zoom ${scaleText}x · drag to pan · wheel to zoom`;
        }
      }

      // Track FPS
      frameDeltasRef.current.push(deltaTimeMs);
      if (frameDeltasRef.current.length > 30) frameDeltasRef.current.shift();

      const now = performance.now();
      if (now - lastFpsUpdateRef.current > 400) {
        lastFpsUpdateRef.current = now;
        const avgDelta =
          frameDeltasRef.current.reduce((a, b) => a + b, 0) /
          (frameDeltasRef.current.length || 1);
        const currentFps = Math.min(60, Math.round(1000 / (avgDelta || 16.67)));
        setFpsStats(currentFps, nodesDrawnRef.current);
      }

      const renderState: RenderState = {
        graph,
        subfieldPositions: layout.subfieldPositions,
        orbitRadii: layout.orbitRadii,
        selectedSubfieldId,
        hoveredSubfieldId,
        selectedNodeId,
        hoveredNodeId,
        activeYear: year,
        isForecasting,
      };

      lastFrameTimeRef.current = timeSec;

      const metrics = renderCanvas(
        ctx,
        renderState,
        cameraRef.current,
        timeSec,
        { width, height, dpr },
        renderScratchRef.current ?? undefined
      );

      nodesDrawnRef.current = metrics.nodesDrawn;
    }, [
      layout,
      selectedSubfieldId,
      hoveredSubfieldId,
      selectedNodeId,
      hoveredNodeId,
      year,
      isForecasting,
      setCamera,
      setFpsStats,
    ])
  );

  // Non-passive Wheel Zoom with Mouse Anchor (updates ref immediately, flushes store once per rAF)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const { width, height } = dimensionsRef.current;
      const originX = width * 0.42;
      const originY = height * 0.54;

      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const nextCam = zoomAtPoint(cameraRef.current, factor, sx, sy, originX, originY);
      if (nextCam !== cameraRef.current) {
        cameraRef.current = nextCam;
        cameraDirtyRef.current = true;
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Pointer Down (Pan vs Hit Test)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      camX: cameraRef.current.x,
      camY: cameraRef.current.y,
    };
  };

  // Pointer Move (Pan or Hit Hover)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        hasMovedRef.current = true;
        cameraRef.current = {
          scale: cameraRef.current.scale,
          x: dragStartRef.current.camX + dx,
          y: dragStartRef.current.camY + dy,
        };
        cameraDirtyRef.current = true;
      }
      return;
    }

    if (activeTool === 'pan') {
      canvas.style.cursor = 'grab';
      return;
    }

    // Hover detection using exact last rendered frame timeSec
    const { width, height } = dimensionsRef.current;
    const originX = width * 0.42;
    const originY = height * 0.54;
    const frameTimeSec = lastFrameTimeRef.current;
    const anchors = computeClusterAnchors(
      graph.subfields,
      layout.subfieldPositions,
      frameTimeSec,
      selectedSubfieldId,
      hoveredSubfieldId,
      hitAnchorsRef.current
    );
    const nodePositions = computeNodePositions(
      layout.nodes,
      graph.root.id,
      anchors,
      frameTimeSec,
      hitNodesRef.current
    );

    const hit = hitTest(
      sx,
      sy,
      originX,
      originY,
      cameraRef.current,
      layout.nodes,
      nodePositions,
      anchors
    );

    if (hit.hitType === 'node' && hit.node) {
      canvas.style.cursor = activeTool === 'lens' ? 'zoom-in' : 'pointer';
      if (hoveredNodeId !== hit.node.id) setHoveredNodeId(hit.node.id);
      if (hoveredSubfieldId !== hit.node.subfieldId) setHoveredSubfieldId(hit.node.subfieldId);

      const sf = graph.subfields.find(s => s.id === hit.node?.subfieldId);
      const sfName = sf ? sf.name : (hit.node.subfieldId === 'root' ? 'Benchmark Foundation' : '');
      const covVal = sf ? coverage(sf, year, layout.nodes) : 100;
      const isEntity = hit.node.kind === 'author' || hit.node.kind === 'venue';
      const metricPart = isEntity
        ? `${hit.node.paperCount ?? 0} papers · ${(hit.node.citationSum ?? hit.node.weight).toLocaleString()} cites`
        : `${hit.node.year} · ${hit.node.weight.toLocaleString()} citations`;

      setHoverTooltip({
        x: sx + 14,
        y: sy + 14,
        title: hit.node.label,
        subtitle: `${sfName} · ${metricPart} · Coverage index ${covVal}%`,
      });
    } else if (hit.hitType === 'subfield' && hit.subfieldId) {
      canvas.style.cursor = activeTool === 'lens' ? 'zoom-in' : 'pointer';
      if (hoveredNodeId !== null) setHoveredNodeId(null);
      if (hoveredSubfieldId !== hit.subfieldId) setHoveredSubfieldId(hit.subfieldId);

      const sf = graph.subfields.find(s => s.id === hit.subfieldId);
      if (sf) {
        const cov = coverage(sf, year, layout.nodes);
        const dynGrowth = calculateGrowth(sf.id, year, layout.nodes);
        setHoverTooltip({
          x: sx + 14,
          y: sy + 14,
          title: sf.name,
          subtitle: `Active subfield · Coverage index ${cov}% · Growth ${dynGrowth}x`,
        });
      }
    } else {
      canvas.style.cursor = activeTool === 'lens' ? 'zoom-in' : 'default';
      if (hoveredNodeId !== null) setHoveredNodeId(null);
      if (hoveredSubfieldId !== null) setHoveredSubfieldId(null);
      if (hoverTooltip !== null) setHoverTooltip(null);
    }
  };

  // Pointer Up (Select target or focus lens on click if not dragging)
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    isDraggingRef.current = false;

    if (!hasMovedRef.current && activeTool !== 'pan') {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { width, height } = dimensionsRef.current;
      const originX = width * 0.42;
      const originY = height * 0.54;
      const frameTimeSec = lastFrameTimeRef.current;
      const anchors = computeClusterAnchors(
        graph.subfields,
        layout.subfieldPositions,
        frameTimeSec,
        selectedSubfieldId,
        hoveredSubfieldId,
        hitAnchorsRef.current
      );
      const nodePositions = computeNodePositions(
        layout.nodes,
        graph.root.id,
        anchors,
        frameTimeSec,
        hitNodesRef.current
      );

      const hit = hitTest(
        sx,
        sy,
        originX,
        originY,
        cameraRef.current,
        layout.nodes,
        nodePositions,
        anchors
      );

      // Focus lens tool: smoothly snap/magnify to 2.35x centered around the clicked point
      if (activeTool === 'lens') {
        const targetFactor = cameraRef.current.scale < 2.2 ? 2.35 / cameraRef.current.scale : 1.35;
        const zoomedCam = zoomAtPoint(cameraRef.current, targetFactor, sx, sy, originX, originY);
        cameraRef.current = zoomedCam;
        cameraDirtyRef.current = true;
      }

      if (hit.hitType === 'node' && hit.node) {
        setSelectedNodeId(hit.node.id);
        if (hit.node.subfieldId && hit.node.subfieldId !== 'root') {
          setSelectedSubfieldId(hit.node.subfieldId);
        }
      } else if (hit.hitType === 'subfield' && hit.subfieldId) {
        setSelectedNodeId(null);
        setSelectedSubfieldId(hit.subfieldId);
      } else if (activeTool !== 'lens') {
        setSelectedNodeId(null);
        setSelectedSubfieldId(null);
      }
    }
  };

  // Double click resets camera
  const handleDoubleClick = () => {
    resetCamera();
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full overflow-hidden bg-[#030607]"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className="block w-full h-full touch-none"
      />

      {/* Floating Tooltip */}
      {hoverTooltip && (
        <div
          className="pointer-events-none absolute z-40 max-w-xs rounded-[7px] border border-[rgba(255,255,255,0.12)] bg-[#0A1417]/95 px-2.5 py-1.5 shadow-2xl backdrop-blur-md"
          style={{
            left: `${hoverTooltip.x}px`,
            top: `${hoverTooltip.y}px`,
            transform: 'translate(4px, 4px)',
          }}
        >
          <div className="text-[11px] font-medium text-[#DDDFE0] leading-snug">
            {hoverTooltip.title}
          </div>
          {hoverTooltip.subtitle && (
            <div className="mt-0.5 text-[9.5px] text-[#E6D29A] leading-tight">
              {hoverTooltip.subtitle}
            </div>
          )}
        </div>
      )}

      {/* Subtle coordinate overlay indicator (updated imperatively via zoomHudRef) */}
      <div
        ref={zoomHudRef}
        className="pointer-events-none absolute bottom-2 left-3 text-[8.5px] text-[#4E6069] tracking-wider uppercase"
      >
        polar zoom 1.00x · drag to pan · wheel to zoom
      </div>
    </div>
  );
};
