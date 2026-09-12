import * as THREE from 'three/webgpu';
import { carTypeFrom } from './vehicles.mjs';

export function makeCar(color, material) {
  const car = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color });
  function part(parent, w, h, d, x, y, z, mat = body) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  // The same chassis, bumpers and wheels preserve one collision footprint.
  part(car, 2.1, 0.5, 4.2, 0, 0.72, 0);
  part(car, 1.95, 0.16, 3.95, 0, 1.02, 0);
  for (const x of [-0.72, 0.72]) {
    part(car, 0.42, 0.2, 0.08, x, 0.86, 2.13, material('#fff0bf'));
    part(car, 0.42, 0.17, 0.08, x, 0.85, -2.13, material('#ac5948'));
  }
  for (const x of [-1.04, 1.04])
    for (const z of [-1.25, 1.25]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.47, 0.47, 0.3, 12),
        material('#354346'),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.5, z);
      car.add(wheel);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.32, 12),
        material('#d7d9d0'),
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      car.add(hub);
    }
  const variants = {};
  function variant(id) {
    const group = new THREE.Group();
    group.name = id;
    variants[id] = group;
    car.add(group);
    return group;
  }
  const glass = material('#536d78'),
    trim = material('#354346'),
    stripe = material('#f5ebd3');
  const racer = variant('racer');
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.15, 1.08);
  cabinShape.lineTo(-0.8, 1.58);
  cabinShape.lineTo(0.2, 1.58);
  cabinShape.lineTo(0.95, 1.08);
  cabinShape.closePath();
  const cabinGeometry = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.65,
    bevelEnabled: false,
  });
  cabinGeometry.rotateY(-Math.PI / 2);
  cabinGeometry.translate(0.825, 0, 0);
  racer.add(new THREE.Mesh(cabinGeometry, glass));
  part(racer, 1.72, 0.1, 1.06, 0, 1.61, -0.3);
  part(racer, 1.82, 0.13, 0.35, 0, 1.35, -1.82);
  for (const x of [-0.65, 0.65])
    part(racer, 0.12, 0.28, 0.14, x, 1.17, -1.82, trim);
  part(racer, 0.25, 0.025, 0.95, 0, 1.115, 1.47, stripe);

  // Tall, boxy rally hatch: long cabin, rear window, roof rails and front spotlights.
  const rally = variant('rally');
  part(rally, 1.88, 0.3, 2.7, 0, 1.24, -0.4);
  part(rally, 1.7, 0.43, 2.42, 0, 1.61, -0.4, glass);
  part(rally, 1.88, 0.13, 2.7, 0, 1.89, -0.4);
  for (const x of [-0.9, 0.9]) {
    part(rally, 0.09, 0.5, 0.12, x, 1.63, -0.2);
    part(rally, 0.08, 0.12, 1.8, x * 0.8, 1.985, -0.45, trim);
    part(rally, 0.035, 0.16, 3.25, x * 1.17, 0.98, -0.1, stripe);
  }
  for (const x of [-0.35, 0.35])
    part(rally, 0.28, 0.25, 0.12, x, 1.075, 2.035, material('#fff0bf'));
  part(rally, 0.3, 0.025, 0.95, 0, 1.115, 1.45, stripe);

  // Forward cab and a visibly open, dark cargo bed distinguish the pickup.
  const pickup = variant('pickup');
  part(pickup, 1.9, 0.32, 1.65, 0, 1.24, 0.6);
  part(pickup, 1.73, 0.47, 1.48, 0, 1.63, 0.6, glass);
  part(pickup, 1.94, 0.12, 1.77, 0, 1.91, 0.6);
  for (const x of [-0.91, 0.91]) part(pickup, 0.12, 0.57, 0.16, x, 1.65, 0.08);
  part(pickup, 1.6, 0.025, 1.73, 0, 1.12, -1.075, trim);
  for (const x of [-0.94, 0.94])
    part(pickup, 0.18, 0.37, 1.88, x, 1.23, -1.055);
  part(pickup, 1.95, 0.37, 0.13, 0, 1.23, -1.975);
  part(pickup, 1.95, 0.37, 0.13, 0, 1.23, -0.14);
  for (const z of [-1.6, -1.1, -0.6])
    part(pickup, 1.45, 0.015, 0.04, 0, 1.141, z, material('#5a6b69'));
  part(pickup, 0.6, 0.12, 0.035, 0, 1.29, -2.05, trim);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({
      color: '#394e48',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.5, 2.65, 1);
  shadow.position.y = 0.17;
  shadow.userData.groundShadow = true;
  car.add(shadow);
  car.userData.body = body;
  car.userData.variants = variants;
  setCarType(car, 'racer');
  return car;
}
export function setCarType(car, value) {
  const type = carTypeFrom(value);
  if (car.userData.type === type) return;
  for (const [id, variant] of Object.entries(car.userData.variants))
    variant.visible = id === type;
  car.userData.type = type;
}
