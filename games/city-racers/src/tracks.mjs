const mod = (n, length) => ((n % length) + length) % length;
const pose = (x, z, tx, tz, offset) => ({
  x: x - tz * offset,
  z: z + tx * offset,
  tx,
  tz,
  heading: Math.atan2(tx, tz),
});
const STRAIGHT = 160,
  RADIUS = 45;
const parkLength = STRAIGHT * 2 + 2 * Math.PI * RADIUS;
function parkPoint(distance, offset = 0) {
  let s = mod(distance, parkLength);
  if (s < STRAIGHT) return pose(-RADIUS, STRAIGHT / 2 - s, 0, -1, offset);
  s -= STRAIGHT;
  if (s < Math.PI * RADIUS) {
    const a = Math.PI + s / RADIUS;
    return pose(
      Math.cos(a) * RADIUS,
      -STRAIGHT / 2 + Math.sin(a) * RADIUS,
      -Math.sin(a),
      Math.cos(a),
      offset,
    );
  }
  s -= Math.PI * RADIUS;
  if (s < STRAIGHT) return pose(RADIUS, -STRAIGHT / 2 + s, 0, 1, offset);
  const a = (s - STRAIGHT) / RADIUS;
  return pose(
    Math.cos(a) * RADIUS,
    STRAIGHT / 2 + Math.sin(a) * RADIUS,
    -Math.sin(a),
    Math.cos(a),
    offset,
  );
}

// Rounded, axis-aligned city blocks: signed quarter-circle turns keep the
// centerline and heading continuous, including the four concave (left) turns.
function roundedBlocks(points, radius) {
  const corners = points.map(([x, z], i) => {
    const before = points[mod(i - 1, points.length)],
      after = points[(i + 1) % points.length];
    const incomingLength = Math.hypot(x - before[0], z - before[1]);
    const outgoingLength = Math.hypot(after[0] - x, after[1] - z);
    const incoming = [
      (x - before[0]) / incomingLength,
      (z - before[1]) / incomingLength,
    ];
    const outgoing = [
      (after[0] - x) / outgoingLength,
      (after[1] - z) / outgoingLength,
    ];
    const entry = [x - incoming[0] * radius, z - incoming[1] * radius];
    const exit = [x + outgoing[0] * radius, z + outgoing[1] * radius];
    const center = [
      entry[0] + outgoing[0] * radius,
      entry[1] + outgoing[1] * radius,
    ];
    return {
      entry,
      exit,
      center,
      turn: Math.sign(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]),
    };
  });
  let length = 0;
  const segments = [];
  for (let i = 0; i < corners.length; i++) {
    const previous = corners[mod(i - 1, corners.length)],
      corner = corners[i];
    const dx = corner.entry[0] - previous.exit[0],
      dz = corner.entry[1] - previous.exit[1];
    const straightLength = Math.hypot(dx, dz);
    segments.push({
      start: length,
      length: straightLength,
      point: (s, offset) =>
        pose(
          previous.exit[0] + (dx * s) / straightLength,
          previous.exit[1] + (dz * s) / straightLength,
          dx / straightLength,
          dz / straightLength,
          offset,
        ),
    });
    length += straightLength;
    const angle = Math.atan2(
      corner.entry[1] - corner.center[1],
      corner.entry[0] - corner.center[0],
    );
    const arcLength = (Math.PI * radius) / 2;
    segments.push({
      start: length,
      length: arcLength,
      point: (s, offset) => {
        const a = angle + (corner.turn * s) / radius;
        return pose(
          corner.center[0] + radius * Math.cos(a),
          corner.center[1] + radius * Math.sin(a),
          -corner.turn * Math.sin(a),
          corner.turn * Math.cos(a),
          offset,
        );
      },
    });
    length += arcLength;
  }
  return {
    length,
    joins: segments.map((s) => s.start),
    point(distance, offset = 0) {
      const s = mod(distance, length);
      const segment =
        segments.find((segment) => s < segment.start + segment.length) ||
        segments.at(-1);
      return segment.point(s - segment.start, offset);
    },
  };
}
const city = roundedBlocks(
  [
    [-115, -130],
    [-25, -130],
    [-25, -35],
    [65, -35],
    [65, -130],
    [165, -130],
    [165, 130],
    [65, 130],
    [65, 60],
    [-25, 60],
    [-25, 130],
    [-115, 130],
  ],
  22,
);
export const TRACKS = {
  park: {
    id: 'park',
    name: 'Park loop',
    description: 'An easy first lap',
    length: parkLength,
    point: parkPoint,
    joins: [0, 160, 160 + Math.PI * 45, 320 + Math.PI * 45],
    parkCenter: [0, 0],
  },
  city: {
    id: 'city',
    name: 'City adventure',
    description: 'A longer lap · Left & right turns',
    ...city,
    parkCenter: [20, 10],
  },
};
export const getTrack = (id) =>
  Object.hasOwn(TRACKS, id) ? TRACKS[id] : TRACKS.park;

const projectionSamples = new Map();
export function projectOnTrack(track, x, z, hint) {
  let best = Infinity,
    distance = hint ?? 0;
  if (hint === undefined) {
    if (!projectionSamples.has(track.id))
      projectionSamples.set(
        track.id,
        Array.from({ length: Math.ceil(track.length / 3) }, (_, i) => ({
          s: i * 3,
          ...track.point(i * 3),
        })),
      );
    for (const p of projectionSamples.get(track.id)) {
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < best) {
        best = d;
        distance = p.s;
      }
    }
  } else {
    for (let ds = -12; ds <= 12; ds += 3) {
      const p = track.point(hint + ds),
        d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < best) {
        best = d;
        distance = hint + ds;
      }
    }
  }
  for (let i = 0; i < 5; i++) {
    const p = track.point(distance);
    distance += (x - p.x) * p.tx + (z - p.z) * p.tz;
  }
  const p = track.point(distance);
  return {
    ...p,
    s: distance,
    offset: (x - p.x) * -p.tz + (z - p.z) * p.tx,
    away: Math.hypot(x - p.x, z - p.z),
  };
}
