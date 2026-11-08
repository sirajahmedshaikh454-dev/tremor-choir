import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, project, pitchFor, voiceFor, replayAt, fibSphere } from './lib.js';

test('normalize handles compact rows and GeoJSON, drops junk, sorts by time', () => {
  const geo = { features: [
    { geometry: { coordinates: [10, 20, 5] }, properties: { mag: 4, time: 2, place: 'B' } },
    { geometry: { coordinates: [11, 21, 6] }, properties: { mag: null, time: 1, place: 'bad' } },
    { geometry: { coordinates: [12, 22, -1] }, properties: { mag: 3, time: 1, place: 'A' } },
  ] };
  const q = normalize(geo);
  assert.deepEqual(q.map(x => x.place), ['A', 'B']);
  assert.equal(q[0].depth, 0); // negative depth clamped
  const sample = normalize(JSON.parse(readFileSync(new URL('./sample.json', import.meta.url))));
  assert.ok(sample.length > 500);
});

test('projection: lon 0 lat 0 faces the viewer, antipode hides', () => {
  const f = project(0, 0, 0, 0), b = project(180, 0, 0, 0);
  assert.ok(Math.abs(f.x) < 1e-9 && f.z > 0.999);
  assert.ok(b.z < -0.999);
});

test('deeper quakes sing lower; voice stays in safe ranges', () => {
  assert.ok(pitchFor(0) > pitchFor(100) && pitchFor(100) > pitchFor(650));
  for (const mag of [-1, 0, 2.5, 5, 9.5]) {
    const v = voiceFor({ lon: 200, depth: 10, mag });
    assert.ok(v.gain > 0 && v.gain <= 0.6 && v.dur > 0 && v.dur <= 6 && Math.abs(v.pan) <= 1);
  }
});

test('replay timing and sphere', () => {
  assert.equal(replayAt(5, 0, 10, 60), 30);
  assert.equal(replayAt(5, 3, 3, 60), 0);
  assert.equal(fibSphere(100).length, 100);
});
