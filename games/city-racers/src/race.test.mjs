import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS,
  TRACKS,
  getTrack,
  MAX_SPEED,
  createRace,
  stepRace,
  tickRace,
  settingsFrom,
} from './race.mjs';

const TRACK_LENGTH = TRACKS.park.length;
const FINISH_DISTANCE = TRACK_LENGTH;
const trackPoint = TRACKS.park.point;
function advance(race, input, seconds) {
  input = Array.isArray(input) ? input : [input];
  for (let i = 0; i < seconds * 60; i++) stepRace(race, input, 1 / 60);
}
test('settings recover from corrupt or missing storage and bound the number of cars', () => {
  for (const value of [undefined, null, 'bad', { count: '6', color: 'red' }])
    assert.deepEqual(settingsFrom(value), {
      count: 3,
      color: COLORS[0],
      color2: COLORS[1],
      players: 1,
      map: 'park',
    });
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
  assert.equal(race.drivers[0].distance, 0);
  advance(race, {}, 2);
  assert.equal(race.phase, 'racing');
  assert.equal(race.drivers[0].speed, 0);
  advance(race, { accelerate: true }, 3);
  assert.equal(race.drivers[0].speed, MAX_SPEED);
  advance(race, { accelerate: true, brake: true }, 2);
  assert.equal(race.drivers[0].speed, 0);
  const distance = race.drivers[0].distance;
  advance(race, { brake: true }, 10);
  assert.equal(race.drivers[0].distance, distance);
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
    assert.equal(race.drivers[0].distance, FINISH_DISTANCE);
    assert.ok(Math.abs(race.drivers[0].offset) <= 6.6);
    assert.equal(race.drivers[0].speed, 0);
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
  race.drivers[0].offset = race.rivals[0].offset;
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
  race.drivers[0].speed = MAX_SPEED;
  stepRace(race, [{ accelerate: true }], 1000);
  assert.ok(race.drivers[0].distance <= 1.25);
  const before = race.drivers[0].distance;
  stepRace(race, [{}], NaN);
  assert.equal(race.drivers[0].distance, before);
});

test('countdown and driving retain their pace across fast and slow rendering', () => {
  const distances = [];
  for (const fps of [8, 15, 30, 60, 120]) {
    const race = createRace({ count: 3 });
    race.phase = 'countdown';
    for (let i = 0; i < fps * 10; i++)
      tickRace(race, [{ accelerate: true }], 1 / fps);
    assert.equal(race.phase, 'racing');
    assert.ok(Math.abs(race.elapsed - 7) < 0.04);
    distances.push(race.drivers[0].distance);
  }
  assert.ok(Math.max(...distances) - Math.min(...distances) < 1);
});

test('old saves migrate and two drivers always fit in the total car count with distinct colors', () => {
  assert.deepEqual(settingsFrom({ count: 4, color: COLORS[2] }), {
    count: 4,
    color: COLORS[2],
    color2: COLORS[0],
    players: 1,
    map: 'park',
  });
  const settings = settingsFrom({
    count: 1,
    players: 2,
    color: COLORS[1],
    color2: COLORS[1],
    map: 'missing',
  });
  assert.equal(settings.count, 2);
  assert.notEqual(settings.color, settings.color2);
  assert.equal(settings.map, 'park');
  for (const map of ['__proto__', 'constructor', 'toString'])
    assert.equal(settingsFrom({ map }).map, 'park');
  const race = createRace(settings);
  assert.equal(race.drivers.length, 2);
  assert.equal(race.rivals.length, 0);
  assert.equal(createRace({ count: 6, players: 2 }).rivals.length, 4);
});
test('city adventure is longer, has both turn directions, and joins smoothly without crossing itself', () => {
  const track = getTrack('city');
  assert.ok(track.length > TRACK_LENGTH * 1.8);
  for (const s of [...track.joins, track.length]) {
    const a = track.point(s - 0.001),
      b = track.point(s + 0.001);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.003);
    assert.ok(Math.hypot(a.tx - b.tx, a.tz - b.tz) < 0.001);
  }
  let left = false,
    right = false;
  const samples = [];
  for (let s = 0; s < track.length; s += 5) {
    const a = track.point(s),
      b = track.point(s + 1);
    const turn = a.tx * b.tz - a.tz * b.tx;
    left ||= turn < -0.01;
    right ||= turn > 0.01;
    samples.push({ ...a, s });
  }
  assert.ok(left && right);
  for (const a of samples)
    for (const b of samples) {
      const along = Math.min(
        Math.abs(a.s - b.s),
        track.length - Math.abs(a.s - b.s),
      );
      if (along > 70)
        assert.ok(
          Math.hypot(a.x - b.x, a.z - b.z) > 35,
          `Road clearance at ${a.s}/${b.s}`,
        );
    }
});
test('two drivers accelerate, brake and steer independently on either map', () => {
  for (const map of ['park', 'city']) {
    const race = createRace({ players: 2, count: 6, map });
    race.phase = 'racing';
    advance(race, [{}, { accelerate: true }], 3);
    assert.equal(race.drivers[0].distance, 0);
    assert.ok(race.drivers[1].distance > 30);
    advance(
      race,
      [
        { accelerate: true, left: true },
        { accelerate: true, right: true },
      ],
      3,
    );
    assert.ok(race.drivers[0].offset < 0);
    assert.ok(race.drivers[1].offset > 0);
    advance(race, [{ accelerate: true }, { accelerate: true, brake: true }], 2);
    assert.equal(race.drivers[0].speed, MAX_SPEED);
    assert.equal(race.drivers[1].speed, 0);
    advance(
      race,
      [
        { accelerate: true, left: true },
        { accelerate: true, right: true },
      ],
      70,
    );
    assert.equal(race.phase, 'finished');
    assert.ok(
      race.drivers.every(
        (driver) =>
          driver.distance === race.length && Math.abs(driver.offset) <= 6.6,
      ),
    );
  }
});
test('the first finisher cannot end the second driver’s race and pause freezes both cars', () => {
  const race = createRace({ players: 2, count: 2 });
  race.phase = 'racing';
  advance(race, [{ accelerate: true }, {}], 35);
  assert.equal(race.phase, 'racing');
  assert.notEqual(race.drivers[0].finishTime, null);
  assert.equal(race.drivers[1].distance, 0);
  const finished = structuredClone(race.drivers[0]);
  race.phase = 'paused';
  const paused = structuredClone(race);
  advance(race, [{ accelerate: true }, { accelerate: true }], 10);
  assert.deepEqual(race, paused);
  race.phase = 'racing';
  advance(race, [{ accelerate: true }, { accelerate: true }], 35);
  assert.equal(race.phase, 'finished');
  assert.deepEqual(race.drivers[0], finished);
  assert.ok(race.drivers[1].finishTime > race.drivers[0].finishTime);
});

import { readInputs } from './input.mjs';
test('physical WASD codes and simultaneous touch/keyboard input stay assigned to their driver', () => {
  const keys = new Set(['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyD']);
  const pointers = new Map([[7, [1, 'brake']]]);
  assert.deepEqual(readInputs(keys, pointers, 2), [
    { accelerate: true, left: true },
    { accelerate: true, right: true, brake: true },
  ]);
  assert.deepEqual(readInputs(keys, pointers, 1), [
    { accelerate: true, left: true },
  ]);
  pointers.clear();
  keys.clear();
  assert.deepEqual(readInputs(keys, pointers, 2), [{}, {}]);
});
