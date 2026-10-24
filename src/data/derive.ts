/**
 * Pure derivation functions for Paper Atlas metrics with WeakMap-backed `${subfieldId}|${year}`
 * memoization (automatically invalidated whenever the `nodes` array reference changes).
 *
 * IMPORTANT METRIC HONESTY NOTE:
 * `coverage()` (displayed in UI as "Coverage index") is a custom composite index
 * constructed specifically for this project (`baseCoverage * (0.45 + 0.55 * density)`),
 * combining normalized cluster size with temporal publication density.
 * It is NOT a standard bibliometric indicator.
 *
 * Never read `subfield.baseCoverage` directly in UI components; always derive via `coverage()`.
 */
import type { Subfield, SubfieldStat, GNode } from './schema.ts';

const coverageCacheByNodes = new WeakMap<readonly GNode[], Map<string, number>>();
const growthCacheByNodes = new WeakMap<readonly GNode[], Map<string, number>>();
const barsCacheByNodes = new WeakMap<readonly GNode[], Map<string, number[]>>();

function getCacheMap<V>(
  weakStore: WeakMap<readonly GNode[], Map<string, V>>,
  nodes: readonly GNode[]
): Map<string, V> {
  let map = weakStore.get(nodes);
  if (!map) {
    map = new Map<string, V>();
    weakStore.set(nodes, map);
  }
  return map;
}

/**
 * Paper density within subfield up to given year:
 * fraction of the subfield's corpus papers (`paper` | `review`) published on or before `year`.
 */
export function density(subfieldId: string, year: number, nodes: readonly GNode[]): number {
  let total = 0;
  let upToYear = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.subfieldId === subfieldId && (n.kind === 'paper' || n.kind === 'review')) {
      total++;
      if (n.year <= year) upToYear++;
    }
  }
  if (total === 0) return 0;
  return upToYear / total;
}

/**
 * Dynamic growth rate based on scrubbed timeline year:
 * Compares papers in [effectiveYear - 2, effectiveYear] vs [effectiveYear - 5, effectiveYear - 3],
 * clamped to the latest publication year present in the subfield.
 * Memoized by `${subfieldId}|${currentYear}` per `nodes` reference.
 */
export function calculateGrowth(subfieldId: string, currentYear: number, nodes: readonly GNode[]): number {
  const cache = getCacheMap(growthCacheByNodes, nodes);
  const cacheKey = `${subfieldId}|${currentYear}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const sfPapers: GNode[] = [];
  let maxPaperYear = -Infinity;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.subfieldId === subfieldId && (n.kind === 'paper' || n.kind === 'review')) {
      sfPapers.push(n);
      if (n.year > maxPaperYear) maxPaperYear = n.year;
    }
  }

  if (sfPapers.length === 0) {
    cache.set(cacheKey, 1.0);
    return 1.0;
  }

  const effectiveYear = Math.min(currentYear, maxPaperYear);

  let recentCount = 0;
  let priorCount = 0;
  for (let i = 0; i < sfPapers.length; i++) {
    const y = sfPapers[i].year;
    if (y <= effectiveYear && y >= effectiveYear - 2) {
      recentCount++;
    } else if (y <= effectiveYear - 3 && y >= effectiveYear - 5) {
      priorCount++;
    }
  }

  let result: number;
  if (priorCount === 0) {
    result = recentCount > 0 ? 1.45 : 1.0;
  } else {
    const ratio = recentCount / priorCount;
    result = parseFloat(Math.max(0.4, Math.min(3.5, ratio)).toFixed(2));
  }

  cache.set(cacheKey, result);
  return result;
}

/**
 * Custom composite Coverage Index [0, 100] derived from cluster baseline and temporal density.
 * Rule: round(baseCoverage * (0.45 + 0.55 * density(subfield.id, year, nodes)))
 * Memoized by `${subfield.id}|${subfield.baseCoverage}|${year}` per `nodes` reference.
 */
export function coverage(subfield: Subfield, year: number, nodes: readonly GNode[]): number {
  const cache = getCacheMap(coverageCacheByNodes, nodes);
  const cacheKey = `${subfield.id}|${subfield.baseCoverage}|${year}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const d = density(subfield.id, year, nodes);
  const result = Math.min(100, Math.round(subfield.baseCoverage * (0.45 + 0.55 * d)));
  cache.set(cacheKey, result);
  return result;
}

/**
 * Field momentum: mean Coverage Index across all subfields at current timeline scrub year.
 */
