import React, { useRef, useEffect, useMemo } from 'react';
import type { Graph } from '../data/schema.ts';
import rawGraphData from '../data/graph.json';
import { coverage, momentum } from '../data/derive.ts';
import { useDashboard } from '../store/useDashboard.ts';

const graph = rawGraphData as unknown as Graph;

export const RadarWidget: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const year = useDashboard(s => s.year);
  const selectedSubfieldId = useDashboard(s => s.selectedSubfieldId);

  const currentMomentum = useMemo(() => momentum(graph.subfields, year, graph.nodes), [year]);

  // Precompute polygon vertices once per (year, selectedSubfieldId) rather than 60x/sec
  const polygonVertices = useMemo(() => {
    const size = 176;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.38;
    const subfields = graph.subfields;
    const numAxes = subfields.length || 1;

    return subfields.map((sf, idx) => {
      const cov = coverage(sf, year, graph.nodes);
      const radius = (cov / 100) * maxR;
      const angle = (idx / numAxes) * Math.PI * 2 - Math.PI / 2;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        id: sf.id,
        isSelected: sf.id === selectedSubfieldId,
      };
    });
  }, [year, selectedSubfieldId]);

  const polygonVerticesRef = useRef(polygonVertices);
  polygonVerticesRef.current = polygonVertices;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const size = 176;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const subfields = graph.subfields;
    const numAxes = subfields.length || 1;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.38;
    const rings = [0.33, 0.66, 1.0];

    const renderRadar = (timeMs: number) => {
      const timeSec = timeMs / 1000;
      const vertices = polygonVerticesRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // Concentric grid rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < rings.length; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * rings[i], 0, Math.PI * 2);
        ctx.stroke();
      }

      // Axis spokes (single compound path)
      ctx.beginPath();
      for (let idx = 0; idx < numAxes; idx++) {
        const angle = (idx / numAxes) * Math.PI * 2 - Math.PI / 2;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.stroke();

      // 0.9 rad/s sweep line
      const sweepAngle = (timeSec * 0.9) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepAngle - 0.3, sweepAngle, false);
      ctx.closePath();
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      sweepGrad.addColorStop(0, 'rgba(230, 210, 154, 0.15)');
      sweepGrad.addColorStop(1, 'rgba(230, 210, 154, 0)');
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR);
      ctx.strokeStyle = 'rgba(230, 210, 154, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Coverage polygon
      if (vertices.length > 0) {
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(143, 182, 216, 0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(143, 182, 216, 0.65)';
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // Polygon vertices
        for (let i = 0; i < vertices.length; i++) {
          const p = vertices[i];
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.isSelected ? 3.5 : 2, 0, Math.PI * 2);
          ctx.fillStyle = p.isSelected ? '#E6D29A' : '#8FB6D8';
          ctx.fill();
          if (p.isSelected) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(renderRadar);
    };

    animId = requestAnimationFrame(renderRadar);

    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="flex flex-col items-center p-2.5 rounded-[7px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.015)]">
      <div className="w-full flex items-center justify-between text-[9.5px] mb-1">
        <span className="text-[#A6A6A6] font-medium tracking-wide uppercase">
          Field momentum
        </span>
        <span className="text-[#E6D29A] font-semibold tabular-nums">
          {currentMomentum}%
        </span>
      </div>

      <div className="relative">
        <canvas ref={canvasRef} className="block select-none" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-[8.5px] text-[#4E6069] tracking-tighter">
            {year}
          </div>
        </div>
      </div>
    </div>
  );
};
