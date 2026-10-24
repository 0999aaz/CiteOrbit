import React from 'react';
import { useDashboard } from '../store/useDashboard.ts';

export const TopBar: React.FC = () => {
  const activeTool = useDashboard(s => s.activeTool);
  const setActiveTool = useDashboard(s => s.setActiveTool);
  const showFps = useDashboard(s => s.showFps);
  const isForecasting = useDashboard(s => s.isForecasting);
  const toggleForecast = useDashboard(s => s.toggleForecast);

  return (
    <header className="h-[44px] min-h-[44px] px-3.5 flex items-center justify-between border-b border-[rgba(255,255,255,0.07)] bg-[#030607] select-none z-30">
      {/* Brand */}
      <div className="flex items-center space-x-2.5">
        <div className="w-2 h-2 rounded-full bg-[#B98FE8] shadow-[0_0_8px_#B98FE8]" />
        <div className="flex items-baseline space-x-2">
          <span className="text-[13px] font-medium tracking-tight text-[#DDDFE0]">
            Paper Atlas
          </span>
          <span className="text-[9.5px] text-[#7B848B]">
            Citation intelligence
          </span>
        </div>
      </div>

      {/* Middle Tools (4 icons, mutually exclusive highlight, 4th is FPS toggle) */}
      <div className="flex items-center space-x-1 bg-[rgba(255,255,255,0.02)] p-1 rounded-[7px] border border-[rgba(255,255,255,0.05)]">
        {/* Tool 1: Inspect */}
        <button
          onClick={() => setActiveTool('inspect')}
          title="Inspect nodes"
          aria-label="Inspect tool"
          className={`w-7 h-6 flex items-center justify-center rounded-[5px] transition-colors ${
            activeTool === 'inspect'
              ? 'bg-[rgba(255,255,255,0.08)] text-[#E6D29A]'
              : 'text-[#7B848B] hover:text-[#DDDFE0] hover:bg-[rgba(255,255,255,0.03)]'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="8" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </button>

        {/* Tool 2: Pan */}
        <button
          onClick={() => setActiveTool('pan')}
          title="Pan canvas"
          aria-label="Pan tool"
          className={`w-7 h-6 flex items-center justify-center rounded-[5px] transition-colors ${
            activeTool === 'pan'
              ? 'bg-[rgba(255,255,255,0.08)] text-[#E6D29A]'
              : 'text-[#7B848B] hover:text-[#DDDFE0] hover:bg-[rgba(255,255,255,0.03)]'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M5 9l-3 3 3 3" />
            <path d="M9 5l3-3 3 3" />
            <path d="M19 9l3 3-3 3" />
            <path d="M9 19l3 3 3 3" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="12" y1="2" x2="12" y2="22" />
          </svg>
        </button>

        {/* Tool 3: Lens */}
        <button
          onClick={() => setActiveTool('lens')}
          title="Focus lens"
          aria-label="Focus lens tool"
          className={`w-7 h-6 flex items-center justify-center rounded-[5px] transition-colors ${
            activeTool === 'lens'
              ? 'bg-[rgba(255,255,255,0.08)] text-[#E6D29A]'
              : 'text-[#7B848B] hover:text-[#DDDFE0] hover:bg-[rgba(255,255,255,0.03)]'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Tool 4: FPS toggle */}
        <button
          onClick={() => setActiveTool('fps')}
          title="Toggle FPS HUD (or press F)"
          aria-label="Toggle FPS meter"
          className={`w-7 h-6 flex items-center justify-center rounded-[5px] transition-colors ${
            showFps
              ? 'bg-[rgba(255,255,255,0.08)] text-[#E6D29A]'
              : 'text-[#7B848B] hover:text-[#DDDFE0] hover:bg-[rgba(255,255,255,0.03)]'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </button>
      </div>

      {/* Right: Forecast button + Avatar */}
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleForecast}
          aria-label="Toggle Forecast simulation"
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-[20px] text-[11px] font-medium transition-all ${
            isForecasting
              ? 'bg-[#E6D29A] text-[#030607] shadow-[0_0_12px_rgba(230,210,154,0.3)]'
              : 'bg-[rgba(255,255,255,0.03)] text-[#DDDFE0] border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.06)]'
          }`}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
          <span>{isForecasting ? 'Forecasting 2031' : 'Forecast'}</span>
        </button>

        {/* OpenAlex Snapshot Corpus Badge */}
        <div
          title="OpenAlex offline snapshot corpus"
          className="w-6 h-6 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] flex items-center justify-center text-[9px] text-[#A6A6A6]"
        >
          OA
        </div>
      </div>
    </header>
  );
};
