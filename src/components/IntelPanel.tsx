import React, { useState, useEffect, useMemo } from 'react';
import type { Graph, Subfield } from '../data/schema.ts';
import rawGraphData from '../data/graph.json';
import { coverage, calculateGrowth, calculateYearlyBars } from '../data/derive.ts';
import { useDashboard } from '../store/useDashboard.ts';
import { RadarWidget } from './RadarWidget.tsx';

const graph = rawGraphData as unknown as Graph;

export const IntelPanel: React.FC = () => {
  const selectedSubfieldId = useDashboard(s => s.selectedSubfieldId);
  const selectedNodeId = useDashboard(s => s.selectedNodeId);
  const year = useDashboard(s => s.year);
  const isForecasting = useDashboard(s => s.isForecasting);

  // Active subfield (defaults to first cluster if none selected)
  const activeSubfield: Subfield = useMemo(() => {
    return graph.subfields.find(s => s.id === selectedSubfieldId) || graph.subfields[0];
  }, [selectedSubfieldId]);

  // Active selected paper details if a node is clicked
  const activeNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find(n => n.id === selectedNodeId) || null;
  }, [selectedNodeId]);

  // Derived metrics
  const covVal = useMemo(() => coverage(activeSubfield, year, graph.nodes), [activeSubfield, year]);
  const dynGrowth = useMemo(() => calculateGrowth(activeSubfield.id, year, graph.nodes), [activeSubfield.id, year]);
  const yearlyBars = useMemo(() => calculateYearlyBars(activeSubfield.id, year, graph.nodes), [activeSubfield.id, year]);
  const maxBar = Math.max(1, ...yearlyBars);

  // Text content to display
  const targetText = useMemo(() => {
    if (isForecasting) {
      return `[Forecast 2031 Simulation] Projected cluster trajectory indicates ${Math.round(activeSubfield.baseCoverage * 1.08)}% network density. Growth vector remains steady at ${dynGrowth}x with emerging citation convergence toward foundational benchmarks.`;
    }
    if (activeNode) {
      return `"${activeNode.label}" published in ${activeNode.year}. Cited by ${activeNode.weight.toLocaleString()} works within global index. Connects directly into ${activeSubfield.name} citation lattice.`;
    }
    return activeSubfield.aiAnalysis;
  }, [isForecasting, activeNode, activeSubfield, dynGrowth]);

  // Typewriter effect state
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');
    let currentIdx = 0;
    const interval = setInterval(() => {
      currentIdx++;
      if (currentIdx <= targetText.length) {
        setDisplayedText(targetText.slice(0, currentIdx));
      } else {
        clearInterval(interval);
      }
    }, 18);

    return () => clearInterval(interval);
  }, [targetText]);

  // "Find gaps" modal state
  const [gapFindingActive, setGapFindingActive] = useState(false);

  const handleFindGaps = () => {
    setGapFindingActive(true);
    setTimeout(() => {
      setGapFindingActive(false);
    }, 3000);
  };

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
              {activeNode ? (activeNode.kind === 'review' ? 'Review paper' : 'Peer reviewed') : 'Peer reviewed'}
            </span>
          </div>

          <h2 className="text-[13px] font-medium text-[#DDDFE0] leading-snug line-clamp-2">
            {activeNode ? activeNode.label : activeSubfield.name}
          </h2>

          <div className="mt-1 text-[9.5px] text-[#7B848B]">
            {activeNode ? `${activeSubfield.name} · ${activeNode.year}` : `Base coverage ${covVal}% · Active year ${year}`}
          </div>
        </div>

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

        {/* 2x2 Data Grid */}
        <div className="grid grid-cols-2 gap-2">
          {activeSubfield.stats.map(stat => (
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

        {/* AI Analysis with Typewriter Effect */}
        <div className="p-2.5 rounded-[7px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.012)]">
          <div className="flex items-center space-x-1.5 mb-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#E6D29A] animate-pulse" />
            <span className="text-[8.5px] font-medium text-[#E6D29A] uppercase tracking-wider">
              {isForecasting ? 'Trajectory analysis' : 'Citation analysis'}
            </span>
          </div>
          <p className="text-[9.5px] text-[#A6A6A6] leading-relaxed min-h-[56px] font-normal">
            {displayedText}
            {displayedText.length < targetText.length && (
              <span className="inline-block w-1.5 h-2.5 ml-0.5 bg-[#E6D29A] animate-pulse align-middle" />
            )}
          </p>
        </div>
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
              <span>Synthesizing frontier gaps...</span>
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
