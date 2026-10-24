import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type { Graph } from '../data/schema.ts';
import rawGraphData from '../data/graph.json';
import { precomputeGraphLayout } from '../layout/precompute.ts';
import { renderCanvas, type RenderState } from './renderer.ts';
import { zoomAtPoint, DEFAULT_CAMERA, type CameraState } from './camera.ts';
import { hitTest } from './hitTest.ts';
import { coverage } from '../data/derive.ts';
import { useDashboard } from '../store/useDashboard.ts';
import { useAnimationFrame } from '../hooks/useAnimationFrame.ts';

const graph = rawGraphData as unknown as Graph;

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Zustand selectors (only reactive when selection/timeline changes)
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
  const camera = useDashboard(s => s.camera);
  const setCamera = useDashboard(s => s.setCamera);
  const resetCamera = useDashboard(s => s.resetCamera);
  const isForecasting = useDashboard(s => s.isForecasting);
  const setFpsStats = useDashboard(s => s.setFpsStats);

  // Precompute layout once
  const layout = useMemo(() => precomputeGraphLayout(graph), []);

  // Mutable refs for high-frequency animation and pointer interaction
  const cameraRef = useRef<CameraState>(camera);
  cameraRef.current = camera;

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; camX: number; camY: number }>({ x: 0, y: 0, camX: 0, camY: 0 });
  const hasMovedRef = useRef(false);

  // FPS calculation buffer (last 30 frame deltas)
  const frameDeltasRef = useRef<number[]>([]);
  const lastFpsUpdateRef = useRef(0);
  const nodesDrawnRef = useRef(0);

  // Canvas size and DPR ref
  const dimensionsRef = useRef({ width: 700, height: 490, dpr: 1 });

  // Handle Canvas Resize and DPI Scaling with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const applySize = (width: number, height: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(width) || 700;
      const h = Math.round(height) || 490;

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      dimensionsRef.current = { width: w, height: h, dpr };
    };

    // Initial measurement
    const initialRect = container.getBoundingClientRect();
    applySize(initialRect.width, initialRect.height);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        applySize(width, height);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Main 60 FPS Animation Frame Loop
  useAnimationFrame(
    useCallback((timeSec: number, deltaTimeMs: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height, dpr } = dimensionsRef.current;

      // Track FPS
      frameDeltasRef.current.push(deltaTimeMs);
      if (frameDeltasRef.current.length > 30) frameDeltasRef.current.shift();

      // Throttled store update for FPS meter (every 400ms)
      const now = performance.now();
      if (now - lastFpsUpdateRef.current > 400) {
        lastFpsUpdateRef.current = now;
        const avgDelta = frameDeltasRef.current.reduce((a, b) => a + b, 0) / (frameDeltasRef.current.length || 1);
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

      const metrics = renderCanvas(
        ctx,
        renderState,
        cameraRef.current,
        timeSec,
        { width, height, dpr }
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
      setFpsStats,
    ])
  );

  // Wheel Zoom with Mouse Anchor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const { width, height } = dimensionsRef.current;
    const originX = width * 0.42;
    const originY = height * 0.54;

    // Zoom multiplier
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextCam = zoomAtPoint(cameraRef.current, factor, sx, sy, originX, originY);
    cameraRef.current = nextCam;
    setCamera(nextCam);
  };

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
        const newCam = {
          ...cameraRef.current,
          x: dragStartRef.current.camX + dx,
          y: dragStartRef.current.camY + dy,
        };
        cameraRef.current = newCam;
        setCamera(newCam);
      }
      return;
    }

    // Hover detection
    const { width, height } = dimensionsRef.current;
    const originX = width * 0.42;
    const originY = height * 0.54;

    const hit = hitTest(
      sx,
      sy,
      originX,
      originY,
      cameraRef.current,
      layout.nodes,
      layout.subfieldPositions,
      graph.subfields,
      year
    );

    if (hit.hitType === 'node' && hit.node) {
      canvas.style.cursor = 'pointer';
      setHoveredNodeId(hit.node.id);
      setHoveredSubfieldId(hit.node.subfieldId);

      const sf = graph.subfields.find(s => s.id === hit.node?.subfieldId);
      const sfName = sf ? sf.name : (hit.node.subfieldId === 'root' ? 'Benchmark Foundation' : '');
      const covVal = sf ? coverage(sf, year, layout.nodes) : 100;

      setHoverTooltip({
        x: sx + 14,
        y: sy + 14,
        title: hit.node.label,
        subtitle: `${sfName} · ${hit.node.year} · ${hit.node.weight.toLocaleString()} citations · ${covVal}% coverage`,
      });
    } else if (hit.hitType === 'subfield' && hit.subfieldId) {
      canvas.style.cursor = 'pointer';
      setHoveredNodeId(null);
      setHoveredSubfieldId(hit.subfieldId);

      const sf = graph.subfields.find(s => s.id === hit.subfieldId);
      if (sf) {
        const cov = coverage(sf, year, layout.nodes);
        setHoverTooltip({
          x: sx + 14,
          y: sy + 14,
          title: sf.name,
          subtitle: `Active subfield · Coverage ${cov}% · Growth ${sf.growth}x`,
        });
      }
    } else {
      canvas.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      setHoveredNodeId(null);
      setHoveredSubfieldId(null);
      setHoverTooltip(null);
    }
  };

  // Pointer Up (Select target on click if not dragging)
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    isDraggingRef.current = false;

    // If it was a quick click without significant panning
    if (!hasMovedRef.current) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { width, height } = dimensionsRef.current;
      const originX = width * 0.42;
      const originY = height * 0.54;

      const hit = hitTest(
        sx,
        sy,
        originX,
        originY,
        cameraRef.current,
        layout.nodes,
        layout.subfieldPositions,
        graph.subfields,
        year
      );

      if (hit.hitType === 'node' && hit.node) {
        setSelectedNodeId(hit.node.id);
        if (hit.node.subfieldId && hit.node.subfieldId !== 'root') {
          setSelectedSubfieldId(hit.node.subfieldId);
        }
      } else if (hit.hitType === 'subfield' && hit.subfieldId) {
        setSelectedNodeId(null);
        setSelectedSubfieldId(hit.subfieldId);
      } else {
        // Click on background deselects both node and subfield
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
        onWheel={handleWheel}
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

      {/* Subtle coordinate overlay indicator */}
      <div className="pointer-events-none absolute bottom-2 left-3 text-[8.5px] text-[#4E6069] tracking-wider uppercase">
        polar zoom {camera.scale.toFixed(2)}x · drag to pan · wheel to zoom
      </div>
    </div>
  );
};
