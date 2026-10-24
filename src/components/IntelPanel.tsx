import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Graph, Subfield } from '../data/schema.ts';
import rawGraphData from '../data/graph.json';
import {
  coverage,
  calculateGrowth,
  calculateYearlyBars,
  computeSubfieldStats,
  computeForecast,
} from '../data/derive.ts';
import { analyzeClusterGaps } from '../data/gaps.ts';
import { useDashboard } from '../store/useDashboard.ts';
import { RadarWidget } from './RadarWidget.tsx';
import { commonPrefixLength, computeTypewriterStep } from '../utils/typewriter.ts';

const graph = rawGraphData as unknown as Graph;

export const IntelPanel: React.FC = () => {
  const selectedSubfieldId = useDashboard(s => s.selectedSubfieldId);
  const selectedNodeId = useDashboard(s => s.selectedNodeId);
  const setSelectedNodeId = useDashboard(s => s.setSelectedNodeId);
  const setSelectedSubfieldId = useDashboard(s => s.setSelectedSubfieldId);
  const year = useDashboard(s => s.year);
  const isForecasting = useDashboard(s => s.isForecasting);

  // Active subfield (defaults to first cluster if none selected)
  const activeSubfield: Subfield = useMemo(() => {
    return graph.subfields.find(s => s.id === selectedSubfieldId) || graph.subfields[0];
  }, [selectedSubfieldId]);

  // Active selected node details if a node is clicked
  const activeNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find(n => n.id === selectedNodeId) || null;
  }, [selectedNodeId]);

  // Derived metrics (all pure functions in derive.ts actively wired)
  const covVal = useMemo(() => coverage(activeSubfield, year, graph.nodes), [activeSubfield, year]);
  const dynGrowth = useMemo(
    () => calculateGrowth(activeSubfield.id, year, graph.nodes),
    [activeSubfield.id, year]
  );
  const yearlyBars = useMemo(
    () => calculateYearlyBars(activeSubfield.id, year, graph.nodes),
    [activeSubfield.id, year]
  );
  const liveStats = useMemo(
    () => computeSubfieldStats(activeSubfield.id, graph.nodes, year),
    [activeSubfield.id, year]
  );
  const forecastList = useMemo(() => computeForecast(graph.subfields, graph.nodes), []);
  const activeForecast = useMemo(
    () => forecastList.find(f => f.clusterId === activeSubfield.id) || forecastList[0],
    [forecastList, activeSubfield.id]
  );

  const maxBar = Math.max(1, ...yearlyBars);

  // Text content to display (honest provenance)
  const targetText = useMemo(() => {
    if (isForecasting && activeForecast) {
      return `[Forecast 2031 · Heuristic] ${activeForecast.insight} Current scrubbed ${year} growth ratio stands at ${dynGrowth}x.`;
    }
    if (activeNode) {
      if (activeNode.kind === 'author' || activeNode.kind === 'venue') {
        const pCount = activeNode.paperCount ?? 0;
        const cSum = (activeNode.citationSum ?? activeNode.weight).toLocaleString();
        return `"${activeNode.label}" (${activeNode.kind}) accounts for ${pCount} indexed papers totaling ${cSum} citations (latest active year ${activeNode.year}) in ${activeSubfield.name}.`;
      }
      return `"${activeNode.label}" published in ${activeNode.year}. Cited by ${activeNode.weight.toLocaleString()} works within global index. Connects directly into ${activeSubfield.name} citation lattice.`;
    }
    return activeSubfield.aiAnalysis;
  }, [isForecasting, activeForecast, activeNode, activeSubfield, dynGrowth, year]);

  // Debounce targetText by 150ms so rapid timeline scrubbing never restarts the typewriter per frame
  const [debouncedText, setDebouncedText] = useState(targetText);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      setDebouncedText(targetText);
      return;
    }
    const timerId = window.setTimeout(() => {
      setDebouncedText(targetText);
    }, 150);
    return () => window.clearTimeout(timerId);
  }, [targetText]);

  // Typewriter effect state: continues from shared prefix using elapsed-time calculation
  const [displayedText, setDisplayedText] = useState('');
  const displayedTextRef = useRef('');
  displayedTextRef.current = displayedText;

  useEffect(() => {
    const startPrefixLen = commonPrefixLength(displayedTextRef.current, debouncedText);
    const initialSlice = debouncedText.slice(0, startPrefixLen);
    setDisplayedText(initialSlice);
    displayedTextRef.current = initialSlice;

    if (startPrefixLen >= debouncedText.length) {
      return;
    }

    const startTimeMs = performance.now();
    const intervalId = window.setInterval(() => {
      const elapsedMs = performance.now() - startTimeMs;
      const step = computeTypewriterStep(debouncedText, startPrefixLen, elapsedMs, 18);
      setDisplayedText(step.text);
      displayedTextRef.current = step.text;
      if (step.done) {
        window.clearInterval(intervalId);
      }
    }, 18);

    return () => window.clearInterval(intervalId);
  }, [debouncedText]);

  // "Find gaps" state & clean single-timer transition (~300ms, never stacks)
  const [gapFindingActive, setGapFindingActive] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const gapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (gapTimerRef.current !== null) {
        window.clearTimeout(gapTimerRef.current);
      }
    };
  }, []);

  const gapReport = useMemo(() => {
    if (!showGaps) return null;
    return analyzeClusterGaps(activeSubfield.id, year, graph.nodes, graph.edges);
  }, [showGaps, activeSubfield.id, year]);

  const handleFindGaps = () => {
    if (gapTimerRef.current !== null) {
      window.clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
    setGapFindingActive(true);
    gapTimerRef.current = window.setTimeout(() => {
      gapTimerRef.current = null;
      setGapFindingActive(false);
      setShowGaps(true);
    }, 300);
  };

  const kindBadgeLabel = activeNode
    ? activeNode.kind === 'review'
      ? 'Review paper'
      : activeNode.kind === 'author'
        ? 'Author entity'
        : activeNode.kind === 'venue'
          ? 'Venue'
          : 'Peer reviewed'
    : 'Peer reviewed';

  const analysisHeaderLabel = isForecasting
    ? 'Trajectory projection (heuristic)'
    : activeNode
      ? 'Node metadata'
      : activeSubfield.analysisSource === 'gemini'
        ? 'Cluster synthesis (Gemini)'
        : 'Statistical analysis (template)';

  return (
    <aside className="w-[226px] min-w-[226px] shrink-0 h-full border-l border-[rgba(255,255,255,0.07)] bg-[#0A1417]/95 flex flex-col justify-between p-3 select-none overflow-y-auto overflow-x-hidden">
      <div className="space-y-3.5">
        {/* Top Header & Status Label */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8.5px] font-medium text-[#7B848B] tracking-wider uppercase">
              Subfield Intelligence
            </span>
            <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[8.5px] text-[#8FB6D8]">
              {kindBadgeLabel}
            </span>
          </div>

          <h2 className="text-[13px] font-medium text-[#DDDFE0] leading-snug line-clamp-2">
            {activeNode ? activeNode.label : activeSubfield.name}
          </h2>

          <div className="mt-1 text-[9.5px] text-[#7B848B]">
            {activeNode ? (
              activeNode.kind === 'author' || activeNode.kind === 'venue' ? (
                `${activeSubfield.name} · ${activeNode.paperCount ?? 0} papers · ${(activeNode.citationSum ?? activeNode.weight).toLocaleString()} cites`
              ) : (
                `${activeSubfield.name} · ${activeNode.year}`
              )
            ) : (
              <>
                <span
                  title="Composite index built for Paper Atlas: combines normalized cluster baseline size with historical publication density up to the active year (not a standard bibliometric metric)."
                  className="underline decoration-dotted decoration-[#4E6069] cursor-help"
                >
                  Coverage index {covVal}%
                </span>
                {` · Active year ${year}`}
              </>
            )}
          </div>
        </div>

        {/* Forecast 2031 Card when Forecast mode is active */}
        {isForecasting && activeForecast && (
          <div className="p-2 rounded-[7px] border border-[rgba(230,210,154,0.28)] bg-[rgba(230,210,154,0.04)] flex items-center justify-between text-[9px] tabular-nums">
            <div>
              <div className="text-[8px] uppercase tracking-wider text-[#E6D29A] font-medium">
                2031 Projection
              </div>
              <div className="text-[#DDDFE0] mt-0.5">
                ~{activeForecast.projectedNodes} works
              </div>
            </div>
            <div className="text-right">
              <div className="text-[8px] uppercase tracking-wider text-[#7B848B]">
                Est. Index
              </div>
              <div className="text-[#E6D29A] font-medium mt-0.5">
                {activeForecast.projectedCoverage}%
              </div>
            </div>
          </div>
        )}

        {/* Growth Rate + 18 Mini Bars Histogram */}
        <div className="p-2.5 rounded-[7px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.015)]">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[9.5px] text-[#A6A6A6] font-medium">
              Growth rate
            </span>
            <span className="text-[21px] font-medium text-[#E6D29A] tabular-nums leading-none">
              {dynGrowth}x
            </span>
          </div>

          {/* 18 Mini Bars */}
          <div className="flex items-end justify-between h-7 pt-1 gap-[2px]">
            {yearlyBars.map((cnt, idx) => {
              const heightPercent = Math.max(12, Math.round((cnt / maxBar) * 100));
              const isRecent = idx >= 15;
              return (
                <div
                  key={idx}
                  title={`Year ${year - 17 + idx}: ${cnt} papers`}
                  className={`w-[6px] rounded-t-[1px] transition-all duration-300 ${
                    isRecent ? 'bg-[#E6D29A]' : 'bg-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.4)]'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[8px] text-[#4E6069] mt-1 tabular-nums">
            <span>{year - 17}</span>
            <span>historical output</span>
            <span>{year}</span>
          </div>
        </div>

        {/* 2x2 Real Deduplicated Entity Grid */}
        <div className="grid grid-cols-2 gap-2">
          {liveStats.map(stat => (
            <div
              key={stat.label}
              className="p-2 rounded-[7px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.015)] flex flex-col justify-between"
            >
              <span className="text-[8.5px] text-[#7B848B] uppercase tracking-wider">
                {stat.label}
              </span>
              <span className="text-[13px] font-medium text-[#DDDFE0] tabular-nums mt-0.5">
                {stat.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {/* Radar Widget */}
        <RadarWidget />

        {/* Honest Statistical / Synthesis Analysis Card with Typewriter */}
        <div className="p-2.5 rounded-[7px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.012)]">
          <div className="flex items-center space-x-1.5 mb-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#E6D29A] animate-pulse" />
            <span className="text-[8.5px] font-medium text-[#E6D29A] uppercase tracking-wider">
              {analysisHeaderLabel}
            </span>
          </div>
          <p className="text-[9.5px] text-[#A6A6A6] leading-relaxed min-h-[56px] font-normal">
            {displayedText}
            {displayedText.length < debouncedText.length && (
              <span className="inline-block w-1.5 h-2.5 ml-0.5 bg-[#E6D29A] animate-pulse align-middle" />
            )}
          </p>
        </div>

        {/* Structural & Temporal Gaps Section */}
        {showGaps && gapReport && (
          <div
            role="region"
            aria-label="Structural and temporal gaps"
            className="p-2.5 rounded-[7px] border border-[rgba(230,210,154,0.25)] bg-[rgba(230,210,154,0.03)] space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-medium text-[#E6D29A] uppercase tracking-wider">
                Structural Gaps ({gapReport.evaluatedYear})
              </span>
              <button
                type="button"
                onClick={() => setShowGaps(false)}
                aria-label="Close gap analysis"
                className="text-[8.5px] text-[#7B848B] hover:text-[#DDDFE0]"
              >
                Close
              </button>
            </div>

            {/* (a) Unlinked intra-cluster high-impact papers */}
            <div>
              <div className="text-[8px] text-[#7B848B] uppercase tracking-wider mb-1">
                Uncited intra-cluster works (inDegree = 0)
              </div>
              {gapReport.zeroInDegreePapers.length === 0 ? (
                <div className="text-[9px] text-[#4E6069]">All cluster works linked internally.</div>
              ) : (
                <div className="space-y-1">
                  {gapReport.zeroInDegreePapers.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(item.id);
                        setSelectedSubfieldId(activeSubfield.id);
                      }}
                      className="w-full text-left px-1.5 py-1 rounded-[4px] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.06)] transition-colors"
                    >
                      <div className="text-[9px] text-[#DDDFE0] leading-tight line-clamp-1">
                        {item.title}
                      </div>
                      <div className="text-[8px] text-[#E6D29A] tabular-nums mt-0.5">
                        {item.year} · {item.citations.toLocaleString()} global cites · 0 local links
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* (b) 10-year publication gap years */}
            <div className="pt-1 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-[8px] text-[#7B848B] uppercase tracking-wider mb-0.5">
                10y zero-output years
              </div>
              <div className="text-[9px] text-[#A6A6A6] tabular-nums">
                {gapReport.gapYearsLast10.length > 0
                  ? gapReport.gapYearsLast10.join(', ')
                  : 'None (continuous output in last 10y)'}
              </div>
            </div>

            {/* (c) Sparse 3-year sliding windows (<30% annual avg) */}
            <div className="pt-1 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-[8px] text-[#7B848B] uppercase tracking-wider mb-0.5">
                Sparse 3y windows (&lt;30% of {gapReport.annualAverage}/yr avg)
              </div>
              <div className="text-[9px] text-[#A6A6A6] tabular-nums leading-snug">
                {gapReport.sparseWindows.length > 0
                  ? gapReport.sparseWindows
                      .slice(0, 4)
                      .map(w => `${w.startYear}–${w.endYear} (${w.count})`)
                      .join(' · ')
                  : 'None detected across cluster span'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Button: Find Gaps */}
      <div className="pt-3">
        <button
          onClick={handleFindGaps}
          disabled={gapFindingActive}
          aria-label="Find research gaps"
          className="w-full h-8 rounded-[7px] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.07)] text-[#DDDFE0] text-[11px] font-medium transition-colors flex items-center justify-center space-x-1.5 active:scale-[0.99]"
        >
          {gapFindingActive ? (
            <>
              <div className="w-3 h-3 border-2 border-[#E6D29A] border-t-transparent rounded-full animate-spin" />
              <span>Scanning citation topology...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 text-[#E6D29A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Find gaps</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
