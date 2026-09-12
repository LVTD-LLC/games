// Planar oriented boxes fit the visible bumpers and wheels (2.38 × 4.34 m).
export const CAR_HALF_WIDTH = 1.19,
  CAR_HALF_LENGTH = 2.17;
export function contact(a, b) {
  const ax = { x: Math.cos(a.heading), z: -Math.sin(a.heading) },
    az = { x: Math.sin(a.heading), z: Math.cos(a.heading) };
  const bx = { x: Math.cos(b.heading), z: -Math.sin(b.heading) },
    bz = { x: Math.sin(b.heading), z: Math.cos(b.heading) };
  const dx = b.x - a.x,
    dz = b.z - a.z;
  let depth = Infinity,
    nx = 0,
    nz = 0;
  for (const n of [ax, az, bx, bz]) {
    const ra =
      (a.halfW ?? CAR_HALF_WIDTH) * Math.abs(ax.x * n.x + ax.z * n.z) +
      (a.halfL ?? CAR_HALF_LENGTH) * Math.abs(az.x * n.x + az.z * n.z);
    const rb =
      (b.halfW ?? CAR_HALF_WIDTH) * Math.abs(bx.x * n.x + bx.z * n.z) +
      (b.halfL ?? CAR_HALF_LENGTH) * Math.abs(bz.x * n.x + bz.z * n.z);
    const separation = dx * n.x + dz * n.z,
      overlap = ra + rb - Math.abs(separation);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const sign = separation < 0 ? -1 : 1;
      nx = n.x * sign;
      nz = n.z * sign;
    }
  }
  return { depth, nx, nz };
}
export function resolveContact(a, b, solid = false) {
  const hit = contact(a, b);
  if (!hit) return false;
  const am = a.finishTime !== null ? 0 : 1,
    bm = solid || b.finishTime !== null ? 0 : 1,
    total = am + bm;
  if (!total) return false;
  const { depth, nx, nz } = hit,
    correction = depth + 0.0001;
  a.x -= (nx * correction * am) / total;
  a.z -= (nz * correction * am) / total;
  if (bm) {
    b.x += (nx * correction * bm) / total;
    b.z += (nz * correction * bm) / total;
  }
  const closing = ((b.vx || 0) - a.vx) * nx + ((b.vz || 0) - a.vz) * nz;
  if (closing < 0) {
    // Low restitution, equal mass: bumpers touch and transfer momentum, no damage.
    const impulse = -closing / total;
    a.vx -= impulse * nx * am;
    a.vz -= impulse * nz * am;
    if (bm) {
      b.vx += impulse * nx * bm;
      b.vz += impulse * nz * bm;
    }
  }
  return true;
}
export function solveContacts(cars, obstacles, constrain = () => {}) {
  // Multiple positional passes resolve piles without allowing visible interpenetration.
  for (let pass = 0; pass < 12; pass++) {
    let touched = false;
    for (let i = 0; i < cars.length; i++)
      for (let j = i + 1; j < cars.length; j++) {
        if (
          Math.abs(cars[i].x - cars[j].x) > 5 ||
          Math.abs(cars[i].z - cars[j].z) > 5
        )
          continue;
        touched = resolveContact(cars[i], cars[j]) || touched;
      }
    for (const car of cars) {
      if (car.finishTime !== null) continue;
      for (const obstacle of obstacles) {
        if (
          Math.abs(car.x - obstacle.x) > obstacle.halfW + 4 ||
          Math.abs(car.z - obstacle.z) > obstacle.halfL + 4
        )
          continue;
        touched = resolveContact(car, obstacle, true) || touched;
      }
      constrain(car);
    }
    if (!touched) break;
  }
}
