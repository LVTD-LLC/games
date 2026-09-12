import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS,
  TRACK_LENGTH,
  FINISH_DISTANCE,
  MAX_SPEED,
  createRace,
  trackPoint,
  stepRace,
  tickRace,
  settingsFrom,
} from './race.mjs';

function advance(race, input, seconds) {
  for (let i = 0; i < seconds * 60; i++) stepRace(race, input, 1 / 60);
}
test('settings recover from corrupt or missing storage and bound the number of cars', () => {
  for (const value of [undefined, null, 'bad', { count: '6', color: 'red' }])
    assert.deepEqual(settingsFrom(value), { count: 3, color: COLORS[0] });
  assert.equal(settingsFrom({ count: 99 }).count, 6);
  assert.equal(settingsFrom({ count: -1 }).count, 1);
  assert.equal(createRace({ count: 1 }).rivals.length, 0);
  assert.equal(createRace({ count: 6 }).rivals.length, 5);
});
test('road joins and loop are continuous, with normalized tangents', () => {
  for (const s of [
    0,
    160,
    160 + Math.PI * 45,
    320 + Math.PI * 45,
    TRACK_LENGTH,
  ]) {
    const before = trackPoint(s - 0.001),
      after = trackPoint(s + 0.001);
    assert.ok(Math.hypot(before.x - after.x, before.z - after.z) < 0.003);
    assert.ok(Math.hypot(before.tx - after.tx, before.tz - after.tz) < 0.001);
    assert.ok(Math.abs(Math.hypot(after.tx, after.tz) - 1) < 1e-8);
  }
  assert.deepEqual(trackPoint(-1), trackPoint(TRACK_LENGTH - 1));
});
test('countdown, acceleration, braking priority and pause never move the car unexpectedly', () => {
  const race = createRace({ count: 3 });
  race.phase = 'countdown';
  advance(race, { accelerate: true }, 2);
  assert.equal(race.distance, 0);
  advance(race, {}, 2);
  assert.equal(race.phase, 'racing');
  assert.equal(race.speed, 0);
  advance(race, { accelerate: true }, 3);
  assert.equal(race.speed, MAX_SPEED);
  advance(race, { accelerate: true, brake: true }, 2);
  assert.equal(race.speed, 0);
  const distance = race.distance;
  advance(race, { brake: true }, 10);
  assert.equal(race.distance, distance);
  race.phase = 'paused';
  const snapshot = structuredClone(race);
  advance(race, { accelerate: true, left: true }, 60);
  assert.deepEqual(race, snapshot);
});
test('holding either steering key through a whole race cannot leave the road or get stuck', () => {
  for (const turn of ['left', 'right']) {
    const race = createRace({ count: 6 });
    race.phase = 'racing';
    advance(race, { accelerate: true, [turn]: true }, 40);
    assert.equal(race.phase, 'finished');
    assert.equal(race.distance, FINISH_DISTANCE);
    assert.ok(Math.abs(race.offset) <= 6.6);
    assert.equal(race.place, 1);
    assert.equal(race.speed, 0);
    const finished = structuredClone(race);
    advance(race, { accelerate: true }, 5);
    assert.deepEqual(race, finished);
  }
});
test('opponents wait for a beginner and move aside instead of causing collisions', () => {
  const race = createRace({ count: 6 });
  race.phase = 'racing';
  advance(race, {}, 90);
  assert.ok(race.rivals.every((r) => r.distance < 32));
  race.offset = race.rivals[0].offset;
  race.rivals[0].distance = 1;
  const oldOffset = race.rivals[0].offset;
  advance(race, {}, 0.3);
  assert.ok(race.rivals[0].offset < oldOffset);
  advance(race, { accelerate: true }, 40);
  assert.equal(race.phase, 'finished');
});
test('large or invalid frame gaps cannot teleport the player', () => {
  const race = createRace({ count: 3 });
  race.phase = 'racing';
  race.speed = MAX_SPEED;
  stepRace(race, { accelerate: true }, 1000);
  assert.ok(race.distance <= 1.25);
  const before = race.distance;
  stepRace(race, {}, NaN);
  assert.equal(race.distance, before);
});

test('countdown and driving retain their pace across fast and slow rendering', () => {
  const distances = [];
  for (const fps of [8, 15, 30, 60, 120]) {
    const race = createRace({ count: 3 });
    race.phase = 'countdown';
    for (let i = 0; i < fps * 10; i++)
      tickRace(race, { accelerate: true }, 1 / fps);
    assert.equal(race.phase, 'racing');
    assert.ok(Math.abs(race.elapsed - 7) < 0.04);
    distances.push(race.distance);
  }
  assert.ok(Math.max(...distances) - Math.min(...distances) < 1);
});
