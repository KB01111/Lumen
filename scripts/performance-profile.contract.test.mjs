import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const performanceSpec = await readFile(new URL('../tests/e2e/performance.spec.ts', import.meta.url), 'utf8');
const performanceProfile = await readFile(new URL('./performance-profile.mjs', import.meta.url), 'utf8');

test('rapid input is dispatched as one renderer-side burst in both performance runners', () => {
  for (const source of [performanceSpec, performanceProfile]) {
    assert.match(source, /dispatchRapidInputBurst\(/);
    assert.doesNotMatch(source, /search\.fill\(`rapid-burst-/);
  }
});

test('the dedicated profile preserves strict 240 Hz results beside its observed-frame release budget', () => {
  assert.match(performanceProfile, /strict240Hz/);
  assert.match(performanceProfile, /effectivePaintFrameBudgetMs/);
  assert.match(performanceProfile, /environmentEligibility/);
});

test('hover uses paired frame intervals and rejects renderer long tasks in both runners', () => {
  const e2eHover = performanceSpec.split("test('hover, idle work")[1] ?? '';
  const profileHover = performanceProfile.split('const hoverSamples = []')[1] ?? '';
  for (const source of [e2eHover, profileHover]) {
    assert.match(source, /hoverFrameIntervals/);
    assert.match(source, /hoverMetrics\.longTasks\.filter\(\(duration\) => duration > 16\)/);
  }
  assert.doesNotMatch(e2eHover, /measureFrameCadence\(/);
});
