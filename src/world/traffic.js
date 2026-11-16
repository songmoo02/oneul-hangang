// 교통: 대교와 강변도로를 달리는 차, 동작대교(4호선)·한강철교(1호선)를 건너는 열차.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';
import { mulberry32 } from '../core/math.js';
import { bankN, bankS, CITY_Y, LEVEE_W } from './field.js';

// 정점 색을 표식으로 써서 전조등·후미등·창문을 밤에 빛나게 하는 재질
export function vehicleMaterial(ctx, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.45, metalness: opts.metalness ?? 0.35 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNightK = ctx.uniforms.uNightK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLight;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLight = (color.r > 0.95 && color.g > 0.95 && color.b < 0.95) ? 1.0 : (color.r > 0.95 && color.g < 0.05) ? -1.0 : (color.b > 0.95 && color.r < 0.05) ? 2.0 : 0.0;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNightK; varying float vLight;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vLight > 1.5) diffuseColor.rgb = vec3(0.04, 0.055, 0.075);
        else if (vLight > 0.5) diffuseColor.rgb = vec3(0.9, 0.88, 0.8);
        else if (vLight < -0.5) diffuseColor.rgb = vec3(0.5, 0.03, 0.02);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float nk = clamp(uNightK, 0.0, 1.0);
        if (vLight > 1.5) totalEmissiveRadiance += vec3(1.0, 0.86, 0.62) * 1.5 * nk;
        else if (vLight > 0.5) totalEmissiveRadiance += vec3(1.0, 0.95, 0.82) * (0.4 + 7.0 * nk);
        else if (vLight < -0.5) totalEmissiveRadiance += vec3(1.0, 0.08, 0.04) * (0.25 + 3.2 * nk);`);
  };
  return mat;
}

function carGeometry() {
  const g = new GeoBuilder();
  g.color(1, 0.94, 0.94); // 차체(인스턴스 색으로 칠해짐)
  g.box(0, 0.62, 0, 1.8, 0.62, 4.3);
  g.color(0, 0, 1); // 창
  g.box(0, 1.18, -0.2, 1.6, 0.52, 2.3);
  g.color(0.03, 0.03, 0.03);
  for (const x of [-0.86, 0.86]) for (const z of [-1.35, 1.35]) g.box(x, 0.33, z, 0.22, 0.66, 0.7);
  g.color(1, 1, 0.9); // 전조등
  for (const x of [-0.62, 0.62]) g.box(x, 0.66, 2.16, 0.36, 0.16, 0.06);
  g.color(1, 0, 0); // 후미등
  for (const x of [-0.62, 0.62]) g.box(x, 0.7, -2.16, 0.4, 0.14, 0.06);
  return g.build();
}

function trainCarGeometry(stripe) {
  const g = new GeoBuilder();
  g.color(0.78, 0.8, 0.82);
  g.box(0, 2.0, 0, 2.9, 3.1, 9.6);
  g.color(stripe);
  g.box(0, 1.25, 0, 2.94, 0.34, 9.62);
  g.box(0, 3.2, 0, 2.94, 0.2, 9.62);
  g.color(0, 0, 1);
  g.box(0, 2.25, 0, 2.96, 0.95, 8.4);
  g.color(0.12, 0.12, 0.13);
  g.box(0, 0.3, 0, 2.4, 0.5, 8.8);
  return g.build();
}

const CAR_COLORS = [0xf2f2f0, 0xf2f2f0, 0xd8dadc, 0x1c1d20, 0x1c1d20, 0x8a8d92, 0x5a5d62, 0x2a3a5a, 0x7a1f22, 0xc9c2b2, 0x3a5a4a];

export function buildTraffic(ctx) {
  const rnd = mulberry32(2468);
  const cars = []; // {type:'bridge'|'road', ...}
  const lanesByBridge = [];

  // ── 대교 위 차로
  for (const p of ctx.bridgePlans) {
    if (p.type === 'truss') continue;
    const med = p.type === 'langer' ? 7.4 : 0;
    const edge = p.W / 2 - 2.95;
    const half = edge - med / 2 - (med > 0 ? 0.35 : 0);
    const n = Math.max(1, Math.floor(half / 3.1));
    const bl = { plan: p, lanes: [] };
    for (const dir of [1, -1]) {
      for (let k = 0; k < n; k++) {
        const a = dir * (med / 2 + (med > 0 ? 0.35 : 0) + (half * (k + 0.5)) / n);
        const lane = { a, dir, speed: 11 + (n - 1 - k) * 2 + rnd() * 1.5, hold: 0, phase: rnd() * 100 };
        bl.lanes.push(lane);
        let s = rnd() * 30;
        while (s < p.L) {
          cars.push({ type: 'bridge', p, lane, s0: s, rank: rnd(), color: CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] });
          s += 22 + rnd() * 34;
        }
      }
    }
    lanesByBridge.push(bl);
  }

  // ── 강변북로·올림픽대로
  const roadLanes = [];
  for (const bank of [bankN, bankS]) {
    const north = bank === bankN;
    const u0 = bank.uAtX(-1950), u1 = bank.uAtX(2150);
    for (let l = 0; l < 6; l++) {
      const dir = (l < 3) === north ? 1 : -1;
      const lane = { bank, north, u0: Math.min(u0, u1), u1: Math.max(u0, u1), off: LEVEE_W + 1.5 + 0.8 + (l + 0.5) * 3.4, dir, speed: 17 + Math.abs(2.5 - l) * 1.5 + rnd(), phase: rnd() * 500 };
      roadLanes.push(lane);
      let s = rnd() * 60;
      while (s < lane.u1 - lane.u0) {
        cars.push({ type: 'road', lane, s0: s, rank: rnd(), color: CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] });
        s += 55 + rnd() * 110;
      }
    }
  }

  const carMesh = new THREE.InstancedMesh(carGeometry(), vehicleMaterial(ctx), cars.length);
  const col = new THREE.Color();
  cars.forEach((c, i) => carMesh.setColorAt(i, col.setHex(c.color)));
  carMesh.frustumCulled = false;
  carMesh.name = 'cars';
  ctx.scene.add(carMesh);

  // ── 열차
  const dj = ctx.bridgePlans.find((p) => p.id === 'dongjak'), rl = ctx.bridgePlans.find((p) => p.id === 'rail');
  const tracks = [
    { p: dj, a: 1.75, dir: 1, yOff: 0.42, line: 4 }, { p: dj, a: -1.75, dir: -1, yOff: 0.42, line: 4 },
    { p: rl, a: 8.6, dir: 1, yOff: 0.27, line: 1 }, { p: rl, a: 0, dir: -1, yOff: 0.27, line: 1 }, { p: rl, a: -8.6, dir: 1, yOff: 0.27, line: 1 },
  ];
  const CARS = 8, CAR_LEN = 10.1;
  const mat = vehicleMaterial(ctx, { roughness: 0.4, metalness: 0.5 });
  const trainMeshes = {};
  for (const line of [4, 1]) {
    const cnt = tracks.filter((t) => t.line === line).length * CARS;
    const m = new THREE.InstancedMesh(trainCarGeometry(line === 4 ? 0x00a2d1 : 0x0d3692), mat, cnt);
    m.frustumCulled = false;
    m.castShadow = true;
    ctx.scene.add(m);
    trainMeshes[line] = { m, i: 0 };
  }
  tracks.forEach((t, i) => { t.wait = 6 + i * 13 + rnd() * 20; t.s = null; t.speed = 17; });

  // 열차가 드나드는 역사(다리 양 끝)
  const sg = new GeoBuilder();
  for (const [p, w, h] of [[dj, 9.2, 6.2], [rl, 25, 7.6]]) {
    for (const s of [-2, p.L + 2]) {
      const len = 40, sc = s < 0 ? s - len / 2 + 8 : s + len / 2 - 8;
      const c = p.at(sc);
      sg.color(0x9a9c9e);
      sg.obox([c[0], CITY_Y + h / 2, c[1]], [p.sx * w / 2, 0, p.sz * w / 2], [0, h / 2, 0], [p.dx * len / 2, 0, p.dz * len / 2]);
      sg.color(0x5a6470);
      sg.obox([c[0], CITY_Y + h + 0.3, c[1]], [p.sx * (w / 2 + 0.8), 0, p.sz * (w / 2 + 0.8)], [0, 0.3, 0], [p.dx * (len / 2 + 0.8), 0, p.dz * (len / 2 + 0.8)]);
    }
  }
  const stations = new THREE.Mesh(sg.build(), ctx.materials.concrete);
  stations.castShadow = true;
  ctx.scene.add(stations);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), o = {};
  const api = {
    carCount: cars.length,
    trainNear: 1e9,
    update(dt, env, player) {
      const t = ctx.uniforms.uTime.value;
      const h = env.hour;
      // 한밤에는 차가 줄어든다
      const dens = h > 1 && h < 5 ? 0.3 : h > 23 || h < 6 ? 0.55 : 1;
      const ps = player.state;
      // 사람이 차도에 있으면 그 차로는 멈춰서 기다린다
      for (const bl of lanesByBridge) {
        const p = bl.plan;
        const rx = ps.x - p.ax, rz = ps.z - p.az;
        const s = rx * p.dx + rz * p.dz, a = rx * p.sx + rz * p.sz;
        const onDeck = s > 0 && s < p.L && Math.abs(ps.y - p.deckY(s)) < 1.2;
        for (const ln of bl.lanes) {
          const block = onDeck && Math.abs(a - ln.a) < 2.4;
          ln.hold = block ? Math.min(1, ln.hold + dt * 1.5) : Math.max(0, ln.hold - dt * 0.8);
          ln.phase += ln.speed * (1 - ln.hold) * dt;
        }
      }
      for (const ln of roadLanes) ln.phase += ln.speed * dt;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        let x, y, z, yaw, s = 1;
        if (c.type === 'bridge') {
          const p = c.p, ln = c.lane;
          let sv = (c.s0 + ln.phase) % p.L;
          if (ln.dir < 0) sv = p.L - sv;
          const pt = p.at(sv, ln.a);
          x = pt[0]; z = pt[1]; y = p.deckY(sv) + 0.02;
          yaw = Math.atan2(p.dx * ln.dir, p.dz * ln.dir);
          s = Math.min(1, sv / 8, (p.L - sv) / 8);
        } else {
          const ln = c.lane, len = ln.u1 - ln.u0;
          let uu = (c.s0 + ln.phase) % len;
          if (ln.dir < 0) uu = len - uu;
          ln.bank.at(ln.u0 + uu, o);
          const d = o.w + ln.off;
          const nx = ln.north ? o.tz : -o.tz, nz = ln.north ? -o.tx : o.tx;
          x = o.x + nx * d; z = o.z + nz * d; y = CITY_Y + 0.02;
          yaw = Math.atan2(o.tx * ln.dir, o.tz * ln.dir);
        }
        if (c.rank > dens) s = 0;
        q.setFromAxisAngle(up, yaw);
        m4.compose(v.set(x, y, z), q, sc.set(s, s, s));
        carMesh.setMatrixAt(i, m4);
      }
      carMesh.instanceMatrix.needsUpdate = true;

      // 열차
      trainMeshes[4].i = 0; trainMeshes[1].i = 0;
      let near = 1e9;
      for (const tr of tracks) {
        const p = tr.p, total = CARS * CAR_LEN;
        if (tr.s === null) {
          tr.wait -= dt;
          if (tr.wait <= 0) tr.s = -34;
        } else {
          tr.s += tr.speed * dt;
          if (tr.s - total > p.L + 34) { tr.s = null; tr.wait = 45 + Math.random() * 70; }
        }
        const tm = trainMeshes[tr.line];
        for (let k = 0; k < CARS; k++) {
          const idx = tm.i++;
          let sv = tr.s === null ? -999 : tr.s - k * CAR_LEN - CAR_LEN / 2;
          const vis = sv > -30 && sv < p.L + 30;
          if (tr.dir < 0) sv = p.L - sv;
          const pt = p.at(sv, tr.a);
          const y = p.deckY(Math.max(0, Math.min(p.L, sv))) + tr.yOff;
          q.setFromAxisAngle(up, Math.atan2(p.dx * tr.dir, p.dz * tr.dir));
          const s = vis ? 1 : 0;
          m4.compose(v.set(pt[0], y, pt[1]), q, sc.set(s, s, s));
          tm.m.setMatrixAt(idx, m4);
          if (vis) { const d = Math.hypot(pt[0] - ps.x, pt[1] - ps.z, y - ps.y); if (d < near) near = d; }
        }
      }
      trainMeshes[4].m.instanceMatrix.needsUpdate = true;
      trainMeshes[1].m.instanceMatrix.needsUpdate = true;
      api.trainNear = near;
      void t;
    },
  };
  return api;
}
