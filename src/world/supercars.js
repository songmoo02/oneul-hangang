// 잠수교: 값비싼 슈퍼카와 고급 오토바이만 지나다닌다. 다리 가장자리에는 그 차들을 찍는 사람들이 서 있다.
// 차는 실제 차종을 본뜨지 않고, 차급별 실루엣(쐐기형·미드십·쿠페·그랜드 투어러·각진 SUV·로드스터)만 직접 만든 것이다.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';
import { vehicleMaterial } from './traffic.js';
import { mulberry32 } from '../core/math.js';

const PAINT = [[0.78, 0.04, 0.04], [0.9, 0.72, 0.04], [0.35, 0.8, 0.1], [0.92, 0.4, 0.04], [0.9, 0.9, 0.88], [0.03, 0.03, 0.035], [0.05, 0.2, 0.7], [0.5, 0.52, 0.55], [0.45, 0.05, 0.5], [0.05, 0.3, 0.2]];

// 차체: 옆모습 윤곽(z, y)을 좌우로 밀어 만든다
function carGeo(kind, col) {
  const g = new GeoBuilder();
  const wheel = (x, z, r, w) => { g.color(0.03, 0.03, 0.03); g.cylinder(x - w / 2, r, z, r, r, 0.001, 12); for (let i = 0; i < 10; i++) { const a0 = (i / 10) * 6.283, a1 = ((i + 1) / 10) * 6.283; g.beam([x, r + Math.sin(a0) * r * 0.86, z + Math.cos(a0) * r * 0.86], [x, r + Math.sin(a1) * r * 0.86, z + Math.cos(a1) * r * 0.86], w, r * 0.3); } g.color(0.6, 0.6, 0.62); g.box(x, r, z, w * 1.02, r * 1.1, r * 1.1); };
  const S = { // [길이, 폭, 차체 높이, 지붕 높이, 지붕 앞, 지붕 뒤, 바퀴 반지름]
    wedge: [4.6, 2.0, 0.62, 1.08, 0.5, -1.3, 0.34], mid: [4.5, 1.95, 0.66, 1.14, 0.3, -1.0, 0.34], coupe: [4.5, 1.85, 0.72, 1.26, 0.2, -1.5, 0.33],
    gt: [4.9, 1.98, 0.86, 1.38, 0.5, -1.5, 0.36], suv: [4.7, 1.95, 1.2, 1.92, 0.9, -2.1, 0.42], roadster: [4.3, 1.85, 0.66, 0.98, 0.1, -0.7, 0.33],
  }[kind];
  const [L, W, H, RH, rf, rb, wr] = S, hl = L / 2;
  g.color(...col);
  if (kind === 'suv') { g.box(0, 0.3 + H / 2, 0, W, H - 0.1, L); g.box(0, H + (RH - H) / 2 + 0.2, (rf + rb) / 2, W * 0.94, RH - H, rf - rb); g.color(0, 0, 1); g.box(0, H + (RH - H) / 2 + 0.22, (rf + rb) / 2, W * 0.96, (RH - H) * 0.62, rf - rb - 0.3); g.box(0, H + (RH - H) / 2 + 0.22, rf, W * 0.8, (RH - H) * 0.62, 0.06); g.color(0.03, 0.03, 0.03); g.box(0, 0.75, -hl - 0.12, 0.7, 0.7, 0.24); }
  else {
    // 낮은 차체 + 앞으로 내려가는 보닛 + 유선형 지붕
    g.box(0, 0.22 + (H - 0.22) / 2, -0.2, W, H - 0.22, L - 0.6);
    g.beam([0, H - 0.12, hl - 1.5], [0, 0.42, hl], W * 0.98, 0.3);
    g.beam([0, H - 0.1, -hl + 1.0], [0, H - 0.22, -hl], W * 0.98, 0.3);
    if (kind !== 'roadster') {
      g.color(0, 0, 1);
      g.beam([0, H - 0.05, rf + 0.75], [0, RH - 0.08, rf], W * 0.82, 0.06); // 앞유리
      g.beam([0, RH - 0.08, rb + 0.5], [0, H, rb - 0.5], W * 0.8, 0.06);
      g.box(0, (H + RH) / 2 - 0.02, (rf + rb) / 2 + 0.25, W * 0.86, RH - H - 0.12, rf - rb - 0.5);
      g.color(...col); g.box(0, RH - 0.04, (rf + rb) / 2 + 0.25, W * 0.8, 0.07, rf - rb - 0.45);
    } else { g.color(0, 0, 1); g.beam([0, H - 0.05, 0.75], [0, RH, 0.35], W * 0.8, 0.05); g.color(0.1, 0.08, 0.07); g.box(0, H + 0.02, -0.3, W * 0.7, 0.12, 1.0); }
    if (kind === 'wedge' || kind === 'mid') { g.color(0.03, 0.03, 0.03); g.box(0, H + 0.26, -hl + 0.22, W * 0.96, 0.05, 0.34); for (const x of [-0.7, 0.7]) g.box(x, H + 0.12, -hl + 0.26, 0.06, 0.26, 0.2); } // 리어 윙
    g.color(0.03, 0.03, 0.03); g.box(0, 0.2, hl - 0.1, W * 0.9, 0.16, 0.3); g.box(0, 0.24, -hl + 0.05, W * 0.86, 0.22, 0.2);
  }
  for (const z of [hl - 0.85, -hl + 0.85]) for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) wheel(x, z, wr, 0.26);
  g.color(1, 1, 0.9); for (const x of [-W / 2 + 0.32, W / 2 - 0.32]) g.box(x, kind === 'suv' ? 0.95 : 0.52, hl - 0.02, 0.36, 0.1, 0.08);
  g.color(1, 0, 0); g.box(0, kind === 'suv' ? 1.0 : H - 0.2, -hl - 0.01, W * 0.86, 0.06, 0.05);
  return g.build();
}

