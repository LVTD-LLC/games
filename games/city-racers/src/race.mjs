export const COLORS = ['#e87351', '#6c91b6', '#80a080', '#d9b14d', '#a68ac4'];
export const MAX_SPEED = 25;
export const ROAD_HALF_WIDTH = 9;
const STRAIGHT = 160;
const RADIUS = 45;
export const TRACK_LENGTH = STRAIGHT * 2 + 2 * Math.PI * RADIUS;
export const FINISH_DISTANCE = TRACK_LENGTH;
export const START = 22;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Stadium-shaped city block. Distance is in metres, with continuous tangent at joins.
export function trackPoint(distance, offset = 0) {
  let s = ((distance % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  let x, z, tx, tz;
  if (s < STRAIGHT) {
    x = -RADIUS;
    z = STRAIGHT / 2 - s;
    tx = 0;
    tz = -1;
  } else if ((s -= STRAIGHT) < Math.PI * RADIUS) {
    const a = Math.PI + s / RADIUS;
    x = Math.cos(a) * RADIUS;
    z = -STRAIGHT / 2 + Math.sin(a) * RADIUS;
    tx = -Math.sin(a);
    tz = Math.cos(a);
  } else if ((s -= Math.PI * RADIUS) < STRAIGHT) {
    x = RADIUS;
    z = -STRAIGHT / 2 + s;
    tx = 0;
    tz = 1;
  } else {
    const a = (s - STRAIGHT) / RADIUS;
    x = Math.cos(a) * RADIUS;
    z = STRAIGHT / 2 + Math.sin(a) * RADIUS;
    tx = -Math.sin(a);
    tz = Math.cos(a);
  }
  return {
    x: x - tz * offset,
    z: z + tx * offset,
    tx,
    tz,
    heading: Math.atan2(tx, tz),
  };
}

export function settingsFrom(value) {
  return {
    count: Number.isInteger(value?.count) ? clamp(value.count, 1, 6) : 3,
    color: COLORS.includes(value?.color) ? value.color : COLORS[0],
  };
}

export function createRace(settings) {
  const { count } = settingsFrom(settings);
  return {
    phase: 'ready',
    countdown: 3,
    elapsed: 0,
    speed: 0,
    distance: 0,
    offset: 0,
    steer: 0,
    place: null,
    rivals: Array.from({ length: count - 1 }, (_, i) => ({
      distance: 5 + Math.floor(i / 2) * 6,
      offset: (i % 2 ? -1 : 1) * (3.4 + Math.floor(i / 2) * 0.7),
      speed: 14.5 + i * 0.8,
    })),
  };
}

export function stepRace(race, input, delta) {
  // Clamp large frame gaps; focus loss is handled by pausing at the UI boundary.
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.05);
  if (race.phase === 'countdown') {
    race.countdown = Math.max(0, race.countdown - dt);
    if (race.countdown === 0) race.phase = 'racing';
    return;
  }
  if (race.phase !== 'racing') return;
  race.elapsed += dt;
  const acceleration = input.brake ? -30 : input.accelerate ? 12 : -5;
  race.speed = clamp(race.speed + acceleration * dt, 0, MAX_SPEED);
  const turn = Number(!!input.right) - Number(!!input.left);
  race.steer += (turn - race.steer) * Math.min(1, dt * 9);
  // Heading follows the road. Steering moves across it; soft edges never stop the car.
  race.offset = clamp(
    race.offset + race.steer * 7 * (race.speed / MAX_SPEED) * dt,
    -6.6,
    6.6,
  );
  race.distance = Math.min(FINISH_DISTANCE, race.distance + race.speed * dt);
  for (const rival of race.rivals) {
    // Friends wait nearby while a child learns the keys, then give them room to pass.
    const ahead = rival.distance - race.distance;
    const pace = ahead > 30 ? Math.min(3, race.speed * 0.65) : rival.speed;
    rival.distance = Math.min(FINISH_DISTANCE, rival.distance + pace * dt);
    if (
      Math.abs(rival.distance - race.distance) < 7 &&
      Math.abs(rival.offset - race.offset) < 2.8
    ) {
      const target = race.offset >= 0 ? -4.5 : 4.5;
      rival.offset += (target - rival.offset) * Math.min(1, dt * 3);
    }
  }
  if (race.distance === FINISH_DISTANCE) {
    race.place =
      1 + race.rivals.filter((r) => r.distance >= FINISH_DISTANCE).length;
    race.phase = 'finished';
    race.speed = 0;
  }
}

export function tickRace(race, input, delta) {
  // Preserve wall-clock pace on slow frames, while bounding long stalls.
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.25);
  for (let remaining = dt; remaining > 0; remaining -= 1 / 60) {
    stepRace(race, input, Math.min(remaining, 1 / 60));
  }
}
