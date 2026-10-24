import React, { useRef, useEffect } from 'react';
import type { Graph } from '../data/schema.ts';
import rawGraphData from '../data/graph.json';
import { coverage, momentum } from '../data/derive.ts';
import { useDashboard } from '../store/useDashboard.ts';

const graph = rawGraphData as unknown as Graph;

export const RadarWidget: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const year = useDashboard(s => s.year);
  const selectedSubfieldId = useDashboard(s => s.selectedSubfieldId);
  const setSelectedSubfieldId = useDashboard(s => s.setSelectedSubfieldId);

  const currentMomentum = momentum(graph.subfields, year, graph.nodes);

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
    const numAxes = subfields.length;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.38;

    const renderRadar = (timeMs: number) => {
      const timeSec = timeMs / 1000;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      // Concentric grid rings
      const rings = [0.33, 0.66, 1.0];
      rings.forEach(rFrac => {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * rFrac, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Axis spokes
      subfields.forEach((_, idx) => {
        const angle = (idx / numAxes) * Math.PI * 2 - Math.PI / 2;
        const ax = cx + Math.cos(angle) * maxR;
        const ay = cy + Math.sin(angle) * maxR;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ax, ay);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.stroke();
      });

      // 0.9 rad/s sweep line
      const sweepAngle = (timeSec * 0.9) % (Math.PI * 2);
      ctx.save();
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
      ctx.restore();

      // Coverage polygon
      ctx.beginPath();
      const polygonPoints: Array<{ x: number; y: number; id: string }> = [];

      subfields.forEach((sf, idx) => {
        const cov = coverage(sf, year, graph.nodes);
        const radius = (cov / 100) * maxR;
        const angle = (idx / numAxes) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        polygonPoints.push({ x: px, y: py, id: sf.id });

        if (idx === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.closePath();

      // Polygon fill & stroke
      ctx.fillStyle = 'rgba(143, 182, 216, 0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(143, 182, 216, 0.65)';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      // Polygon vertices
      polygonPoints.forEach(p => {
        const isSel = p.id === selectedSubfieldId;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isSel ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? '#E6D29A' : '#8FB6D8';
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      ctx.restore();
      animId = requestAnimationFrame(renderRadar);
    };

    animId = requestAnimationFrame(renderRadar);

    return () => cancelAnimationFrame(animId);
  }, [year, selectedSubfieldId]);

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
