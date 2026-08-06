import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patternStepAt, patternReadout, formatClock, rangeLabel, scaleFor, trigStep } from '../src/lib/index.js';

// bars 9-12: 4 bars, so 1x with 4 steps per bar
const region = { idx: 2, start: 9, end: 13, len: 4, bp: 'B1 P2', scale: scaleFor(4) };
// bars 0-8: 9 bars, forced down to 1/4x
const long = { idx: 1, start: 0, end: 9, len: 9, bp: 'B1 P1', scale: scaleFor(9) };

test('the trig step counts from the section start and agrees with the exporter', () => {
  assert.equal(patternStepAt(region, 9), 1);
  assert.equal(patternStepAt(region, 10), 1 + region.scale.steps);
  assert.equal(patternStepAt(region, 12.5), trigStep(3, region.scale.steps) + region.scale.steps / 2);
  assert.equal(patternStepAt(long, 4), trigStep(4, long.scale.steps));   // bar 5 of a 1/4x pattern
});

test('the step is clamped to the pattern, never before it and never past its end', () => {
  assert.equal(patternStepAt(region, 0), 1);                     // before the section
  assert.equal(patternStepAt(region, 99), region.scale.LEN);     // after it
  assert.equal(patternStepAt(region, 12.999), region.scale.LEN);
});

test('the readout names the pattern, its multiplier and the step', () => {
  assert.equal(patternReadout(region, 10), `B1 P2 · ${region.scale.mult} · step ${1 + region.scale.steps}/${region.scale.LEN}`);
});

test('the clock shows minutes, seconds and tenths', () => {
  assert.equal(formatClock(0), '0:00.0');
  assert.equal(formatClock(-1), '0:00.0');
  assert.equal(formatClock(9.55), '0:09.5');
  assert.equal(formatClock(125.04), '2:05.0');
});

test('a range label reads in 1-based, inclusive bars', () => {
  assert.equal(rangeLabel(4, 9), 'bars 5–9');
  assert.equal(rangeLabel(0, 1), 'bars 1–1');
});
