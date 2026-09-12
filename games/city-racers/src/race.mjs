import { getTrack } from './tracks.mjs';
export { TRACKS, getTrack } from './tracks.mjs';
export const COLORS = ['#e87351', '#6c91b6', '#80a080', '#d9b14d', '#a68ac4'];
export const MAX_SPEED = 25;
export const ROAD_HALF_WIDTH = 9;
export const START = 22;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function settingsFrom(value) {
  const players = value?.players === 2 ? 2 : 1;
  const color = COLORS.includes(value?.color) ? value.color : COLORS[0];
  const color2 =
    COLORS.includes(value?.color2) && value.color2 !== color
      ? value.color2
      : COLORS.find((c) => c !== color);
  return {
    players,
    count: Number.isInteger(value?.count) ? clamp(value.count, players, 6) : 3,
    color,
    color2,
    map: getTrack(value?.map).id,
  };
}
export function createRace(settings) {
  const { count, players, map } = settingsFrom(settings);
  return {
    phase: 'ready',
    countdown: 3,
    elapsed: 0,
    map,
    length: getTrack(map).length,
    drivers: Array.from({ length: players }, (_, i) => ({
      speed: 0,
      distance: 0,
      offset: players === 2 ? (i ? 2.7 : -2.7) : 0,
      steer: 0,
      finishTime: null,
    })),
    rivals: Array.from({ length: count - players }, (_, i) => ({
      distance: 6 + Math.floor(i / 2) * 6,
      offset: (i % 2 ? -1 : 1) * (3.4 + Math.floor(i / 2) * 0.7),
      speed: 14.5 + i * 0.8,
    })),
  };
}
function drive(driver, input, dt, race) {
  if (driver.finishTime !== null) return;
  const acceleration = input.brake ? -30 : input.accelerate ? 12 : -5;
  driver.speed = clamp(driver.speed + acceleration * dt, 0, MAX_SPEED);
  const turn = Number(!!input.right) - Number(!!input.left);
  driver.steer += (turn - driver.steer) * Math.min(1, dt * 9);
  driver.offset = clamp(
    driver.offset + driver.steer * 7 * (driver.speed / MAX_SPEED) * dt,
    -6.6,
    6.6,
  );
  driver.distance = Math.min(race.length, driver.distance + driver.speed * dt);
  if (driver.distance === race.length) {
    driver.finishTime = race.elapsed;
    driver.speed = 0;
    driver.steer = 0;
  }
}
export function stepRace(race, inputs, delta) {
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.05);
  if (race.phase === 'countdown') {
    race.countdown = Math.max(0, race.countdown - dt);
    if (race.countdown === 0) race.phase = 'racing';
    return;
  }
  if (race.phase !== 'racing') return;
  race.elapsed += dt;
  race.drivers.forEach((driver, i) => drive(driver, inputs[i] || {}, dt, race));
  const active = race.drivers.filter((driver) => driver.finishTime === null);
  for (const rival of race.rivals) {
    // Stay near the rearmost learner. Neither friends nor human cars can block a driver.
    const learner = active.reduce(
      (last, driver) =>
        !last || driver.distance < last.distance ? driver : last,
      null,
    );
    const ahead = learner ? rival.distance - learner.distance : 0;
    const pace = ahead > 30 ? Math.min(3, learner.speed * 0.65) : rival.speed;
    rival.distance = Math.min(race.length, rival.distance + pace * dt);
    const nearby = race.drivers.find(
      (driver) =>
        Math.abs(rival.distance - driver.distance) < 7 &&
        Math.abs(rival.offset - driver.offset) < 2.8,
    );
    if (nearby)
      rival.offset +=
        ((nearby.offset >= 0 ? -4.5 : 4.5) - rival.offset) *
        Math.min(1, dt * 3);
  }
  // A parent finishing first never takes control away from a child still driving.
  if (race.drivers.every((driver) => driver.finishTime !== null))
    race.phase = 'finished';
}
export function tickRace(race, inputs, delta) {
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.25);
  for (let remaining = dt; remaining > 0; remaining -= 1 / 60)
    stepRace(race, inputs, Math.min(remaining, 1 / 60));
}
