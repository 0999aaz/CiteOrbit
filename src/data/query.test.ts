import test from 'node:test';
import assert from 'node:assert/strict';
import rawGraphData from './graph.json';
import type { Graph } from './schema.ts';
import { parseSearchQuery, executeGraphQuery } from './query.ts';

const graph = rawGraphData as unknown as Graph;

test('parseSearchQuery extracts since YYYY, exact YYYY, and last N years', () => {
  const q1 = parseSearchQuery('medical segmentation since 2020', 2026);
  assert.equal(q1.minYear, 2020);
  assert.equal(q1.maxYear, 2026);
  assert.deepEqual(q1.terms, ['medical', 'segmentation']);

  const q2 = parseSearchQuery('transformer attention 2021', 2026);
  assert.equal(q2.minYear, 2021);
  assert.equal(q2.maxYear, 2021);
  assert.deepEqual(q2.terms, ['transformer', 'attention']);

  const q3 = parseSearchQuery('survey last 4 years', 2025);
  assert.equal(q3.minYear, 2022);
  assert.equal(q3.maxYear, 2025);
  assert.deepEqual(q3.terms, ['survey']);
});

test('executeGraphQuery differs meaningfully across keywords, scope, and milestone filter', () => {
  const segSubfield =
    graph.subfields.find(s => s.name.toLowerCase().includes('segmentation')) || graph.subfields[0];

  const segCluster = executeGraphQuery({
    rawQuery: 'segmentation since 2018',
    scope: 'cluster',
    filterType: 'all',
    activeSubfield: segSubfield,
    activeYear: 2026,
    nodes: graph.nodes,
    subfields: graph.subfields,
  });

  const segGlobal = executeGraphQuery({
    rawQuery: 'segmentation since 2018',
    scope: 'global',
    filterType: 'all',
    activeSubfield: segSubfield,
    activeYear: 2026,
    nodes: graph.nodes,
    subfields: graph.subfields,
  });

  assert.ok(segCluster.totalMatched > 0);
  assert.ok(segGlobal.totalMatched > segCluster.totalMatched);
  for (const item of segCluster.items) {
    assert.equal(item.subfieldId, segSubfield.id);
    assert.ok(item.year >= 2018);
  }

  const milestoneGlobal = executeGraphQuery({
    rawQuery: 'learning',
    scope: 'global',
    filterType: 'milestone',
    activeSubfield: segSubfield,
    activeYear: 2026,
    nodes: graph.nodes,
    subfields: graph.subfields,
  });

  assert.ok(milestoneGlobal.p90Threshold !== null && milestoneGlobal.p90Threshold > 0);
  for (const item of milestoneGlobal.items) {
    assert.ok(item.citations >= (milestoneGlobal.p90Threshold ?? 0));
  }
});

test('executeGraphQuery returns explicit fallback when zero nodes match', () => {
  const sf0 = graph.subfields[0];
  const res = executeGraphQuery({
    rawQuery: 'nonexistentquantumxyztoken 2019',
    scope: 'cluster',
    filterType: 'all',
    activeSubfield: sf0,
    activeYear: 2026,
    nodes: graph.nodes,
    subfields: graph.subfields,
  });

  assert.equal(res.totalMatched, 0);
  assert.equal(res.isFallback, true);
  assert.equal(res.items.length, 3);
  assert.ok(res.summaryText.startsWith('0 direct matches'));
});
