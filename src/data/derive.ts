/**
 * Pure derivation functions for metrics.
 * Note: Never read baseCoverage directly; always compute derived coverage through coverage().
 */
import type { Subfield, GNode } from './schema.ts';

/**
 * Paper density within subfield up to given year
 */
export function density(subfieldId: string, year: number, nodes: GNode[]): number {
  const sfNodes = nodes.filter(n => n.subfieldId === subfieldId && (n.kind === 'paper' || n.kind === 'review'));
  if (sfNodes.length === 0) return 0;
  const filtered = sfNodes.filter(n => n.year <= year);
  return filtered.length / sfNodes.length;
}

/**
 * Dynamic growth rate based on scrubbed timeline year:
 * Compares papers in [evalYear-2, evalYear] vs [evalYear-5, evalYear-3]
 * When timeline is scrubbed, Growth rate updates in real time.
 */
export function calculateGrowth(subfieldId: string, currentYear: number, nodes: GNode[]): number {
  const sfNodes = nodes.filter(n => n.subfieldId === subfieldId && (n.kind === 'paper' || n.kind === 'review'));
  if (sfNodes.length === 0) return 1.0;

  // Find max publication year among papers in this subfield
  const maxPaperYear = Math.max(...sfNodes.map(n => n.year));
  // If current scrub year exceeds latest papers in index, evaluate at the latest valid active window
  const effectiveYear = Math.min(currentYear, maxPaperYear);

  const recentCount = sfNodes.filter(n => n.year <= effectiveYear && n.year >= effectiveYear - 2).length;
  const priorCount = sfNodes.filter(n => n.year <= effectiveYear - 3 && n.year >= effectiveYear - 5).length;

  if (priorCount === 0) {
    return recentCount > 0 ? 1.45 : 1.0;
  }
  const ratio = recentCount / priorCount;
  return parseFloat(Math.max(0.4, Math.min(3.5, ratio)).toFixed(2));
}

/**
 * Real coverage derived dynamically from baseCoverage and historical density.
 * Rule: baseCoverage * (0.45 + 0.55 * density(subfield, year))
 */
export function coverage(subfield: Subfield, year: number, nodes: GNode[]): number {
  const d = density(subfield.id, year, nodes);
  return Math.min(100, Math.round(subfield.baseCoverage * (0.45 + 0.55 * d)));
}

/**
 * Field momentum: average coverage across all subfields at current timeline scrub year
 */
export function momentum(subfields: Subfield[], year: number, nodes: GNode[]): number {
  if (subfields.length === 0) return 0;
  const sum = subfields.reduce((acc, sf) => acc + coverage(sf, year, nodes), 0);
  return Math.round(sum / subfields.length);
}

/**
 * 18-bar histogram for IntelPanel: papers published per year from (currentYear - 17) to currentYear
 */
export function calculateYearlyBars(subfieldId: string, currentYear: number, nodes: GNode[]): number[] {
  const sfNodes = nodes.filter(n => n.subfieldId === subfieldId && (n.kind === 'paper' || n.kind === 'review'));
  const startYear = Math.max(1995, currentYear - 17);
  const bars: number[] = [];

  for (let y = startYear; y <= currentYear; y++) {
    const count = sfNodes.filter(n => n.year === y).length;
    bars.push(count);
  }

  // Ensure 18 bars
  while (bars.length < 18) {
    bars.unshift(0);
  }

  return bars.slice(-18);
}

/**
 * Forecast simulation: project growth for the next 5 years (2027-2031)
 */
export interface ForecastResult {
  clusterId: string;
  clusterName: string;
  projectedNodes: number;
  projectedCoverage: number;
  growthMultiplier: number;
  insight: string;
}

export function computeForecast(subfields: Subfield[], nodes: GNode[]): ForecastResult[] {
  return subfields.map(sf => {
    const currentCount = nodes.filter(n => n.subfieldId === sf.id).length;
    const g = sf.growth || 1.2;
    // Compounded 5-year factor dampened by log growth
    const growthFactor = Math.pow(Math.max(1.05, Math.min(2.5, g)), 0.65);
    const projectedNodes = Math.round(currentCount * growthFactor);
    const currentCov = coverage(sf, 2026, nodes);
    const projectedCoverage = Math.min(99, Math.round(currentCov * (1 + (g - 1) * 0.35)));

    let insight = '';
    if (g >= 1.5) {
      insight = `Surging frontier: 5-year trajectory anticipates ~${projectedNodes} works with accelerating cross-domain citations.`;
    } else if (g >= 1.1) {
      insight = `Steady maturation: foundational paradigms consolidated, shifting into downstream validation and engineering.`;
    } else {
      insight = `Consolidated domain: high cumulative citations but plateauing novelty; prime for architectural paradigm shift.`;
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
