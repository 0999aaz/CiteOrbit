import test from 'node:test';
import assert from 'node:assert/strict';
import rawGraphData from './graph.json';
import type { Graph, GEdge, GNode } from './schema.ts';
import { analyzeClusterGaps } from './gaps.ts';

const graph = rawGraphData as unknown as Graph;

test('analyzeClusterGaps identifies zero intra-cluster inDegree papers, gap years, and sparse 3y windows', () => {
  const synthNodes: GNode[] = [
    { id: 'P1', kind: 'paper', label: 'Foundational Isolated', year: 2014, weight: 900, subfieldId: 'sf-test', orbitAngle: 0, orbitRadius: 20, size: 5 },
    { id: 'P2', kind: 'paper', label: 'Cited Anchor', year: 2015, weight: 600, subfieldId: 'sf-test', orbitAngle: 1, orbitRadius: 25, size: 5 },
    { id: 'P3', kind: 'paper', label: 'Citing Followup 1', year: 2022, weight: 120, subfieldId: 'sf-test', orbitAngle: 2, orbitRadius: 30, size: 4 },
    { id: 'P4', kind: 'paper', label: 'Citing Followup 2', year: 2023, weight: 80, subfieldId: 'sf-test', orbitAngle: 3, orbitRadius: 35, size: 4 },
    { id: 'P5', kind: 'paper', label: 'Recent Burst 1', year: 2024, weight: 50, subfieldId: 'sf-test', orbitAngle: 4, orbitRadius: 40, size: 4 },
    { id: 'P6', kind: 'paper', label: 'Recent Burst 2', year: 2024, weight: 40, subfieldId: 'sf-test', orbitAngle: 5, orbitRadius: 45, size: 4 },
  ];

  const synthEdges: GEdge[] = [
    // P3 cites P2 -> P2 has intra-cluster inDegree = 1; P1 has intra-cluster inDegree = 0
    { source: 'P3', target: 'P2', kind: 'cites' },
  ];

  const report = analyzeClusterGaps('sf-test', 2024, synthNodes, synthEdges);

  // P2 is cited internally, so P2 must NOT be in zeroInDegreePapers; P1 (weight 900) must be #1
  assert.ok(!report.zeroInDegreePapers.some(p => p.id === 'P2'));
  assert.equal(report.zeroInDegreePapers[0]?.id, 'P1');

  // Gap years in [2015, 2024]: 2016..2021 have 0 papers
  assert.deepEqual(report.gapYearsLast10, [2016, 2017, 2018, 2019, 2020, 2021]);

  // Sparse 3-year windows (< 30% of annual average 6/11 = 0.545 -> < 0.1636 -> 0-paper windows)
  assert.ok(report.sparseWindows.some(w => w.startYear === 2016 && w.endYear === 2018 && w.count === 0));
});

test('analyzeClusterGaps runs cleanly on real OpenAlex subfields and differs by cluster', () => {
  const r0 = analyzeClusterGaps(graph.subfields[0].id, 2026, graph.nodes, graph.edges);
  const r1 = analyzeClusterGaps(graph.subfields[1].id, 2026, graph.nodes, graph.edges);

  assert.ok(r0.zeroInDegreePapers.length <= 5);
  assert.ok(r1.zeroInDegreePapers.length <= 5);
  assert.notDeepEqual(
    r0.zeroInDegreePapers.map(p => p.id),
    r1.zeroInDegreePapers.map(p => p.id)
  );
});
