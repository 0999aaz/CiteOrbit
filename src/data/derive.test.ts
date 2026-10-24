import test from 'node:test';
import assert from 'node:assert/strict';
import {
  density,
  coverage,
  momentum,
  calculateGrowth,
  calculateYearlyBars,
  computeSubfieldStats,
  computeForecast,
} from './derive.ts';
import type { Subfield, GNode, Graph } from './schema.ts';
import rawGraphData from './graph.json';

const mockSubfield: Subfield = {
  id: 'subfield-1',
  name: 'Medical Image Segmentation Techniques',
  baseCoverage: 90,
  growth: 1.4,
  stats: [
    { label: 'Papers', value: 3 },
    { label: 'Authors', value: 5 },
    { label: 'Surveys', value: 1 },
    { label: 'Venues', value: 2 },
  ],
  aiAnalysis: 'Mock analysis string',
};

const mockNodes: GNode[] = [
  {
    id: 'W1',
    kind: 'paper',
    label: 'Paper 2016',
    year: 2016,
    weight: 200,
    subfieldId: 'subfield-1',
    orbitAngle: 0,
    orbitRadius: 20,
    size: 4,
  },
  {
    id: 'W2',
    kind: 'paper',
    label: 'Paper 2019',
    year: 2019,
    weight: 350,
    subfieldId: 'subfield-1',
    orbitAngle: 1,
    orbitRadius: 30,
    size: 5,
  },
  {
    id: 'W3',
    kind: 'paper',
    label: 'Paper 2023',
    year: 2023,
    weight: 80,
    subfieldId: 'subfield-1',
    orbitAngle: 2,
    orbitRadius: 40,
    size: 4,
  },
];

test('density calculates correct ratio based on publication year', () => {
  const d2015 = density('subfield-1', 2015, mockNodes);
  assert.equal(d2015, 0);

  const d2018 = density('subfield-1', 2018, mockNodes);
  assert.equal(parseFloat(d2018.toFixed(2)), 0.33);

  const d2024 = density('subfield-1', 2024, mockNodes);
  assert.equal(d2024, 1);
});

test('coverage scales baseCoverage with density multiplier', () => {
  // coverage = baseCoverage * (0.45 + 0.55 * density)
  const cov2015 = coverage(mockSubfield, 2015, mockNodes);
  assert.equal(cov2015, Math.round(90 * 0.45)); // 41

  const cov2024 = coverage(mockSubfield, 2024, mockNodes);
  assert.equal(cov2024, 90); // 90 * (0.45 + 0.55 * 1.0) = 90
});

test('momentum averages coverage across subfields', () => {
  const sf2: Subfield = { ...mockSubfield, id: 'subfield-2', baseCoverage: 80 };
  const m = momentum([mockSubfield, sf2], 2024, mockNodes);
  // mockSubfield cov = 90, sf2 has 0 nodes so density = 0, cov = 80 * 0.45 = 36
  assert.equal(m, Math.round((90 + 36) / 2));
});

test('calculateGrowth handles 3-year windows correctly', () => {
  const g = calculateGrowth('subfield-1', 2023, mockNodes);
  assert.ok(typeof g === 'number' && g > 0);
});

test('calculateYearlyBars produces 18 bars', () => {
  const bars = calculateYearlyBars('subfield-1', 2024, mockNodes);
  assert.equal(bars.length, 18);
  assert.ok(bars.some(b => b > 0));
});

test('computeSubfieldStats counts deduplicated nodes per kind without synthetic multipliers', () => {
  const nodesWithEntities: GNode[] = [
    ...mockNodes,
    { id: 'R1', kind: 'review', label: 'Survey 2022', year: 2022, weight: 500, subfieldId: 'subfield-1', orbitAngle: 0, orbitRadius: 15, size: 6 },
    { id: 'A1', kind: 'author', label: 'Alice', year: 2023, weight: 550, citationSum: 550, paperCount: 2, subfieldId: 'subfield-1', orbitAngle: 0, orbitRadius: 75, size: 4.8 },
    { id: 'V1', kind: 'venue', label: 'Nature', year: 2022, weight: 500, citationSum: 500, paperCount: 1, subfieldId: 'subfield-1', orbitAngle: 0, orbitRadius: 88, size: 5.2 },
  ];

  const statsAll = computeSubfieldStats('subfield-1', nodesWithEntities);
  assert.deepEqual(statsAll, [
    { label: 'Papers', value: 4 },
    { label: 'Authors', value: 1 },
    { label: 'Surveys', value: 1 },
    { label: 'Venues', value: 1 },
  ]);

  const stats2020 = computeSubfieldStats('subfield-1', nodesWithEntities, 2020);
  assert.deepEqual(stats2020, [
    { label: 'Papers', value: 2 },
    { label: 'Authors', value: 0 },
    { label: 'Surveys', value: 0 },
    { label: 'Venues', value: 0 },
  ]);
});

test('computeForecast projects 5-year metrics consistently with calculateGrowth', () => {
  const results = computeForecast([mockSubfield], mockNodes);
  assert.equal(results.length, 1);
  assert.equal(results[0].clusterId, 'subfield-1');
  assert.equal(results[0].growthMultiplier, calculateGrowth('subfield-1', 2026, mockNodes));
  assert.ok(results[0].projectedNodes >= mockNodes.length);
});

test('graph.json satisfies P1-3 data honesty invariants (citationSum, paperCount, stats, growth)', () => {
  const graph = rawGraphData as unknown as Graph;
  assert.ok(graph.nodes.length >= 700 && graph.nodes.length <= 820);

  for (const node of graph.nodes) {
    assert.equal(typeof node.citationSum, 'number', `Node ${node.id} missing citationSum`);
    assert.equal(typeof node.paperCount, 'number', `Node ${node.id} missing paperCount`);
    if (node.kind === 'author' || node.kind === 'venue') {
      assert.ok((node.paperCount ?? 0) >= 2, `Entity ${node.id} should have >=2 corpus papers`);
      assert.equal(node.weight, node.citationSum);
    }
  }

  const maxYear = graph.yearRange[1];
  for (const sf of graph.subfields) {
    const expectedStats = computeSubfieldStats(sf.id, graph.nodes);
    assert.deepEqual(sf.stats, expectedStats, `Subfield ${sf.id} stats must match deduplicated graph.nodes`);
    const expectedGrowth = calculateGrowth(sf.id, maxYear, graph.nodes);
    assert.equal(sf.growth, expectedGrowth, `Subfield ${sf.id} growth must match calculateGrowth at maxYear`);
  }
});

test('derive memoization caches by subfieldId|year and invalidates when nodes reference changes', () => {
  const barsFirst = calculateYearlyBars('subfield-1', 2024, mockNodes);
  const barsSecond = calculateYearlyBars('subfield-1', 2024, mockNodes);
  // Same array reference returned from WeakMap cache
  assert.equal(barsFirst, barsSecond);

  const covBefore = coverage(mockSubfield, 2020, mockNodes);
  const nextNodes: GNode[] = [
    ...mockNodes,
    {
      id: 'W4',
      kind: 'paper',
      label: 'Paper 2020',
      year: 2020,
      weight: 120,
      subfieldId: 'subfield-1',
      orbitAngle: 0.5,
      orbitRadius: 25,
      size: 4,
    },
  ];
  const covAfter = coverage(mockSubfield, 2020, nextNodes);
  const barsThird = calculateYearlyBars('subfield-1', 2024, nextNodes);
  assert.notEqual(barsFirst, barsThird);
  assert.notEqual(covBefore, covAfter);
});
