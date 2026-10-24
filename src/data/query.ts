/**
 * Pure query parser and literature search engine for CommandBar.
 * Supports temporal expressions (`since YYYY`, `YYYY`, `last N years`),
 * scope filtering (`cluster` vs `global`), milestone filtering (P90 citations),
 * multi-tier lexical scoring, and explicit zero-match fallback.
 */
import type { GNode, Subfield } from './schema.ts';

export type QueryScope = 'cluster' | 'global';
export type QueryFilterType = 'all' | 'milestone';

export interface ParsedQuery {
  raw: string;
  terms: string[];
  phrase: string;
  minYear: number | null;
  maxYear: number | null;
  yearLabel: string;
}

export interface MatchedWork {
  id: string;
  title: string;
  year: number;
  citations: number;
  kind: GNode['kind'];
  subfieldId: string;
  subfieldName: string;
}

export interface QueryExecutionResult {
  parsed: ParsedQuery;
  scopeLabel: string;
  filterLabel: string;
  p90Threshold: number | null;
  totalMatched: number;
  isFallback: boolean;
  items: MatchedWork[];
  summaryText: string;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'to', 'and', 'or', 'with',
  'by', 'about', 'what', 'which', 'who', 'where', 'when', 'how', 'are', 'is',
  'was', 'were', 'be', 'show', 'find', 'list', 'give', 'me', 'top', 'best',
  'papers', 'paper', 'works', 'work', 'studies', 'study', 'articles', 'article',
  'citations', 'citation', 'cited', 'subfield', 'cluster', 'global', 'atlas',
]);

/**
 * Parses temporal filters (`since YYYY`, `last N years`, bare `YYYY`) and extracts search terms.
 */
export function parseSearchQuery(rawQuery: string, activeYear: number): ParsedQuery {
  let working = rawQuery.toLowerCase().trim();
  let minYear: number | null = null;
  let maxYear: number | null = activeYear;
  let yearLabel = `≤ ${activeYear}`;

  // 1. Check `since YYYY` / `after YYYY` / `from YYYY`
  const sinceMatch = working.match(/\b(?:since|after|from)\s+(19\d{2}|20\d{2})\b/);
  if (sinceMatch) {
    const y = parseInt(sinceMatch[1], 10);
    minYear = y;
    maxYear = Math.max(activeYear, y);
    yearLabel = `since ${y}`;
    working = working.replace(sinceMatch[0], ' ');
  } else {
    // 2. Check `last N years` / `past N years`
    const lastNMatch = working.match(/\b(?:last|past|recent)\s+(\d{1,2})\s+years?\b/);
    if (lastNMatch) {
      const n = Math.max(1, parseInt(lastNMatch[1], 10));
      minYear = activeYear - n + 1;
      maxYear = activeYear;
      yearLabel = `${minYear}–${maxYear}`;
      working = working.replace(lastNMatch[0], ' ');
    } else {
      // 3. Check standalone 4-digit year `YYYY`
      const exactYearMatch = working.match(/\b(19\d{2}|20\d{2})\b/);
      if (exactYearMatch) {
        const y = parseInt(exactYearMatch[1], 10);
        minYear = y;
        maxYear = y;
        yearLabel = `${y}`;
        working = working.replace(exactYearMatch[0], ' ');
      }
    }
  }

  const rawTokens = working
    .replace(/[^a-z0-9-]+/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const token of rawTokens) {
    if (!seen.has(token)) {
      seen.add(token);
      terms.push(token);
    }
  }

  return {
    raw: rawQuery.trim(),
    terms,
    phrase: terms.join(' '),
    minYear,
    maxYear,
    yearLabel,
  };
}

/**
 * Computes the 90th-percentile citation weight for milestone filtering.
 */
export function computeP90Weight(nodes: readonly GNode[]): number {
  if (nodes.length === 0) return 0;
  const sortedWeights = nodes.map(n => n.weight).sort((a, b) => a - b);
  const idx = Math.min(sortedWeights.length - 1, Math.floor(sortedWeights.length * 0.9));
  return sortedWeights[idx];
}