export function momentum(subfields: readonly Subfield[], year: number, nodes: readonly GNode[]): number {
  if (subfields.length === 0) return 0;
  const sum = subfields.reduce((acc, sf) => acc + coverage(sf, year, nodes), 0);
  return Math.round(sum / subfields.length);
}

/**
 * 18-bar histogram for IntelPanel: papers published per year from (currentYear - 17) to currentYear.
 * Memoized by `${subfieldId}|${currentYear}` per `nodes` reference.
 */
export function calculateYearlyBars(subfieldId: string, currentYear: number, nodes: readonly GNode[]): number[] {
  const cache = getCacheMap(barsCacheByNodes, nodes);
  const cacheKey = `${subfieldId}|${currentYear}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const countsByYear = new Map<number, number>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.subfieldId === subfieldId && (n.kind === 'paper' || n.kind === 'review')) {
      countsByYear.set(n.year, (countsByYear.get(n.year) ?? 0) + 1);
    }
  }

  const startYear = Math.max(1995, currentYear - 17);
  const bars: number[] = [];
  for (let y = startYear; y <= currentYear; y++) {
    bars.push(countsByYear.get(y) ?? 0);
  }

  while (bars.length < 18) {
    bars.unshift(0);
  }

  const finalBars = bars.slice(-18);
  cache.set(cacheKey, finalBars);
  return finalBars;
}

/**
 * Real deduplicated entity counts per subfield from `graph.nodes` (up to `maxYear` if provided).
 * Eliminates fabricated multipliers (`* 1.8`, `* 0.25`) in favor of exact node counts.
 */
export function computeSubfieldStats(
  subfieldId: string,
  nodes: readonly GNode[],
  maxYear?: number
): SubfieldStat[] {
  const paperIds = new Set<string>();
  const authorIds = new Set<string>();
  const surveyIds = new Set<string>();
  const venueIds = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.subfieldId !== subfieldId) continue;
    if (maxYear !== undefined && n.year > maxYear) continue;

    if (n.kind === 'paper') {
      paperIds.add(n.id);
    } else if (n.kind === 'review') {
      paperIds.add(n.id);
      surveyIds.add(n.id);
    } else if (n.kind === 'author') {
      authorIds.add(n.id);
    } else if (n.kind === 'venue') {
      venueIds.add(n.id);
    }
  }

  return [
    { label: 'Papers', value: paperIds.size },
    { label: 'Authors', value: authorIds.size },
    { label: 'Surveys', value: surveyIds.size },
    { label: 'Venues', value: venueIds.size },
  ];
}

/**
 * Heuristic 5-year forecast projection (2027-2031) per subfield based on current growth rate & coverage.
 */
export interface ForecastResult {
  clusterId: string;
  clusterName: string;
  projectedNodes: number;
  projectedCoverage: number;
  growthMultiplier: number;
  insight: string;
}

export function computeForecast(subfields: readonly Subfield[], nodes: readonly GNode[]): ForecastResult[] {
  return subfields.map(sf => {
    const currentPapers = nodes.filter(
      n => n.subfieldId === sf.id && (n.kind === 'paper' || n.kind === 'review')
    ).length;
    const g = calculateGrowth(sf.id, 2026, nodes);
    const growthFactor = Math.pow(Math.max(1.05, Math.min(2.5, g)), 0.65);
    const projectedNodes = Math.round(currentPapers * growthFactor);
    const currentCov = coverage(sf, 2026, nodes);
    const projectedCoverage = Math.min(99, Math.round(currentCov * (1 + (g - 1) * 0.35)));

    let insight = '';
    if (g >= 1.5) {
      insight = `Surging frontier: 5-year heuristic projection estimates ~${projectedNodes} works (${projectedCoverage}% coverage index) with accelerating citation velocity (${g}x).`;
    } else if (g >= 1.1) {
      insight = `Steady maturation: 5-year heuristic projection estimates ~${projectedNodes} works (${projectedCoverage}% coverage index) at ${g}x growth momentum.`;
    } else {
      insight = `Consolidated domain: 5-year heuristic projection estimates ~${projectedNodes} works (${projectedCoverage}% coverage index, ${g}x ratio); foundational citations dominate recent volume.`;
    }

    return {
      clusterId: sf.id,
      clusterName: sf.name,
      projectedNodes,
      projectedCoverage,
      growthMultiplier: g,
      insight,
    };
  });
}
