import test from 'node:test';
import assert from 'node:assert/strict';
import rawGraphData from '../data/graph.json';
import type { Graph } from '../data/schema.ts';
import { precomputeGraphLayout } from './precompute.ts';
import { computeClusterAnchors, computeNodePositions } from './positions.ts';
import { worldToScreen } from '../canvas/camera.ts';
import { hitTest } from '../canvas/hitTest.ts';

const graph = rawGraphData as unknown as Graph;
const layout = precomputeGraphLayout(graph);

test('computeNodePositions matches animated geometry across timeSec samples and selection states', () => {
  const sampleTimes = [0, 7.3, 31.9, 120.5];
  const selectionStates: Array<string | null> = [null, graph.subfields[0]?.id ?? 'subfield-1'];

  for (const selectedSubfieldId of selectionStates) {
    for (const timeSec of sampleTimes) {
      const anchors = computeClusterAnchors(
        graph.subfields,
        layout.subfieldPositions,
        timeSec,
        selectedSubfieldId,
        null
      );
      const positions = computeNodePositions(
        layout.nodes,
        graph.root.id,
        anchors,
        timeSec
      );

      assert.equal(positions.size, layout.nodes.length, 'Every node must have a computed animated position');

      // Independently verify the formula for every single node (< 1e-6 error)
      layout.nodes.forEach((node, k) => {
        const pos = positions.get(node.id);
        assert.ok(pos, `Missing position for node ${node.id}`);

        if (node.id === graph.root.id || node.subfieldId === 'root') {
          assert.ok(Math.abs(pos.x) < 1e-6 && Math.abs(pos.y) < 1e-6);
          return;
        }

        const sfIdx = graph.subfields.findIndex(s => s.id === node.subfieldId);
        assert.ok(sfIdx >= 0);
        const basePolar = layout.subfieldPositions.get(node.subfieldId)!;
        const floatOffset = Math.sin(timeSec * 1.2 + sfIdx * 1.25) * 2.5;
        let expectedSfRadius = basePolar.radius + floatOffset;
        if (node.subfieldId === selectedSubfieldId) {
          expectedSfRadius *= 1.18;
        }
        const expectedAx = Math.cos(basePolar.angle) * expectedSfRadius;
        const expectedAy = Math.sin(basePolar.angle) * expectedSfRadius;

        const direction = k % 2 === 0 ? 1 : -1;
        const wobbleSpeed = (0.07 + (k % 20) * 0.004) * direction;
        const angle = node.orbitAngle + timeSec * wobbleSpeed;
        const r = node.subfieldId === selectedSubfieldId ? node.orbitRadius * 1.12 : node.orbitRadius;
        const expectedX = expectedAx + Math.cos(angle) * r;
        const expectedY = expectedAy + Math.sin(angle) * r;

        assert.ok(Math.abs(pos.x - expectedX) < 1e-6, `Node ${node.id} X mismatch at t=${timeSec}`);
        assert.ok(Math.abs(pos.y - expectedY) < 1e-6, `Node ${node.id} Y mismatch at t=${timeSec}`);
      });
    }
  }
});

test('hitTest resolves exact animated node under worldToScreen projection across all 779 nodes', () => {
  const sampleTimes = [0, 7.3, 31.9, 120.5];
  const originX = 1160 * 0.42;
  const originY = 810 * 0.54;
  const camera = { x: -45, y: 30, scale: 2.5 };

  for (const selectedSubfieldId of [null, graph.subfields[1]?.id ?? 'subfield-2']) {
    for (const timeSec of sampleTimes) {
      const anchors = computeClusterAnchors(
        graph.subfields,
        layout.subfieldPositions,
        timeSec,
        selectedSubfieldId,
        null
      );
      const positions = computeNodePositions(
        layout.nodes,
        graph.root.id,
        anchors,
        timeSec
      );

      for (const node of layout.nodes) {
        const pos = positions.get(node.id)!;
        const screenPt = worldToScreen(pos.x, pos.y, originX, originY, camera);
        const hit = hitTest(
          screenPt.x,
          screenPt.y,
          originX,
          originY,
          camera,
          layout.nodes,
          positions,
          anchors
        );

        assert.equal(hit.hitType, 'node');
        assert.ok(hit.node, 'Expected hit node to be defined');
        if (hit.node.id !== node.id) {
          // Only permissible if two nodes coincide to within floating-point tolerance
          const hitPos = positions.get(hit.node.id)!;
          const separation = Math.hypot(hitPos.x - pos.x, hitPos.y - pos.y);
          assert.ok(
            hit.distance <= 1e-6 && separation <= 1e-6,
            `Expected hit ${node.id} at t=${timeSec}, got ${hit.node.id} (dist=${hit.distance}, sep=${separation})`
          );
        }
      }
    }
  }
});
