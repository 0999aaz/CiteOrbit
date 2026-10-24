/**
 * Pure structural & temporal gap analysis for a subfield citation cluster.
 */
import type { GEdge, GNode } from './schema.ts';

export interface UnconnectedPaper {
  id: string;
  title: string;
  year: number;
  citations: number;
}

export interface SparseWindow {
  startYear: number;
  endYear: number;
  count: number;
  windowAnnualAvg: number;
}

export interface ClusterGapReport {
  subfieldId: string;
  evaluatedYear: number;
  annualAverage: number;
  zeroInDegreePapers: UnconnectedPaper[];
  gapYearsLast10: number[];
  sparseWindows: SparseWindow[];
}

/**
 * Computes three verifiable structural/temporal gaps for `subfieldId` up to `currentYear`:
 * (a) Zero intra-cluster `cites` in-degree papers (top 5 by global citation weight desc)
 * (b) Gap years (0 papers) within the last 10 years [max(1995, currentYear - 9), currentYear]
 * (c) 3-year sliding windows whose annual rate falls below 30% of the cluster's annual average
 */
export function analyzeClusterGaps(
  subfieldId: string,
  currentYear: number,
  nodes: readonly GNode[],
  edges: readonly GEdge[]
): ClusterGapReport {
  const clusterPapers = nodes.filter(
    n =>
      n.subfieldId === subfieldId &&
      (n.kind === 'paper' || n.kind === 'review') &&
      n.year <= currentYear
  );

  const clusterPaperIdSet = new Set<string>(clusterPapers.map(p => p.id));

  // (a) Intra-cluster citation in-degree (`kind === 'cites'`, both endpoints in cluster <= currentYear)
  const intraInDegree = new Map<string, number>();
  for (const paper of clusterPapers) {
    intraInDegree.set(paper.id, 0);
  }

  for (const edge of edges) {
    if (edge.kind !== 'cites') continue;
    if (clusterPaperIdSet.has(edge.source) && clusterPaperIdSet.has(edge.target)) {
      intraInDegree.set(edge.target, (intraInDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const zeroInDegreePapers: UnconnectedPaper[] = clusterPapers
    .filter(p => (intraInDegree.get(p.id) ?? 0) === 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      title: p.label,
      year: p.year,
      citations: p.weight,
    }));

  // Count papers by publication year
  const countByYear = new Map<number, number>();
  let minPubYear = currentYear;
  for (const p of clusterPapers) {
    countByYear.set(p.year, (countByYear.get(p.year) ?? 0) + 1);
    if (p.year < minPubYear) minPubYear = p.year;
  }

  // (b) Gap years in the last 10 years [max(1995, currentYear - 9), currentYear]
  const tenYearStart = Math.max(1995, currentYear - 9);
  const gapYearsLast10: number[] = [];
  for (let y = tenYearStart; y <= currentYear; y++) {
    if ((countByYear.get(y) ?? 0) === 0) {
      gapYearsLast10.push(y);
    }
  }

  // (c) Sparse 3-year sliding windows (< 30% of cluster annual average)
  const spanStart = clusterPapers.length > 0 ? Math.max(1995, minPubYear) : tenYearStart;
  const spanLength = Math.max(1, currentYear - spanStart + 1);
  const annualAverage = clusterPapers.length / spanLength;
  const sparseThresholdPerYear = annualAverage * 0.3;

  const sparseWindows: SparseWindow[] = [];
  if (clusterPapers.length > 0 && currentYear - spanStart + 1 >= 3) {
    for (let wStart = spanStart; wStart <= currentYear - 2; wStart++) {
      const wEnd = wStart + 2;
      const c0 = countByYear.get(wStart) ?? 0;
      const c1 = countByYear.get(wStart + 1) ?? 0;
      const c2 = countByYear.get(wEnd) ?? 0;
      const sum3 = c0 + c1 + c2;
      const windowAnnualAvg = sum3 / 3;

      if (windowAnnualAvg < sparseThresholdPerYear) {
        sparseWindows.push({
          startYear: wStart,
          endYear: wEnd,
          count: sum3,
          windowAnnualAvg: parseFloat(windowAnnualAvg.toFixed(2)),
        });
      }
    }
  }

  return {
    subfieldId,
    evaluatedYear: currentYear,
    annualAverage: parseFloat(annualAverage.toFixed(2)),
    zeroInDegreePapers,
    gapYearsLast10,
    sparseWindows,
  };
}
