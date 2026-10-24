import React, { useEffect } from 'react';
import { useDashboard } from '../store/useDashboard.ts';

export const FpsMeter: React.FC = () => {
  const showFps = useDashboard(s => s.showFps);
  const toggleFps = useDashboard(s => s.toggleFps);
  const fps = useDashboard(s => s.fps);
  const nodesDrawn = useDashboard(s => s.nodesDrawn);

  // Keyboard shortcut: press 'F' or 'f' to toggle FPS meter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFps();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFps]);

  if (!showFps) return null;

  return (
    <div className="absolute top-2.5 right-3 z-50 pointer-events-none rounded-[7px] border border-[rgba(255,255,255,0.14)] bg-[#0A1417]/90 px-3 py-2 shadow-2xl backdrop-blur-md">
      <div className="flex items-center space-x-3 text-[11px] tabular-nums font-mono">
        <div className="flex items-center space-x-1.5">
          <span className="text-[#7B848B]">FPS:</span>
          <span className={`font-semibold ${fps >= 55 ? 'text-[#8FC9C0]' : 'text-[#E6D29A]'}`}>
            {fps}
          </span>
        </div>
        <div className="w-[1px] h-3 bg-[rgba(255,255,255,0.1)]" />
        <div className="flex items-center space-x-1.5">
          <span className="text-[#7B848B]">Nodes:</span>
          <span className="text-[#DDDFE0] font-medium">
            {nodesDrawn}
          </span>
        </div>
      </div>
      <div className="text-[8px] text-[#4E6069] mt-0.5 tracking-wider uppercase font-mono">
        60fps target · Press F to hide
      </div>
    </div>
  );
};
