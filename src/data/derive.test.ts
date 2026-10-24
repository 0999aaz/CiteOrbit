import test from 'node:test';
import assert from 'node:assert/strict';
import { density, coverage, momentum, calculateGrowth, calculateYearlyBars } from './derive.ts';
import type { Subfield, GNode } from './schema.ts';

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