function bikeGeo(col) {
  const g = new GeoBuilder();
  g.color(0.03, 0.03, 0.03);
  for (const z of [-0.72, 0.72]) for (let i = 0; i < 12; i++) { const a0 = (i / 12) * 6.283, a1 = ((i + 1) / 12) * 6.283; g.beam([0, 0.33 + Math.sin(a0) * 0.33, z + Math.cos(a0) * 0.33], [0, 0.33 + Math.sin(a1) * 0.33, z + Math.cos(a1) * 0.33], 0.16, 0.08); }
  g.color(...col); g.beam([0, 0.75, 0.75], [0, 0.72, -0.25], 0.36, 0.42); g.beam([0, 0.95, 0.72], [0, 0.6, 0.95], 0.34, 0.3); g.beam([0, 0.82, -0.2], [0, 0.98, -0.85], 0.26, 0.16);
  g.color(0.08, 0.08, 0.09); g.box(0, 0.5, 0.05, 0.3, 0.42, 0.7); g.box(0, 0.9, -0.3, 0.26, 0.08, 0.5);
  g.color(0.7, 0.7, 0.72); g.beam([0.17, 0.42, -0.2], [0.17, 0.62, -0.95], 0.09, 0.09);
  g.color(1, 1, 0.9); g.box(0, 0.86, 0.98, 0.16, 0.12, 0.05);
  g.color(1, 0, 0); g.box(0, 0.96, -0.88, 0.14, 0.05, 0.04);
  // 라이더(검은 가죽옷, 헬멧)
  g.color(0.05, 0.05, 0.06); g.beam([0, 0.95, -0.3], [0, 1.35, 0.3], 0.4, 0.36); g.beam([0, 1.25, 0.25], [0, 1.0, 0.72], 0.5, 0.1); g.beam([0, 0.9, -0.2], [0, 0.45, 0.1], 0.46, 0.14);
  g.color(...col); g.box(0, 1.52, 0.38, 0.3, 0.3, 0.34);
  g.color(0, 0, 1); g.box(0, 1.53, 0.55, 0.26, 0.14, 0.04);
  return g.build();
}

