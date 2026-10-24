import React, { useRef, useCallback, useEffect } from 'react';
import { useDashboard } from '../store/useDashboard.ts';

const MIN_YEAR = 1995;
const MAX_YEAR = 2026;
const MAJOR_TICKS = [2026, 2020, 2015, 2010, 2005, 2000, 1995];

export const TimelineRail: React.FC = () => {
  const year = useDashboard(s => s.year);
  const setYear = useDashboard(s => s.setYear);
  const railRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const pendingYearRef = useRef<number>(year);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const computeYearFromClientY = useCallback((clientY: number): number | null => {
    const rail = railRef.current;
    if (!rail) return null;

    const rect = rail.getBoundingClientRect();
    const padding = 20;
    const trackHeight = Math.max(1, rect.height - padding * 2);
    const clampedY = Math.max(0, Math.min(trackHeight, clientY - rect.top - padding));

    const ratio = clampedY / trackHeight;
    const targetYear = Math.round(MAX_YEAR - ratio * (MAX_YEAR - MIN_YEAR));
    return Math.max(MIN_YEAR, Math.min(MAX_YEAR, targetYear));
  }, []);

  // Schedule setYear at most once per animation frame during rapid scrubbing
  const scheduleYearUpdate = useCallback((clientY: number, immediate: boolean = false) => {
    const nextYear = computeYearFromClientY(clientY);
    if (nextYear === null) return;

    pendingYearRef.current = nextYear;

    if (immediate) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (useDashboard.getState().year !== nextYear) {
        setYear(nextYear);
      }
      return;
    }

    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const target = pendingYearRef.current;
      if (useDashboard.getState().year !== target) {
        setYear(target);
      }
    });
  }, [computeYearFromClientY, setYear]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail) return;

    rail.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    scheduleYearUpdate(e.clientY, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    scheduleYearUpdate(e.clientY, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (rail && rail.hasPointerCapture(e.pointerId)) {
      rail.releasePointerCapture(e.pointerId);
    }
    if (isDraggingRef.current) {
      scheduleYearUpdate(e.clientY, true);
    }
    isDraggingRef.current = false;
  };

  // Calculate indicator position percentage: 0% at MAX_YEAR, 100% at MIN_YEAR
  const indicatorPercent = ((MAX_YEAR - year) / (MAX_YEAR - MIN_YEAR)) * 100;

  return (
    <aside
      ref={railRef}
      aria-label="Publication year timeline (1995 to 2026)"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="w-[54px] min-w-[54px] shrink-0 h-full border-r border-[rgba(255,255,255,0.07)] bg-[#030607] flex flex-col items-center justify-between select-none py-5 cursor-ns-resize relative touch-none"
    >
      {/* Background track line */}
      <div className="absolute top-5 bottom-5 w-[1px] bg-[rgba(255,255,255,0.06)] left-1/2 -translate-x-1/2 pointer-events-none" />

      {/* Active scrubbed track fill */}
      <div
        className="absolute bottom-5 w-[2px] bg-[#E6D29A] left-1/2 -translate-x-1/2 pointer-events-none transition-all duration-75 opacity-70"
        style={{
          top: `calc(${indicatorPercent}% + 20px)`,
        }}
      />

      {/* Major Tick Labels */}
      {MAJOR_TICKS.map(tick => {
        const tickPercent = ((MAX_YEAR - tick) / (MAX_YEAR - MIN_YEAR)) * 100;
        const isOverlappedByThumb = Math.abs(year - tick) <= 1;
        const isNearCurrent = Math.abs(year - tick) === 2;

        return (
          <div
            key={tick}
            className="absolute left-0 right-0 flex items-center justify-between px-1.5 pointer-events-none"
            style={{
              top: `calc(${tickPercent}% + 14px)`,
            }}
          >
            <span
              className={`text-[8.5px] tabular-nums tracking-tighter transition-opacity duration-75 ${
                isOverlappedByThumb
                  ? 'opacity-0'
                  : isNearCurrent
                  ? 'text-[#E6D29A] font-medium'
                  : 'text-[#4E6069]'
              }`}
            >
              {tick}
            </span>
            <div
              className={`w-1.5 h-[1px] ${
                isOverlappedByThumb || isNearCurrent ? 'bg-[#E6D29A] w-2.5' : 'bg-[rgba(255,255,255,0.15)]'
              }`}
            />
          </div>
        );
      })}

      {/* Active Draggable Thumb */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 transition-transform duration-75 flex items-center"
        style={{
          top: `calc(${indicatorPercent}% + 20px)`,
        }}
      >
        <div className="w-4 h-4 rounded-full border border-[#E6D29A] bg-[#0A1417] flex items-center justify-center shadow-[0_0_8px_rgba(230,210,154,0.4)]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#E6D29A]" />
        </div>
        {/* Floating current year badge */}
        <div className="absolute left-6 bg-[#0A1417] border border-[rgba(255,255,255,0.12)] px-1.5 py-0.5 rounded-[4px] text-[9.5px] text-[#E6D29A] font-medium tabular-nums shadow-lg whitespace-nowrap">
          {year}
        </div>
      </div>
    </aside>
  );
};
