import React from 'react';
import { TopBar } from './components/TopBar.tsx';
import { TimelineRail } from './components/TimelineRail.tsx';
import { GraphCanvas } from './canvas/GraphCanvas.tsx';
import { IntelPanel } from './components/IntelPanel.tsx';
import { CommandBar } from './components/CommandBar.tsx';
import { FpsMeter } from './components/FpsMeter.tsx';

export default function App() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#030607] flex flex-col font-sans select-none">
      {/* Mobile Landscape Notice (as specified in rule 8: 不做移动端适配，加个请横屏提示即可) */}
      <div className="md:hidden fixed inset-0 z-50 bg-[#030607] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 mb-3 rounded-full border border-[rgba(255,255,255,0.15)] flex items-center justify-center text-[#E6D29A]">
          <svg className="w-5 h-5 rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>
        <h3 className="text-[13px] font-medium text-[#DDDFE0] mb-1">
          Paper Atlas · Desktop experience
        </h3>
        <p className="text-[11px] text-[#7B848B] max-w-xs leading-relaxed">
          This citation intelligence graph requires a landscape display or desktop viewport to navigate polar coordinates.
        </p>
      </div>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col w-full h-full min-w-[700px] min-h-[490px] overflow-hidden">
        {/* TopBar (44px) */}
        <TopBar />

        {/* Central Workspace */}
        <div className="flex-1 flex relative overflow-hidden min-h-0 min-w-0">
          {/* Vertical Timeline Rail (54px) */}
          <TimelineRail />

          {/* Canvas Viewport (flex: 1) */}
          <main className="relative flex-1 min-w-0 h-full overflow-hidden flex flex-col">
            <GraphCanvas />
            <FpsMeter />
          </main>

          {/* Right Intel Panel (226px) */}
          <IntelPanel />
        </div>

        {/* CommandBar (46px) */}
        <CommandBar />
      </div>
    </div>
  );
}