export function buildSupercars(ctx) {
  const p = ctx.bridgePlans.find((q) => q.jamsu), J = p.jamsu, rnd = mulberry32(777);
  const mat = vehicleMaterial(ctx, { roughness: 0.18, metalness: 0.75 });
  const kinds = ['wedge', 'mid', 'coupe', 'gt', 'suv', 'roadster'];
  const NAMES = { wedge: '쐐기형 슈퍼카', mid: '미드십 슈퍼카', coupe: '스포츠 쿠페', gt: '그랜드 투어러', suv: '각진 고급 SUV', roadster: '로드스터', bike: '슈퍼 바이크' };
  const cars = [];
  const len = J.s1 - J.s0;
  for (let i = 0; i < 16; i++) {
    const bike = i >= 11, kind = bike ? 'bike' : kinds[i % kinds.length], col = PAINT[Math.floor(rnd() * PAINT.length)];
    const m = new THREE.Mesh(bike ? bikeGeo(col) : carGeo(kind, col), mat);
    m.castShadow = true;
    ctx.scene.add(m);
    const dir = i % 2 ? 1 : -1;
    cars.push({ m, kind, name: NAMES[kind], dir, s: J.s0 + rnd() * len, v: 7 + rnd() * 5, lane: dir * (2.3 + (bike ? 0.9 : 0)), bike });
  }
  // 사진 찍는 사람들의 플래시
  const spots = ctx.photoSpots || [];
  const flashes = spots.map((sp) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(6, 6, 6.5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(sp.x + Math.sin(sp.yaw) * 0.3, sp.y + 0.95, sp.z + Math.cos(sp.yaw) * 0.3); s.scale.setScalar(0.5); ctx.scene.add(s); return { s, t: rnd() * 5, on: 0 }; });
  const api = {
    cars, onPass: null,
    update(dt, env, player) {
      const px = player.state.x, pz = player.state.z, py = player.state.y;
      for (const c of cars) {
        // 앞차에 바짝 붙지 않게 속도를 맞춘다
        let v = c.v;
        for (const o of cars) if (o !== c && o.dir === c.dir && Math.abs(o.lane - c.lane) < 0.5) { const gap = (o.s - c.s) * c.dir; if (gap > 0 && gap < 9) v = Math.min(v, o.v * 0.9); }
        c.s += c.dir * v * dt;
        if (c.s > J.s1) c.s = J.s0; else if (c.s < J.s0) c.s = J.s1;
        const q = p.at(c.s, c.lane), y = J.y(c.s), y2 = J.y(c.s + c.dir * 1.5);
        const edge = Math.min(1, (c.s - J.s0) / 6, (J.s1 - c.s) / 6);
        c.m.position.set(q[0], y + 0.02, q[1]);
        c.m.rotation.set(-Math.atan2(y2 - y, 1.5), Math.atan2(p.dx * c.dir, p.dz * c.dir), 0, 'YXZ');
        c.m.scale.setScalar(Math.max(0.001, edge));
        c.x = q[0]; c.z = q[1];
        const d = Math.hypot(q[0] - px, q[1] - pz);
        if (d < 14 && Math.abs(y - py) < 3 && !c.near) { c.near = true; if (api.onPass) api.onPass(c, d); } else if (d > 22) c.near = false;
      }
      for (let i = 0; i < flashes.length; i++) {
        const f = flashes[i], sp = spots[i];
        f.t -= dt; f.on = Math.max(0, f.on - dt * 9);
        if (f.t <= 0) { f.t = 2 + Math.random() * 7; if (sp.n.vis > 0.5 && cars.some((c) => Math.hypot(c.x - sp.x, c.z - sp.z) < 16)) f.on = 1; }
        f.s.material.opacity = f.on;
      }
    },
  };
  return api;
}
