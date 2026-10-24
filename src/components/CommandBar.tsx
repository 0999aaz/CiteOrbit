import React, { useState } from 'react';
import { useDashboard } from '../store/useDashboard.ts';
import type { Graph } from '../data/schema.ts';
import rawGraphData from '../data/graph.json';
import { calculateGrowth, coverage } from '../data/derive.ts';

const graph = rawGraphData as unknown as Graph;

export const CommandBar: React.FC = () => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'cluster' | 'global'>('cluster');
  const [filterType, setFilterType] = useState<'all' | 'milestone'>('all');
  const [activeResponse, setActiveResponse] = useState<string | null>(null);

  const selectedSubfieldId = useDashboard(s => s.selectedSubfieldId);
  const year = useDashboard(s => s.year);
  const addQARecord = useDashboard(s => s.addQARecord);

  const activeSubfield = graph.subfields.find(s => s.id === selectedSubfieldId) || graph.subfields[0];

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const g = calculateGrowth(activeSubfield.id, year, graph.nodes);
    const cov = coverage(activeSubfield, year, graph.nodes);

    let answer = `Q: ${trimmed} → ${activeSubfield.name} (${year} benchmark, coverage ${cov}%): ${activeSubfield.aiAnalysis} Current growth momentum registers at ${g}x.`;

    setActiveResponse(answer);
    addQARecord({
      question: trimmed,
      answer,
      timestamp: Date.now(),
    });
    setQuery('');
  };

  return (
    <div className="relative border-t border-[rgba(255,255,255,0.07)] bg-[#030607] px-4 py-2 select-none z-30">
      {/* Active Response Toast */}
      {activeResponse && (
        <div className="absolute bottom-[52px] left-4 right-4 bg-[#0A1417]/95 border border-[rgba(255,255,255,0.12)] p-2.5 rounded-[7px] shadow-2xl backdrop-blur-md flex items-start justify-between">
          <div className="text-[11px] text-[#E6D29A] leading-relaxed">
            {activeResponse}
          </div>
          <button
            onClick={() => setActiveResponse(null)}
            className="text-[9.5px] text-[#7B848B] hover:text-[#DDDFE0] ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSend} className="h-[34px] flex items-center justify-between gap-3">
        {/* Capsule Input Field */}
        <div className="flex-1 h-full flex items-center bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] rounded-[20px] px-3 focus-within:border-[rgba(255,255,255,0.2)] focus-within:bg-[rgba(255,255,255,0.03)] transition-all">
          <svg className="w-3.5 h-3.5 text-[#7B848B] mr-2 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about this subfield..."
            className="w-full bg-transparent text-[11px] text-[#DDDFE0] placeholder-[#4E6069] focus:outline-none"
          />
        </div>

        {/* Toggle Capsule 1: Scope */}
        <button
          type="button"
          onClick={() => setScope(s => s === 'cluster' ? 'global' : 'cluster')}
          className={`h-full px-2.5 rounded-[20px] border text-[9.5px] transition-colors shrink-0 ${
            scope === 'cluster'
              ? 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.15)] text-[#E6D29A]'
              : 'bg-transparent border-[rgba(255,255,255,0.07)] text-[#7B848B] hover:text-[#A6A6A6]'
          }`}
        >
          {scope === 'cluster' ? 'Cluster scope' : 'Global atlas'}
        </button>

        {/* Toggle Capsule 2: Filter */}
        <button
          type="button"
          onClick={() => setFilterType(f => f === 'all' ? 'milestone' : 'all')}
          className={`h-full px-2.5 rounded-[20px] border text-[9.5px] transition-colors shrink-0 ${
            filterType === 'milestone'
              ? 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.15)] text-[#E6D29A]'
              : 'bg-transparent border-[rgba(255,255,255,0.07)] text-[#7B848B] hover:text-[#A6A6A6]'
          }`}
        >
          {filterType === 'milestone' ? 'Milestones only' : 'All citations'}
        </button>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!query.trim()}
          className="h-full px-3.5 rounded-[20px] bg-[#E6D29A] text-[#030607] font-medium text-[11px] hover:bg-[#F2DFAC] disabled:opacity-30 disabled:hover:bg-[#E6D29A] transition-all flex items-center justify-center shrink-0"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
};