export function executeGraphQuery(params: {
  rawQuery: string;
  scope: QueryScope;
  filterType: QueryFilterType;
  activeSubfield: Subfield;
  activeYear: number;
  nodes: readonly GNode[];
  subfields: readonly Subfield[];
}): QueryExecutionResult {
  const { rawQuery, scope, filterType, activeSubfield, activeYear, nodes, subfields } = params;
  const parsed = parseSearchQuery(rawQuery, activeYear);

  const subfieldMap = new Map<string, string>();
  for (const sf of subfields) {
    subfieldMap.set(sf.id, sf.name);
  }
  subfieldMap.set('root', 'Foundation Benchmark');

  // Step 1: Literature pool scoped to cluster or global
  const scopePool = nodes.filter(n => {
    if (n.kind !== 'paper' && n.kind !== 'review') return false;
    if (scope === 'cluster') {
      return n.subfieldId === activeSubfield.id;
    }
    return true;
  });

  // Step 2: Milestone P90 threshold within scope pool
  const p90Threshold = filterType === 'milestone' ? computeP90Weight(scopePool) : null;
  const milestonePool = p90Threshold !== null
    ? scopePool.filter(n => n.weight >= p90Threshold)
    : scopePool;

  // Step 3: Temporal filter
  const timeFilteredPool = milestonePool.filter(n => {
    if (parsed.minYear !== null && n.year < parsed.minYear) return false;
    if (parsed.maxYear !== null && n.year > parsed.maxYear) return false;
    return true;
  });

  // Step 4: Score by exact phrase inclusion > term hit count > subfield name hit > weight
  const scored: Array<{
    node: GNode;
    exactPhrase: number;
    termHits: number;
    subfieldHits: number;
  }> = [];

  for (const node of timeFilteredPool) {
    const labelLower = node.label.toLowerCase();
    const sfNameLower = (subfieldMap.get(node.subfieldId) ?? '').toLowerCase();

    if (parsed.terms.length === 0) {
      scored.push({ node, exactPhrase: 0, termHits: 0, subfieldHits: 0 });
      continue;
    }

    const exactPhrase = parsed.phrase.length > 0 && labelLower.includes(parsed.phrase) ? 1 : 0;
    let termHits = 0;
    let subfieldHits = 0;
    for (const term of parsed.terms) {
      if (labelLower.includes(term)) termHits++;
      if (sfNameLower.includes(term)) subfieldHits++;
    }

    if (exactPhrase > 0 || termHits > 0 || subfieldHits > 0) {
      scored.push({ node, exactPhrase, termHits, subfieldHits });
    }
  }

  scored.sort((a, b) => {
    if (b.exactPhrase !== a.exactPhrase) return b.exactPhrase - a.exactPhrase;
    if (b.termHits !== a.termHits) return b.termHits - a.termHits;
    if (b.subfieldHits !== a.subfieldHits) return b.subfieldHits - a.subfieldHits;
    return b.node.weight - a.node.weight;
  });

  const toMatchedWork = (node: GNode): MatchedWork => ({
    id: node.id,
    title: node.label,
    year: node.year,
    citations: node.weight,
    kind: node.kind,
    subfieldId: node.subfieldId,
    subfieldName: subfieldMap.get(node.subfieldId) ?? activeSubfield.name,
  });

  const scopeLabel = scope === 'cluster' ? activeSubfield.name : 'Global Atlas';
  const filterLabel = filterType === 'milestone'
    ? `Milestones P90 (≥${(p90Threshold ?? 0).toLocaleString()} cites)`
    : 'All citations';

  if (scored.length === 0) {
    const candidateFallback =
      timeFilteredPool.length > 0
        ? timeFilteredPool
        : milestonePool.length > 0
          ? milestonePool
          : scopePool;
    const fallbackPool = candidateFallback
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map(toMatchedWork);

    const summaryText = `0 direct matches for "${parsed.raw}" in ${scopeLabel} (${parsed.yearLabel}, ${filterLabel}). Showing top ${fallbackPool.length} highest-cited works in scope: ` +
      fallbackPool.map(w => `"${w.title}" (${w.year}, ${w.citations.toLocaleString()} cites)`).join('; ');

    return {
      parsed,
      scopeLabel,
      filterLabel,
      p90Threshold,
      totalMatched: 0,
      isFallback: true,
      items: fallbackPool,
      summaryText,
    };
  }

  const topItems = scored.slice(0, 3).map(s => toMatchedWork(s.node));
  const summaryText = `${scored.length} match${scored.length === 1 ? '' : 'es'} in ${scopeLabel} (${parsed.yearLabel}, ${filterLabel}): ` +
    topItems.map(w => `"${w.title}" (${w.year}, ${w.citations.toLocaleString()} cites)`).join('; ');

  return {
    parsed,
    scopeLabel,
    filterLabel,
    p90Threshold,
    totalMatched: scored.length,
    isFallback: false,
    items: topItems,
    summaryText,
  };
}
