import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, START, TRACK_LENGTH, trackPoint } from './race.mjs';

const UP = new THREE.Vector3(0, 1, 0);

export async function createWorld(container, settings) {
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    powerPreference: 'high-performance',
    outputBufferType: THREE.UnsignedByteType,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  await renderer.init();
  renderer.setClearColor('#cbdde0');
  container.append(renderer.domElement);
  // Diagnostic only: never put rendering implementation details in the child's UI.
  container.dataset.renderer = renderer.backend.isWebGPUBackend
    ? 'webgpu'
    : 'webgl2';
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#cbdde0', 160, 410);
  scene.add(new THREE.HemisphereLight('#fff9e8', '#8b9877', 2.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.5);
  sun.position.set(-90, 150, 70);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 700);
  const materials = new Map();
  const batches = new Map();
  const material = (color) => {
    if (!materials.has(color))
      materials.set(color, new THREE.MeshLambertMaterial({ color }));
    return materials.get(color);
  };
  function staticMesh(geometry, color, x, y, z, rotation = 0) {
    geometry.rotateY(rotation);
    geometry.translate(x, y, z);
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color).push(geometry);
  }
  function box(color, x, y, z, w, h, d, rotation = 0) {
    staticMesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, rotation);
  }
  function ribbon(inner, outer, color, height) {
    const vertices = [],
      indices = [];
    for (let i = 0; i <= 320; i++) {
      for (const offset of [inner, outer]) {
        const p = trackPoint((i / 320) * TRACK_LENGTH, offset);
        vertices.push(p.x, height, p.z);
      }
      if (i < 320) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const roadMaterial = material(color).clone();
    roadMaterial.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, roadMaterial);
    scene.add(mesh);
  }
  box('#b6c7a1', 0, -0.7, 0, 1100, 1, 1100);
  ribbon(-14, 14, '#d9d8c6', 0.02);
  ribbon(-9.5, 9.5, '#f2eedc', 0.06);
  ribbon(-9, 9, '#616f73', 0.09);
  ribbon(-8.5, -8.3, '#ece8d6', 0.105);
  ribbon(8.3, 8.5, '#ece8d6', 0.105);
  for (let s = 0; s < TRACK_LENGTH; s += 11) {
    const p = trackPoint(s);
    box('#e9e4c9', p.x, 0.12, p.z, 0.22, 0.03, 4.2, p.heading);
  }
  // Quiet pedestrian crossings, a park and low-rise blocks make this a city road.
  for (const distance of [100, 380]) {
    for (let lane = -7; lane <= 7; lane += 2) {
      const p = trackPoint(distance, lane);
      box('#eee9d9', p.x, 0.125, p.z, 1.2, 0.04, 5, p.heading);
    }
  }
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 12; col++) {
      const p = trackPoint(START + row * 0.8, -8.25 + col * 1.5);
      box(
        (row + col) % 2 ? '#eee9d9' : '#465357',
        p.x,
        0.13,
        p.z,
        1.5,
        0.05,
        0.8,
        p.heading,
      );
    }
  const palette = ['#d8bb99', '#d2a58e', '#dfd7be', '#9fb6b0', '#b3bcc5'];
  function building(x, z, index) {
    const h = 10 + (index % 4) * 4;
    const w = 13 + (index % 3) * 3;
    const d = 16;
    box(palette[index % palette.length], x, h / 2, z, w, h, d);
    box('#ede5d1', x, h + 0.35, z, w + 1, 0.7, d + 1);
    box('#819494', x, h + 0.75, z, w - 2, 0.3, d - 2);
    for (let floor = 0; floor < Math.floor(h / 4); floor++) {
      for (const side of [-1, 1])
        for (const col of [-1, 0, 1]) {
          box(
            '#718c91',
            x + col * 3.5,
            2.6 + floor * 4,
            z + side * (d / 2 + 0.03),
            1.9,
            2,
            0.08,
          );
          box(
            '#718c91',
            x + side * (w / 2 + 0.03),
            2.6 + floor * 4,
            z + col * 4,
            0.08,
            2,
            2,
          );
        }
    }
    box('#5f7777', x, 1.8, z + d / 2 + 0.05, 2.4, 3.6, 0.12);
    if (index % 3 === 0)
      box('#bb795f', x, 4, z + d / 2 + 1.1, w - 2, 0.35, 2.4);
  }
  let index = 0;
  for (const side of [-1, 1])
    for (let z = -145; z <= 145; z += 30) {
      building(side * 77, z, index++);
      if (z % 2) building(side * 113, z + 10, index++);
    }
  for (const z of [-155, 155])
    for (const x of [-38, -9, 20, 49]) building(x, z, index++);
  // Interior park paths and fountain.
  box('#d9d4b9', 0, 0.015, 0, 5, 0.08, 170);
  box('#d9d4b9', 0, 0.02, 0, 52, 0.08, 5);
  staticMesh(new THREE.CylinderGeometry(9, 10, 0.7, 24), '#eee5d0', 0, 0.4, 0);
  staticMesh(new THREE.CylinderGeometry(8, 8, 0.1, 24), '#88b7c2', 0, 0.8, 0);
  staticMesh(new THREE.CylinderGeometry(2, 2.8, 2, 12), '#eee5d0', 0, 1.5, 0);
  function tree(x, z, size = 1) {
    box('#8f8066', x, 1.5 * size, z, 0.7 * size, 3 * size, 0.7 * size);
    staticMesh(
      new THREE.IcosahedronGeometry(3.2 * size, 1),
      '#7d9c79',
      x,
      5 * size,
      z,
    );
  }
  for (let s = 12; s < TRACK_LENGTH; s += 26) {
    const p = trackPoint(s, -17.5);
    tree(p.x, p.z, 0.85 + (Math.floor(s) % 3) * 0.12);
    const q = trackPoint(s, 17.5);
    tree(q.x, q.z);
  }
  for (const x of [-16, 16])
    for (const z of [-65, -35, 35, 65]) tree(x, z, 1.2);
  for (let s = 45; s < TRACK_LENGTH; s += 70) {
    const p = trackPoint(s, -11.7);
    box('#778581', p.x, 3.7, p.z, 0.22, 7.4, 0.22);
    box('#f2ead6', p.x, 7.5, p.z, 1.2, 0.35, 1.2);
  }
  // Merge static geometry by material: the city costs dozens, not hundreds, of draw calls.
  for (const [color, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    scene.add(new THREE.Mesh(merged, material(color)));
    geometries.forEach((g) => g.dispose());
  }

  function makeCar(color) {
    const car = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color });
    function part(w, h, d, x, y, z, mat) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      car.add(mesh);
      return mesh;
    }
    part(2.1, 0.5, 4.2, 0, 0.72, 0, body);
    part(1.95, 0.16, 3.95, 0, 1.02, 0, body);
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
    car.add(new THREE.Mesh(cabinGeometry, material('#536d78')));
    part(1.72, 0.1, 1.06, 0, 1.61, -0.3, body);
    part(1.82, 0.13, 0.35, 0, 1.35, -1.82, body);
    for (const x of [-0.65, 0.65])
      part(0.12, 0.28, 0.14, x, 1.17, -1.82, material('#354346'));
    part(0.25, 0.025, 0.95, 0, 1.115, 1.47, material('#f5ebd3'));
    for (const x of [-0.72, 0.72]) {
      part(0.42, 0.2, 0.08, x, 0.86, 2.13, material('#fff0bf'));
      part(0.42, 0.17, 0.08, x, 0.85, -2.13, material('#ac5948'));
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
    car.add(shadow);
    car.userData.body = body;
    scene.add(car);
    return car;
  }
  const player = makeCar(settings.color);
  const rivals = Array.from({ length: 5 }, (_, i) =>
    makeCar(COLORS[(i + 1) % COLORS.length]),
  );
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();
  let initialized = false;
  let lastStillFrame = null;
  let slowFrames = 0;

  function place(car, distance, offset, steer = 0) {
    const p = trackPoint(START + distance, offset);
    car.position.set(p.x, 0, p.z);
    car.rotation.set(0, p.heading - steer * 0.12, -steer * 0.025);
    return p;
  }
  function draw(race, settings, dt, garage) {
    const still = garage || ['paused', 'finished'].includes(race.phase);
    const signature = `${race.phase}:${settings.count}:${settings.color}`;
    if (still && lastStillFrame === signature) return;
    lastStillFrame = still ? signature : null;
    if (!still && dt > 0.045) slowFrames++;
    else slowFrames = 0;
    if (slowFrames >= 4 && renderer.getPixelRatio() > 0.55) {
      renderer.setPixelRatio(Math.max(0.5, renderer.getPixelRatio() * 0.75));
      slowFrames = 0;
    }
    player.userData.body.color.set(settings.color);
    const p = place(player, race.distance, race.offset, race.steer);
    rivals.forEach((car, i) => {
      car.visible = i < race.rivals.length;
      if (car.visible)
        place(car, race.rivals[i].distance, race.rivals[i].offset);
    });
    if (garage) {
      desired.set(p.x + 15, 11, p.z - 17);
      target.set(p.x, 1, p.z + (innerWidth > 760 ? -5 : 0));
    } else {
      desired.set(p.x - p.tx * 15, 10, p.z - p.tz * 15);
      const ahead = trackPoint(START + race.distance + 15, race.offset * 0.5);
      target.set(ahead.x, 0.8, ahead.z);
    }
    const smooth = initialized ? 1 - Math.exp(-dt * 7) : 1;
    camera.position.lerp(desired, smooth);
    look.lerp(target, smooth);
    camera.up.copy(UP);
    camera.lookAt(look);
    initialized = true;
    renderer.render(scene, camera);
  }
  function resize() {
    initialized = false;
    lastStillFrame = null;
    const { width, height } = container.getBoundingClientRect();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  return {
    draw,
    renderer,
    resetCamera: () => {
      initialized = false;
      lastStillFrame = null;
    },
  };
}
