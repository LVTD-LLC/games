import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, START, getTrack } from './race.mjs';

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
  const cameras = [0, 1].map(
    () => new THREE.PerspectiveCamera(48, 1, 0.1, 700),
  );
  // Offscreen views are composited into one canvas. This avoids backend-specific
  // scissor/clear behavior and shares the scene and GPU resources between players.
  const viewTargets = [0, 1].map(() => new THREE.RenderTarget(1, 1));
  const splitScene = new THREE.Scene();
  const splitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  splitCamera.position.z = 1;
  viewTargets.forEach((target, i) => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1),
      new THREE.MeshBasicMaterial({
        map: target.texture,
        depthTest: false,
        depthWrite: false,
      }),
    );
    // Render-target UVs use a top-left origin in WebGPURenderer (both backends),
    // matching Three.js QuadMesh rather than ordinary PlaneGeometry UVs.
    const uv = plane.geometry.getAttribute('uv');
    for (let vertex = 0; vertex < uv.count; vertex++)
      uv.setY(vertex, 1 - uv.getY(vertex));
    plane.position.y = i === 0 ? 0.5 : -0.5;
    splitScene.add(plane);
  });
  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color))
      materials.set(color, new THREE.MeshLambertMaterial({ color }));
    return materials.get(color);
  };
  const environments = new Map();
  function makeEnvironment(track) {
    const group = new THREE.Group();
    const batches = new Map();
    const TRACK_LENGTH = track.length,
      trackPoint = track.point;
    const samples = Math.ceil(TRACK_LENGTH / 1.8);
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
      for (let i = 0; i <= samples; i++) {
        for (const offset of [inner, outer]) {
          const p = trackPoint((i / samples) * TRACK_LENGTH, offset);
          vertices.push(p.x, height, p.z);
        }
        if (i < samples) {
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
      group.add(mesh);
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
    for (const distance of [TRACK_LENGTH * 0.16, TRACK_LENGTH * 0.63]) {
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
    if (track.id === 'park') {
      for (const side of [-1, 1])
        for (let z = -145; z <= 145; z += 30) {
          building(side * 77, z, index++);
          if (z % 2) building(side * 113, z + 10, index++);
        }
      for (const z of [-155, 155])
        for (const x of [-38, -9, 20, 49]) building(x, z, index++);
    } else {
      // Keep whole building footprints clear of every road segment, including the
      // inward bends. Sampling every two metres is conservative with this margin.
      const road = Array.from({ length: Math.ceil(TRACK_LENGTH / 2) }, (_, i) =>
        trackPoint(i * 2),
      );
      for (let x = -185; x <= 230; x += 32)
        for (let z = -205; z <= 205; z += 32) {
          if (road.some((p) => Math.hypot(x - p.x, z - p.z) < 34)) continue;
          if (Math.hypot(x - 20, z - 10) < 35) continue;
          building(x, z, index++);
        }
    }
    const [parkX, parkZ] = track.parkCenter;
    box(
      '#d9d4b9',
      parkX,
      0.015,
      parkZ,
      5,
      0.08,
      track.id === 'park' ? 170 : 46,
    );
    box('#d9d4b9', parkX, 0.02, parkZ, 46, 0.08, 5);
    staticMesh(
      new THREE.CylinderGeometry(9, 10, 0.7, 24),
      '#eee5d0',
      parkX,
      0.4,
      parkZ,
    );
    staticMesh(
      new THREE.CylinderGeometry(8, 8, 0.1, 24),
      '#88b7c2',
      parkX,
      0.8,
      parkZ,
    );
    staticMesh(
      new THREE.CylinderGeometry(2, 2.8, 2, 12),
      '#eee5d0',
      parkX,
      1.5,
      parkZ,
    );
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
    if (track.id === 'park')
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
      group.add(new THREE.Mesh(merged, material(color)));
      geometries.forEach((g) => g.dispose());
    }

    scene.add(group);
    return group;
  }
  function selectMap(id) {
    if (!environments.has(id))
      environments.set(id, makeEnvironment(getTrack(id)));
    for (const [map, group] of environments) group.visible = map === id;
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
  const cars = Array.from({ length: 6 }, (_, i) =>
    makeCar(COLORS[i % COLORS.length]),
  );
  const looks = [new THREE.Vector3(), new THREE.Vector3()];
  const desired = new THREE.Vector3(),
    target = new THREE.Vector3();
  let initialized = false,
    lastStillFrame = null,
    slowFrames = 0,
    activeMap = null;
  let width = 1,
    height = 1;
  function place(car, driver, track) {
    const p = track.point(START + driver.distance, driver.offset);
    car.position.set(p.x, 0, p.z);
    car.rotation.set(
      0,
      p.heading - (driver.steer || 0) * 0.12,
      -(driver.steer || 0) * 0.025,
    );
    return p;
  }
  function draw(race, settings, dt, garage) {
    const still = garage || ['paused', 'finished'].includes(race.phase);
    const signature = `${race.phase}:${settings.count}:${settings.color}:${settings.color2}:${settings.players}:${settings.map}`;
    if (still && lastStillFrame === signature) return;
    lastStillFrame = still ? signature : null;
    if (activeMap !== race.map) {
      selectMap(race.map);
      activeMap = race.map;
      initialized = false;
    }
    if (!still && dt > 0.045) slowFrames++;
    else slowFrames = 0;
    if (slowFrames >= 4 && renderer.getPixelRatio() > 0.55) {
      renderer.setPixelRatio(Math.max(0.5, renderer.getPixelRatio() * 0.75));
      slowFrames = 0;
    }
    const track = getTrack(race.map);
    const racers = [...race.drivers, ...race.rivals];
    const colors = [
      settings.color,
      ...(settings.players === 2 ? [settings.color2] : []),
      ...COLORS.filter(
        (c) =>
          c !== settings.color &&
          (settings.players !== 2 || c !== settings.color2),
      ),
    ];
    cars.forEach((car, i) => {
      car.visible = i < racers.length;
      if (car.visible) {
        car.userData.body.color.set(colors[i % colors.length]);
        place(car, racers[i], track);
      }
    });
    const split = settings.players === 2 && !garage;
    container.dataset.views = split ? '2' : '1';
    for (let i = 0; i < (split ? 2 : 1); i++) {
      const driver = race.drivers[i],
        p = track.point(START + driver.distance, driver.offset);
      const camera = cameras[i];
      camera.aspect = width / (split ? height / 2 : height);
      if (garage && width > 760)
        camera.setViewOffset(
          width,
          height,
          -Math.round(width * 0.16),
          0,
          width,
          height,
        );
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      if (garage) {
        desired.set(p.x + 15, 11, p.z - 17);
        target.set(p.x, 1, p.z + (innerWidth > 760 ? -5 : 0));
      } else {
        desired.set(p.x - p.tx * 15, 10, p.z - p.tz * 15);
        const ahead = track.point(
          START + driver.distance + 15,
          driver.offset * 0.5,
        );
        target.set(ahead.x, 0.8, ahead.z);
      }
      const smooth = initialized ? 1 - Math.exp(-dt * 7) : 1;
      camera.position.lerp(desired, smooth);
      looks[i].lerp(target, smooth);
      camera.up.copy(UP);
      camera.lookAt(looks[i]);
      if (split) {
        viewTargets[i].setSize(
          Math.max(1, Math.floor(width * renderer.getPixelRatio())),
          Math.max(1, Math.floor((height * renderer.getPixelRatio()) / 2)),
        );
        renderer.setRenderTarget(viewTargets[i]);
      }
      renderer.render(scene, camera);
      if (split) renderer.setRenderTarget(null);
    }
    if (split) renderer.render(splitScene, splitCamera);
    initialized = true;
  }
  function resize() {
    initialized = false;
    lastStillFrame = null;
    ({ width, height } = container.getBoundingClientRect());
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
