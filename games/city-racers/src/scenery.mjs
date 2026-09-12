import { getTrack } from './tracks.mjs';
const cache = new Map();
// Shared descriptors keep the rendered city and its solid collision shapes aligned.
export function getScenery(map) {
  const track = getTrack(map);
  if (cache.has(track.id)) return cache.get(track.id);
  const buildings = [],
    trees = [],
    lamps = [];
  function building(x, z) {
    const index = buildings.length;
    buildings.push({
      x,
      z,
      index,
      w: 13 + (index % 3) * 3,
      d: 16,
      h: 10 + (index % 4) * 4,
    });
  }
  if (track.id === 'park') {
    for (const side of [-1, 1])
      for (let z = -145; z <= 145; z += 30) {
        building(side * 77, z);
        if (z % 2) building(side * 113, z + 10);
      }
    for (const z of [-155, 155])
      for (const x of [-38, -9, 20, 49]) building(x, z);
  } else {
    const road = Array.from({ length: Math.ceil(track.length / 2) }, (_, i) =>
      track.point(i * 2),
    );
    for (let x = -185; x <= 230; x += 32)
      for (let z = -205; z <= 205; z += 32) {
        if (
          road.some((p) => Math.hypot(x - p.x, z - p.z) < 34) ||
          Math.hypot(x - 20, z - 10) < 35
        )
          continue;
        building(x, z);
      }
  }
  for (let s = 12; s < track.length; s += 26) {
    const p = track.point(s, -17.5),
      q = track.point(s, 17.5);
    trees.push(
      { x: p.x, z: p.z, size: 0.85 + (Math.floor(s) % 3) * 0.12 },
      { x: q.x, z: q.z, size: 1 },
    );
  }
  if (track.id === 'park')
    for (const x of [-16, 16])
      for (const z of [-65, -35, 35, 65]) trees.push({ x, z, size: 1.2 });
  for (let s = 45; s < track.length; s += 70) lamps.push(track.point(s, -11.7));
  const p = track.point(90, -22);
  const billboard = {
    x: p.x,
    z: p.z,
    heading: p.heading + Math.PI,
    w: 17,
    h: 7,
  };
  const obstacles = [
    ...buildings.map((b) => ({
      kind: 'building',
      x: b.x,
      z: b.z,
      halfW: b.w / 2,
      halfL: b.d / 2,
      heading: 0,
      height: b.h,
    })),
    ...trees.map((t) => ({
      kind: 'tree',
      x: t.x,
      z: t.z,
      halfW: 0.35 * t.size,
      halfL: 0.35 * t.size,
      heading: 0,
      height: 3 * t.size,
    })),
    ...lamps.map((l) => ({
      kind: 'lamp',
      x: l.x,
      z: l.z,
      halfW: 0.11,
      halfL: 0.11,
      heading: 0,
      height: 7.4,
    })),
  ];
  // Fountain footprint and billboard posts are solid too; no invisible scenery walls.
  const [x, z] = track.parkCenter;
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    obstacles.push({
      kind: 'fountain',
      x: x + 9.5 * Math.cos(a),
      z: z + 9.5 * Math.sin(a),
      halfW: 1.35,
      halfL: 0.5,
      heading: Math.PI / 2 - a,
      height: 0.75,
    });
  }
  for (const side of [-1, 1])
    obstacles.push({
      kind: 'billboard',
      x: p.x + Math.cos(billboard.heading) * side * 6,
      z: p.z - Math.sin(billboard.heading) * side * 6,
      halfW: 0.3,
      halfL: 0.3,
      heading: billboard.heading,
      height: 9,
    });
  const result = { buildings, trees, lamps, billboard, obstacles };
  cache.set(track.id, result);
  return result;
}
