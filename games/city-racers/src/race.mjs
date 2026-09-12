import { getTrack, projectOnTrack } from './tracks.mjs';
import { getScenery } from './scenery.mjs';
import { solveContacts, contact } from './collisions.mjs';
export { TRACKS, getTrack } from './tracks.mjs';
export const COLORS = ['#e87351', '#6c91b6', '#80a080', '#d9b14d', '#a68ac4'];
export const MAX_SPEED = 25,
  MAX_CARS = 12,
  MAX_LAPS = 5,
  ROAD_HALF_WIDTH = 9,
  START = 22;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const wrapDelta = (n, length) =>
  ((((n + length / 2) % length) + length) % length) - length / 2;
export function settingsFrom(value) {
  const players = value?.players === 2 ? 2 : 1;
  const color = COLORS.includes(value?.color) ? value.color : COLORS[0];
  const color2 =
    COLORS.includes(value?.color2) && value.color2 !== color
      ? value.color2
      : COLORS.find((c) => c !== color);
  return {
    players,
    count: Number.isInteger(value?.count)
      ? clamp(value.count, players, MAX_CARS)
      : 3,
    color,
    color2,
    map: getTrack(value?.map).id,
    assist: value?.assist !== false,
    difficulty: value?.difficulty === 'real' ? 'real' : 'easy',
    laps: Number.isInteger(value?.laps) ? clamp(value.laps, 1, MAX_LAPS) : 1,
  };
}
export function createRace(value) {
  const settings = settingsFrom(value),
    track = getTrack(settings.map);
  const gatesPerLap = Math.ceil(track.length / 30);
  function car(index, human) {
    const distance = human
      ? 0
      : 6 + Math.floor((index - settings.players) / 2) * 7;
    const offset = human
      ? settings.players === 2
        ? index
          ? 2.7
          : -2.7
        : 0
      : ((index - settings.players) % 2 ? -1 : 1) * 3.7;
    const p = track.point(START + distance, offset);
    return {
      id: index,
      human,
      guided: !human || settings.assist,
      x: p.x,
      z: p.z,
      heading: p.heading,
      vx: 0,
      vz: 0,
      speed: 0,
      distance,
      routeDistance: distance,
      offset,
      steer: 0,
      finishTime: null,
      nextGate: Math.floor(distance / (track.length / gatesPerLap)) + 1,
      reverseHold: 0,
      recoveries: 0,
    };
  }
  return {
    phase: 'ready',
    countdown: 3,
    elapsed: 0,
    map: settings.map,
    assist: settings.assist,
    difficulty: settings.difficulty,
    laps: settings.laps,
    length: track.length * settings.laps,
    lapLength: track.length,
    gateSpacing: track.length / gatesPerLap,
    totalGates: gatesPerLap * settings.laps,
    drivers: Array.from({ length: settings.players }, (_, i) => car(i, true)),
    rivals: Array.from({ length: settings.count - settings.players }, (_, i) =>
      car(i + settings.players, false),
    ),
  };
}
function guidedMove(car, input, dt, race, track, targetSpeed) {
  const acceleration = input.brake ? -30 : input.accelerate ? 12 : -5;
  car.speed = clamp(car.speed + acceleration * dt, 0, targetSpeed ?? MAX_SPEED);
  const turn = Number(!!input.right) - Number(!!input.left);
  car.steer += (turn - car.steer) * Math.min(1, dt * 9);
  car.offset = clamp(
    car.offset + car.steer * 7 * (car.speed / MAX_SPEED) * dt,
    -6.6,
    6.6,
  );
  car.routeDistance += car.speed * dt;
  const p = track.point(START + car.routeDistance, car.offset);
  car.vx = (p.x - car.x) / dt;
  car.vz = (p.z - car.z) / dt;
  car.x = p.x;
  car.z = p.z;
  car.heading = p.heading;
}
function freeMove(car, input, dt) {
  const forwardX = Math.sin(car.heading),
    forwardZ = Math.cos(car.heading);
  let speed = car.vx * forwardX + car.vz * forwardZ;
  if (input.brake) {
    if (speed > 0.15) {
      speed = Math.max(0, speed - 30 * dt);
      car.reverseHold = 0;
    } else if (!input.accelerate) {
      car.reverseHold += dt;
      speed = car.reverseHold > 0.45 ? Math.max(-8, speed - 10 * dt) : 0;
    } else speed = 0;
  } else {
    car.reverseHold = 0;
    speed = input.accelerate
      ? Math.min(MAX_SPEED, speed + 12 * dt)
      : Math.sign(speed) * Math.max(0, Math.abs(speed) - 5 * dt);
  }
  const turn = Number(!!input.right) - Number(!!input.left);
  car.steer += (turn - car.steer) * Math.min(1, dt * 9);
  car.heading -=
    ((((car.steer * speed) / 2.7) * Math.tan(0.58)) /
      (1 + Math.abs(speed) * 0.07)) *
    dt;
  const lateral = (car.vx * forwardZ - car.vz * forwardX) * Math.exp(-10 * dt);
  const tx = Math.sin(car.heading),
    tz = Math.cos(car.heading);
  car.vx = tx * speed + tz * lateral;
  car.vz = tz * speed - tx * lateral;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.speed = speed;
}
function constrain(car, track) {
  if (car.guided) {
    const p = projectOnTrack(track, car.x, car.z, START + car.routeDistance);
    car.routeDistance = p.s - START;
    car.offset = clamp(p.offset, -6.6, 6.6);
    const q = track.point(p.s, car.offset);
    car.x = q.x;
    car.z = q.z;
    car.heading = q.heading;
  } else {
    // A generous physical world boundary prevents driving beyond the city ground.
    const x = clamp(car.x, -480, 480),
      z = clamp(car.z, -480, 480);
    if (x !== car.x) car.vx = 0;
    if (z !== car.z) car.vz = 0;
    car.x = x;
    car.z = z;
  }
}
function progress(car, before, race, track) {
  const gateS = START + car.nextGate * race.gateSpacing,
    gate = track.point(gateS);
  const previous =
    (before.x - gate.x) * gate.tx + (before.z - gate.z) * gate.tz;
  const current = (car.x - gate.x) * gate.tx + (car.z - gate.z) * gate.tz;
  const lateral = (car.x - gate.x) * -gate.tz + (car.z - gate.z) * gate.tx;
  if (previous <= 0 && current >= 0 && Math.abs(lateral) <= 10.5)
    car.nextGate++;
  const p = projectOnTrack(
    track,
    car.x,
    car.z,
    car.guided ? START + car.routeDistance : undefined,
  );
  if (!car.guided) {
    car.routeDistance += wrapDelta(
      p.s - START - car.routeDistance,
      track.length,
    );
    car.offset = p.offset;
  }
  const lastGate = (car.nextGate - 1) * race.gateSpacing;
  const along = wrapDelta(p.s - START - lastGate, track.length);
  if (p.away <= 10.5)
    car.distance = clamp(
      lastGate + clamp(along, 0, race.gateSpacing),
      0,
      race.length,
    );
  if (car.nextGate > race.totalGates) {
    car.distance = race.length;
    car.finishTime = race.elapsed;
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    car.steer = 0;
    // Park outside the racing lanes so finishers cannot block another driver's lap.
    const others = [...race.drivers, ...race.rivals].filter(
      (other) => other !== car,
    );
    const obstacles = getScenery(race.map).obstacles;
    for (
      let slot = Math.floor(car.id / 2);
      slot < Math.floor(car.id / 2) + 24;
      slot++
    ) {
      const parking = track.point(
        START + 8 + slot * 6,
        car.id % 2 ? 12.5 : -12.5,
      );
      const candidate = {
        ...car,
        x: parking.x,
        z: parking.z,
        heading: parking.heading,
      };
      if ([...others, ...obstacles].some((other) => contact(candidate, other)))
        continue;
      car.x = parking.x;
      car.z = parking.z;
      car.heading = parking.heading;
      break;
    }
  }
}
export function recoverDriver(race, index) {
  const car = race.drivers[index];
  if (
    !car ||
    car.finishTime !== null ||
    !['racing', 'countdown'].includes(race.phase)
  )
    return false;
  const track = getTrack(race.map),
    cars = [...race.drivers, ...race.rivals];
  // Return to the last earned gate, not the nearest shortcut. Find a clear slot.
  for (let back = 0; back <= 24; back += 6)
    for (const offset of [0, -5, 5]) {
      const s = (car.nextGate - 1) * race.gateSpacing - back;
      const p = track.point(START + s, offset),
        candidate = { ...car, x: p.x, z: p.z, heading: p.heading };
      if (cars.some((other) => other !== car && contact(candidate, other)))
        continue;
      Object.assign(car, {
        x: p.x,
        z: p.z,
        heading: p.heading,
        offset,
        routeDistance: s,
        speed: 0,
        vx: 0,
        vz: 0,
        steer: 0,
        reverseHold: 0,
      });
      car.recoveries++;
      return true;
    }
  return false;
}
export function stepRace(race, inputs, delta) {
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.05);
  if (!dt) return;
  if (race.phase === 'countdown') {
    race.countdown = Math.max(0, race.countdown - dt);
    if (race.countdown === 0) race.phase = 'racing';
    return;
  }
  if (race.phase !== 'racing') return;
  race.elapsed += dt;
  const track = getTrack(race.map),
    cars = [...race.drivers, ...race.rivals],
    before = cars.map((c) => ({ x: c.x, z: c.z }));
  const learners = race.drivers.filter((c) => c.finishTime === null);
  const learner = learners.reduce(
    (a, b) => (!a || b.distance < a.distance ? b : a),
    null,
  );
  for (const car of cars) {
    if (car.finishTime !== null) continue;
    if (car.human) {
      if (car.guided) guidedMove(car, inputs[car.id] || {}, dt, race, track);
      else freeMove(car, inputs[car.id] || {}, dt);
    } else {
      const ahead = learner ? car.distance - learner.distance : 0;
      const targetSpeed =
        race.difficulty === 'real'
          ? MAX_SPEED
          : ahead > 30
            ? Math.min(3, Math.abs(learner.speed) * 0.65)
            : 14.5 + (car.id % 5) * 0.8;
      // Pick a passing lane before contact; bumpers remain solid if paths meet.
      const nearby = cars.find(
        (other) =>
          other !== car &&
          other.finishTime === null &&
          Math.abs(
            wrapDelta(other.routeDistance - car.routeDistance, track.length),
          ) < 10 &&
          Math.abs(other.offset - car.offset) < 2.7,
      );
      const lane = nearby ? (nearby.offset >= 0 ? -4.5 : 4.5) : car.offset;
      const turn =
        Math.abs(lane - car.offset) > 0.2 ? Math.sign(lane - car.offset) : 0;
      guidedMove(
        car,
        { accelerate: true, left: turn < 0, right: turn > 0 },
        dt,
        race,
        track,
        targetSpeed,
      );
    }
  }
  const intended = cars.map((car) => ({
    vx: car.vx,
    vz: car.vz,
    speed: car.speed,
  }));
  solveContacts(cars, getScenery(race.map).obstacles, (car) =>
    constrain(car, track),
  );
  cars.forEach((car, i) => {
    if (car.finishTime !== null) return;
    // Keep the impulse for the next step; a pushed car starts rolling rather than overlapping.
    car.speed = clamp(
      car.guided
        ? intended[i].speed +
            (car.vx - intended[i].vx) * Math.sin(car.heading) +
            (car.vz - intended[i].vz) * Math.cos(car.heading)
        : car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading),
      car.guided ? 0 : -8,
      MAX_SPEED,
    );
    if (Math.abs(car.speed) < 0.00001) car.speed = 0;
    progress(car, before[i], race, track);
  });
  if (race.drivers.every((car) => car.finishTime !== null))
    race.phase = 'finished';
}
export function tickRace(race, inputs, delta) {
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.25);
  for (let remaining = dt; remaining > 0; remaining -= 1 / 120)
    stepRace(race, inputs, Math.min(remaining, 1 / 120));
}
