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
      assist: true,
      difficulty: 'easy',
      laps: 1,
    });
  assert.equal(settingsFrom({ count: 99 }).count, 12);
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
test('easy opponents stay nearby while real opponents keep full race pace', () => {
  for (const difficulty of ['easy', 'real']) {
    const race = createRace({ count: 12, difficulty, laps: 3 });
    race.phase = 'racing';
    advance(race, {}, 25);
    if (difficulty === 'easy')
      assert.ok(race.rivals.every((r) => r.distance < 75));
    else {
      assert.ok(race.rivals.every((r) => r.distance > 400));
      assert.ok(race.rivals.every((r) => r.speed > 24));
    }
  }
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
    assist: true,
    difficulty: 'easy',
    laps: 1,
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

import { contact, resolveContact } from './collisions.mjs';
import { getScenery } from './scenery.mjs';
import { recoverDriver, START } from './race.mjs';
const body = (x, z, heading = 0) => ({
  x,
  z,
  heading,
  vx: 0,
  vz: 0,
  finishTime: null,
});
test('oriented bumpers touch without overlap and transfer a rear impact into a push', () => {
  const a = body(0, 0),
    b = body(0, 4);
  a.vz = 20;
  assert.ok(contact(a, b));
  resolveContact(a, b);
  assert.equal(contact(a, b), null);
  assert.ok(b.vz > 9);
  assert.ok(a.vz < 11);
  const wall = { x: 0, z: 5, heading: 0, halfW: 10, halfL: 1 };
  const c = body(0, 3);
  c.vz = 25;
  resolveContact(c, wall, true);
  assert.equal(contact(c, wall), null);
  assert.equal(c.vz, 0);
  assert.equal(wall.z, 5);
  const side = body(2, 0, Math.PI / 3),
    parked = body(0, 0);
  assert.ok(contact(side, parked));
  resolveContact(side, parked);
  assert.equal(contact(side, parked), null);
});
test('all 12 cars stay solid through a crowded, steered race on either route', () => {
  for (const map of ['park', 'city']) {
    const race = createRace({ players: 2, count: 12, map, laps: 2 });
    race.phase = 'racing';
    let worst = 0;
    for (let i = 0; i < 60 * 130 && race.phase !== 'finished'; i++) {
      tickRace(
        race,
        [
          { accelerate: true, right: true },
          { accelerate: true, left: true },
        ],
        1 / 60,
      );
      const cars = [...race.drivers, ...race.rivals];
      for (let a = 0; a < cars.length; a++)
        for (let b = a + 1; b < cars.length; b++)
          worst = Math.max(worst, contact(cars[a], cars[b])?.depth || 0);
    }
    assert.ok(worst < 0.035, `${map}: overlap ${worst}`);
    assert.equal(race.phase, 'finished');
    assert.ok(race.drivers.every((c) => c.distance === race.length));
  }
});
test('free driving leaves the road, brakes into reverse, and recovery never skips a gate', () => {
  const race = createRace({ assist: false, count: 1 });
  race.phase = 'racing';
  advance(race, { accelerate: true, right: true }, 1.7);
  const car = race.drivers[0];
  assert.ok(Math.abs(car.offset) > 9);
  assert.equal(car.nextGate, 1);
  advance(race, { brake: true }, 4);
  assert.ok(car.speed < 0, 'hold brake reverses after stopping');
  const gates = car.nextGate;
  assert.ok(recoverDriver(race, 0));
  assert.equal(car.nextGate, gates);
  assert.equal(car.speed, 0);
  assert.equal(car.vx, 0);
  assert.equal(car.vz, 0);
  assert.ok(Math.abs(car.offset) <= 5);
  const position = { x: car.x, z: car.z };
  race.phase = 'paused';
  assert.equal(recoverDriver(race, 0), false);
  advance(race, { accelerate: true }, 1);
  assert.deepEqual({ x: car.x, z: car.z }, position);
});
test('full-speed free driving cannot tunnel through a rendered building or tree trunk', () => {
  for (const kind of ['building', 'tree']) {
    const race = createRace({ assist: false, count: 1 });
    race.phase = 'racing';
    const obstacle = getScenery(race.map).obstacles.find(
      (o) => o.kind === kind,
    );
    const car = race.drivers[0];
    Object.assign(car, {
      x: obstacle.x,
      z: obstacle.z - obstacle.halfL - 6,
      heading: 0,
      vx: 0,
      vz: 25,
      speed: 25,
    });
    for (let i = 0; i < 180; i++) {
      tickRace(race, [{ accelerate: true }], 1 / 60);
      assert.ok(
        (contact(car, obstacle)?.depth || 0) < 0.001,
        `${kind}: car penetrated`,
      );
      assert.ok(car.z < obstacle.z, 'must not pass through obstacle');
    }
    assert.ok(Math.abs(car.speed) < 0.1);
    assert.equal(obstacle.height, kind === 'building' ? 10 : 3 * 0.85);
  }
});
test('lap gates reject shortcuts and reverse finish crossings; multiple laps really take multiple circuits', () => {
  const race = createRace({ count: 1, laps: 3 });
  race.phase = 'racing';
  advance(race, { accelerate: true }, 30);
  assert.equal(race.phase, 'racing');
  assert.ok(race.drivers[0].distance > race.lapLength);
  advance(race, { accelerate: true }, 55);
  assert.equal(race.phase, 'finished');
  assert.equal(race.drivers[0].distance, race.length);
  const free = createRace({ count: 1, assist: false }),
    car = free.drivers[0],
    track = getTrack(free.map);
  free.phase = 'racing';
  for (const s of [track.length * 0.6, track.length - 1, track.length + 1]) {
    const p = track.point(START + s);
    Object.assign(car, {
      x: p.x,
      z: p.z,
      heading: p.heading,
      routeDistance: s,
      vx: 0,
      vz: 0,
    });
    tickRace(free, [{}], 1 / 60);
  }
  assert.equal(car.nextGate, 1);
  assert.equal(car.finishTime, null);
  assert.ok(car.distance <= free.gateSpacing);
});
test('free steering can complete a real route without assistance or a recovery teleport', () => {
  const race = createRace({ count: 1, assist: false }),
    car = race.drivers[0],
    track = getTrack(race.map);
  race.phase = 'racing';
  for (let i = 0; i < 120 * 70 && race.phase !== 'finished'; i++) {
    const target = track.point(START + car.routeDistance + 12);
    const desired = Math.atan2(target.x - car.x, target.z - car.z);
    const delta = Math.atan2(
      Math.sin(desired - car.heading),
      Math.cos(desired - car.heading),
    );
    tickRace(
      race,
      [{ accelerate: true, left: delta > 0.035, right: delta < -0.035 }],
      1 / 120,
    );
  }
  assert.equal(race.phase, 'finished');
  assert.equal(car.recoveries, 0);
});
test('new options validate old and corrupted saves without changing beginner defaults', () => {
  assert.equal(settingsFrom({ assist: 'false' }).assist, true);
  assert.equal(settingsFrom({ assist: false }).assist, false);
  assert.equal(settingsFrom({ laps: 100 }).laps, 5);
  assert.equal(settingsFrom({ laps: 0 }).laps, 1);
  assert.equal(settingsFrom({ laps: '3', difficulty: 'hard' }).laps, 1);
  assert.equal(settingsFrom({ difficulty: 'real' }).difficulty, 'real');
  assert.equal(createRace({ count: 12, players: 2 }).rivals.length, 10);
});

test('a finisher never parks on top of a free driver already occupying its parking spot', () => {
  const race = createRace({
    assist: false,
    players: 2,
    count: 3,
    difficulty: 'real',
  });
  race.phase = 'racing';
  const waiting = race.drivers[1],
    spot = getTrack(race.map).point(START + 14, -12.5);
  Object.assign(waiting, { x: spot.x, z: spot.z, heading: spot.heading });
  advance(race, [{}, {}], 35);
  assert.notEqual(race.rivals[0].finishTime, null);
  assert.equal(contact(waiting, race.rivals[0]), null);
  assert.ok(Math.hypot(waiting.x - spot.x, waiting.z - spot.z) < 0.01);
});

test('the fountain rim collider follows the visible circular edge on both maps', () => {
  for (const map of ['park', 'city']) {
    const race = createRace({ map, count: 1, assist: false });
    race.phase = 'racing';
    const [x, z] = getTrack(map).parkCenter,
      car = race.drivers[0];
    Object.assign(car, { x, z: z - 16, heading: 0, speed: 25, vx: 0, vz: 25 });
    advance(race, { accelerate: true }, 3);
    assert.ok(
      car.z <= z - 12.15 && car.z >= z - 12.3,
      `rim contact at ${car.z - z}`,
    );
    assert.ok(Math.abs(car.speed) < 0.01);
  }
});
