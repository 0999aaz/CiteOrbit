import test from 'node:test';
import assert from 'node:assert/strict';
import { commonPrefixLength, computeTypewriterStep } from './typewriter.ts';

test('commonPrefixLength preserves shared forecast prefix instead of resetting to empty', () => {
  const prev = '[Forecast 2031 Simulation] Projected cluster trajectory indicates 92% network density. Growth vector remains steady at 1.45x';
  const next = '[Forecast 2031 Simulation] Projected cluster trajectory indicates 92% network density. Growth vector remains steady at 1.82x';

  const prefixLen = commonPrefixLength(prev, next);
  assert.ok(prefixLen > 100);
  assert.equal(next.slice(0, prefixLen), '[Forecast 2031 Simulation] Projected cluster trajectory indicates 92% network density. Growth vector remains steady at 1.');
});

test('commonPrefixLength returns 0 when switching between unrelated cluster analyses', () => {
  const a = 'Medical Image Segmentation output 42 papers...';
  const b = 'Transformer Vision Architectures output 38 papers...';
  assert.equal(commonPrefixLength(a, b), 0);
});

test('computeTypewriterStep advances deterministically by elapsed time and finishes cleanly', () => {
  const target = 'Citation analysis ready.';
  const step0 = computeTypewriterStep(target, 0, 0, 18);
  assert.equal(step0.text, '');
  assert.equal(step0.done, false);

  const stepMid = computeTypewriterStep(target, 9, 90, 18); // 9 + 5 = 14 chars
  assert.equal(stepMid.text, target.slice(0, 14));
  assert.equal(stepMid.done, false);

  const stepEnd = computeTypewriterStep(target, 9, 1000, 18);
  assert.equal(stepEnd.text, target);
  assert.equal(stepEnd.done, true);
});
