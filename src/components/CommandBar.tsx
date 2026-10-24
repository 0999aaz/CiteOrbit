import React, { useState } from 'react';
import { useDashboard } from '../store/useDashboard.ts';
import type { Graph } from '../data/schema.ts';
import rawGraphData from '../data/graph.json';
import {
  executeGraphQuery,
  type QueryExecutionResult,
  type QueryFilterType,
  type QueryScope,
} from '../data/query.ts';

const graph = rawGraphData as unknown as Graph;

export const CommandBar: React.FC = () => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<QueryScope>('cluster');
  const [filterType, setFilterType] = useState<QueryFilterType>('all');
  const [activeResult, setActiveResult] = useState<QueryExecutionResult | null>(null);

  const selectedSubfieldId = useDashboard(s => s.selectedSubfieldId);
  const setSelectedSubfieldId = useDashboard(s => s.setSelectedSubfieldId);
  const setSelectedNodeId = useDashboard(s => s.setSelectedNodeId);
  const year = useDashboard(s => s.year);
  const addQARecord = useDashboard(s => s.addQARecord);

  const activeSubfield = graph.subfields.find(s => s.id === selectedSubfieldId) || graph.subfields[0];

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const result = executeGraphQuery({
      rawQuery: trimmed,
      scope,
      filterType,
      activeSubfield,
      activeYear: year,
      nodes: graph.nodes,
      subfields: graph.subfields,
    });

    setActiveResult(result);
    addQARecord({
      question: trimmed,
      answer: result.summaryText,
      timestamp: Date.now(),
    });
    setQuery('');
  };

  const handleFocusPaper = (nodeId: string, subfieldId: string) => {
    setSelectedNodeId(nodeId);
    if (subfieldId && subfieldId !== 'root') {
      setSelectedSubfieldId(subfieldId);
    }
  };

  return (
    <div className="relative h-[46px] min-h-[46px] border-t border-[rgba(255,255,255,0.07)] bg-[#030607] px-4 flex items-center select-none z-30">
      {/* Structured Query Result Popover */}
      {activeResult && (
        <div
          role="region"
          aria-label="Citation query results"
          className="absolute bottom-[52px] left-4 right-4 bg-[#0A1417]/95 border border-[rgba(255,255,255,0.12)] p-3 rounded-[7px] shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center flex-wrap gap-1.5 text-[9.5px]">
              <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(230,210,154,0.12)] border border-[rgba(230,210,154,0.28)] text-[#E6D29A] font-medium">
                {activeResult.isFallback ? '0 direct matches · Fallback Top 3' : `${activeResult.totalMatched} matched`}
              </span>
              <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#DDDFE0]">
                Scope: {activeResult.scopeLabel}
              </span>
              <span className="px-1.5 py-0.5 rounded-[4px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#7B848B]">
                {activeResult.parsed.yearLabel} · {activeResult.filterLabel}
              </span>
              <span className="text-[#4E6069] truncate max-w-[260px]">
                Query: "{activeResult.parsed.raw}"
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveResult(null)}
              aria-label="Dismiss query results"
              className="text-[9.5px] text-[#7B848B] hover:text-[#DDDFE0] shrink-0"
            >
              Dismiss
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {activeResult.items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleFocusPaper(item.id, item.subfieldId)}
                className="text-left p-2 rounded-[7px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(230,210,154,0.3)] transition-colors"
              >
                <div className="flex items-center justify-between text-[8.5px] text-[#7B848B] mb-0.5 tabular-nums">
                  <span className="truncate max-w-[160px] text-[#8FB6D8]">
                    #{idx + 1} · {item.subfieldName}
                  </span>
                  <span className="text-[#E6D29A] font-medium shrink-0 ml-1">
                    {item.year} · {item.citations.toLocaleString()} cites
                  </span>
                </div>
                <div className="text-[10.5px] text-[#DDDFE0] font-medium leading-snug line-clamp-2">
                  {item.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSend} className="w-full h-[32px] flex items-center justify-between gap-3">
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
            aria-label="Search papers in subfield or global atlas"
            placeholder="Query literature (e.g. segmentation since 2020, transformer 2021)..."
            className="w-full bg-transparent text-[11px] text-[#DDDFE0] placeholder-[#4E6069] focus:outline-none"
          />
        </div>

        {/* Toggle Capsule 1: Scope */}
        <button
          type="button"
          onClick={() => setScope(s => s === 'cluster' ? 'global' : 'cluster')}
          aria-label={`Search scope: ${scope === 'cluster' ? 'Cluster scope' : 'Global atlas'}`}
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
          aria-label={`Citation filter: ${filterType === 'milestone' ? 'Milestones only' : 'All citations'}`}
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
          aria-label="Run citation query"
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
