// 배: 한강버스(여의도 ↔ 반포 왕복, 탑승 가능), 유람선, 오리배, 선착장, 배가 지나간 물결 자국.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from '../core/geobuilder.js';
import { canvasTexture } from '../core/textures.js';
import { mulberry32, clamp, smoothstep, lerp, damp, dampAngle } from '../core/math.js';
import { bankN, bankS, bankOffset, sampleField, heightAt, registerPathShape } from './field.js';
import { toWorld } from './geo.js';
import { vehicleMaterial } from './traffic.js';

const lonX = (lon) => toWorld(0, lon).x;

// ───────────────────────── 경로 ─────────────────────────
function makePath(pts) {
  // 모서리 깎기(Chaikin)로 부드럽게 한 뒤 길이로 매개화. 스플라인과 달리 바깥으로 부풀지 않아 교각 사이를 벗어나지 않는다.
  let out = pts.map((p) => [p[0], p[1]]);
  for (let it = 0; it < 3; it++) {
    const nx = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      nx.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    nx.push(out[out.length - 1]);
    out = nx;
  }
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return {
    pts: out, cum, total: cum[cum.length - 1],
    at(s, o = {}) {
      s = clamp(s, 0, this.total - 1e-4);
      let lo = 0, hi = out.length - 2;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
      const a = out[lo], b = out[lo + 1], l = cum[lo + 1] - cum[lo], t = (s - cum[lo]) / l;
      o.x = a[0] + (b[0] - a[0]) * t; o.z = a[1] + (b[1] - a[1]) * t;
      o.tx = (b[0] - a[0]) / l; o.tz = (b[1] - a[1]) / l;
      return o;
    },
  };
}

const riverMid = (x) => {
  const a = bankN.at(bankN.uAtX(x)), b = bankS.at(bankS.uAtX(x));
  return [(a.x + b.x) / 2, (a.z + b.z) / 2];
};

// 다리 밑을 지날 때는 교각 사이 한가운데로, 다리와 직각으로 지나간다 (서→동 진행 기준 앞·뒤 두 점)
function crossing(p, sWant) {
  const ps = p.piers.map((q) => q.s).sort((a, b) => a - b);
  let best = sWant;
  for (let i = 0; i < ps.length - 1; i++) if (sWant >= ps[i] && sWant <= ps[i + 1]) { best = (ps[i] + ps[i + 1]) / 2; break; }
  const k = p.sx > 0 ? 1 : -1, r = p.W / 2 + 26;
  return [p.at(best, -k * r), p.at(best, k * r)];
}

export function planBoats(ctx) {
  const plan = (id) => ctx.bridgePlans.find((p) => p.id === id);
  // 선착장: 여의도(마포대교 동쪽), 반포(서래섬 동쪽)
  const yd = bankOffset('S', lonX(126.9374), 0), bd = bankOffset('S', lonX(126.9856), 0);
  const mkDock = (b, name, big) => ({
    name, big, x: b.x - b.lx * 12, z: b.z - b.lz * 12, // 부잔교 중심(물 위)
    tx: b.tx, tz: b.tz, wx: -b.lx, wz: -b.lz, // 강변 방향, 물 쪽 방향
    bank: b, len: big ? 34 : 20, wid: big ? 12 : 8, deckY: 1.15,
  });
  const docks = { yeouido: mkDock(yd, '여의도 선착장', true), banpo: mkDock(bd, '반포 선착장', false) };
  for (const d of Object.values(docks)) {
    d.berth = [d.x + d.wx * (d.wid / 2 + 4.7), d.z + d.wz * (d.wid / 2 + 4.7)];
    // 강변 → 부잔교 도교(걸어서 건너는 다리)
    const g0 = [d.bank.x + d.bank.lx * 4.2, d.bank.z + d.bank.lz * 4.2];
    const gy0 = heightAt(g0[0], g0[1]) + 0.03;
    const glen = 4.2 + 12 - d.wid / 2 + 0.6;
    d.gang = { x: g0[0], z: g0[1], len: glen, y0: gy0 };
    ctx.walk.addStrip({ ax: g0[0], az: g0[1], dx: d.wx, dz: d.wz, sx: -d.wz, sz: d.wx, s0: 0, s1: glen, a0: -1.5, a1: 1.5, y: (s) => lerp(gy0, d.deckY, smoothstep(0, glen - 0.5, s)), tag: 'dock' });
    ctx.walk.addStrip({ ax: d.x - d.tx * d.len / 2, az: d.z - d.tz * d.len / 2, dx: d.tx, dz: d.tz, sx: -d.tz, sz: d.tx, s0: 0.3, s1: d.len - 0.3, a0: -d.wid / 2 + 0.3, a1: d.wid / 2 - 0.3, y: () => d.deckY, tag: 'dock' });
    registerPathShape({ t: 1, ax: g0[0], az: g0[1], bx: g0[0] + d.bank.lx * 5, bz: g0[1] + d.bank.lz * 5, r: 2.2 });
  }

  // 한강버스 항로: 여의도 → 원효대교 → 한강철교 → 한강대교(노들섬 북쪽 수로) → 동작대교 → 반포
  const hg = plan('hangang');
  const y = docks.yeouido, b = docks.banpo;
  // 노들섬 북쪽 수로의 한가운데(강 중심선과 북쪽 강변의 중간) – 교각 간격이 넓은 쪽으로 다닌다
  const northChannel = (lon, k = 0.5) => { const m = riverMid(lonX(lon)), nb = bankN.at(bankN.uAtX(lonX(lon))); return [lerp(m[0], nb.x, k), lerp(m[1], nb.z, k)]; };
  const pts = [
    y.berth,
    [y.berth[0] + y.wx * 30 + y.tx * 26, y.berth[1] + y.wz * 30 + y.tz * 26],
    ...crossing(plan('wonhyo'), plan('wonhyo').mid + 20),
    ...crossing(plan('rail'), lerp(plan('rail').sW0, plan('rail').sW1, 0.3)),
    ...crossing(hg, (hg.sW0 + hg.island[0]) / 2),
    northChannel(126.9612),
    northChannel(126.9645, 0.25),
    riverMid(lonX(126.9690)),
    riverMid(lonX(126.9750)),
    ...crossing(plan('dongjak'), plan('dongjak').mid + 30),
    [b.berth[0] + b.wx * 30 - b.tx * 30, b.berth[1] + b.wz * 30 - b.tz * 30],
    b.berth,
  ];
  const busRoute = makePath(pts);

  // 유람선: 여의도 앞 ↔ 마포대교 건너 밤섬 앞
  const mp = plan('mapo');
  const cruiseRoute = makePath([
    riverMid(lonX(126.9415)), ...crossing(mp, mp.mid).reverse(), riverMid(lonX(126.9345)), riverMid(lonX(126.9328)),
  ]);

  // 오리배 선착장(여의도 물빛광장 앞)
  const dk = bankOffset('S', lonX(126.9395), 0);
  const duckDock = { x: dk.x - dk.lx * 6, z: dk.z - dk.lz * 6, wx: -dk.lx, wz: -dk.lz, tx: dk.tx, tz: dk.tz, bank: dk };
  {
    const g0 = [dk.x + dk.lx * 3.6, dk.z + dk.lz * 3.6];
    const gy0 = heightAt(g0[0], g0[1]) + 0.03;
    duckDock.g0 = g0; duckDock.gy0 = gy0; duckDock.len = 13.5;
    ctx.walk.addStrip({ ax: g0[0], az: g0[1], dx: duckDock.wx, dz: duckDock.wz, sx: -duckDock.wz, sz: duckDock.wx, s0: 0, s1: duckDock.len, a0: -1.6, a1: 1.6, y: (s) => lerp(gy0, 0.75, smoothstep(0, 7, s)), tag: 'dock' });
    registerPathShape({ t: 1, ax: g0[0], az: g0[1], bx: g0[0] + dk.lx * 5, bz: g0[1] + dk.lz * 5, r: 2.0 });
  }
  ctx.boatPlan = { docks, busRoute, cruiseRoute, duckDock };
  return ctx.boatPlan;
}

// ───────────────────────── 모델 ─────────────────────────
export const BUS_SCALE = 1.5;
export const BUS_SEAT_Z = [-5.6, -4.3, -3.0, -1.7, -0.4, 0.9, 2.2, 3.5];
function busGeometry() {
  const g = new GeoBuilder();
  g.color(0.93, 0.94, 0.95);
  for (const x of [-1.5, 1.5]) g.box(x, 0.35, 0, 1.3, 1.1, 15); // 쌍동선 선체
  g.box(0, 1.05, 0, 4.6, 0.5, 15.4);
  g.color(0.1, 0.42, 0.62);
  g.box(0, 0.86, 0, 4.64, 0.16, 15.44);
  g.color(0.93, 0.94, 0.95);
  g.box(0, 2.05, -0.4, 4.3, 1.5, 12.6); // 객실
  g.color(0, 0, 1);
  g.box(0, 2.15, -0.4, 4.34, 0.8, 11.8); // 창
  g.box(0, 2.15, 6.0, 3.4, 0.8, 0.3);
  g.color(0.82, 0.84, 0.86);
  g.box(0, 2.86, -0.4, 4.5, 0.12, 13.0); // 지붕 갑판
  g.color(0.3, 0.33, 0.36);
  for (const x of [-2.2, 2.2]) g.box(x, 3.4, -0.4, 0.05, 0.05, 12.8);
  for (const z of [-6.8, 6.0]) g.box(0, 3.4, z, 4.4, 0.05, 0.05);
  // 지붕 갑판 좌석(가운데 통로 양옆으로 두 줄)
  for (const z of BUS_SEAT_Z) for (const x of [-1.45, 1.45]) {
    g.color(0.16, 0.36, 0.56); g.box(x, 3.12, z, 1.25, 0.1, 0.42);
    g.color(0.12, 0.28, 0.46); g.box(x, 3.36, z - 0.2, 1.25, 0.42, 0.07);
    g.color(0.3, 0.33, 0.36); g.box(x, 3.0, z, 1.0, 0.16, 0.06);
  }
  g.color(0.85, 0.75, 0.5); g.box(0, 3.25, 5.2, 1.6, 0.7, 0.5); // 웰컴드링크 바
  for (let i = 0; i <= 6; i++) for (const x of [-2.2, 2.2]) g.box(x, 3.15, -6.8 + i * 2.13, 0.05, 0.56, 0.05);
  g.color(1, 1, 0.9); g.box(0, 1.5, 7.72, 0.5, 0.2, 0.06);
  g.color(1, 0, 0); g.box(0, 1.5, -7.72, 0.5, 0.2, 0.06);
  return g.build();
}

function cruiseGeometry() {
  const g = new GeoBuilder();
  g.color(0.95, 0.95, 0.93);
  g.box(0, 0.7, 0, 6.4, 1.8, 30);
  g.color(0.75, 0.16, 0.14); g.box(0, 0.25, 0, 6.44, 0.5, 30.04);
  g.color(0.95, 0.95, 0.93);
  g.box(0, 2.6, -1, 5.8, 2.0, 24);
  g.color(0, 0, 1); g.box(0, 2.7, -1, 5.84, 1.0, 23);
  g.color(0.95, 0.95, 0.93);
  g.box(0, 4.4, -2, 5.0, 1.6, 17);
  g.color(0, 0, 1); g.box(0, 4.5, -2, 5.04, 0.8, 16);
  g.color(0.85, 0.86, 0.88); g.box(0, 5.3, -2, 5.3, 0.12, 17.6);
  g.color(1, 1, 0.9); g.box(0, 1.6, 15.02, 0.7, 0.25, 0.06);
  return g.build();
}

function duckGeometry() {
  const P = (geo, col, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => {
    geo.rotateX(rx); geo.scale(sx, sy, sz); geo.translate(x, y, z);
    const n = geo.attributes.position.count, c = new Float32Array(n * 3), cc = new THREE.Color(col);
    for (let i = 0; i < n; i++) c.set([cc.r, cc.g, cc.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.deleteAttribute('uv');
    return geo;
  };
  return mergeGeometries([
    P(new THREE.SphereGeometry(1, 14, 10), 0xf4f1e8, 0, 0.45, 0, 1.0, 0.62, 1.7),
    P(new THREE.CylinderGeometry(0.24, 0.3, 1.5, 10), 0xf4f1e8, 0, 1.45, 1.25, 1, 1, 1, 0.25),
    P(new THREE.SphereGeometry(0.4, 12, 10), 0xf4f1e8, 0, 2.25, 1.5),
    P(new THREE.ConeGeometry(0.17, 0.5, 8), 0xf0932a, 0, 2.2, 1.98, 1, 1, 1, Math.PI / 2),
    P(new THREE.SphereGeometry(0.06, 6, 5), 0x151515, 0.3, 2.36, 1.72),
    P(new THREE.SphereGeometry(0.06, 6, 5), 0x151515, -0.3, 2.36, 1.72),
    P(new THREE.BoxGeometry(1.2, 0.25, 1.3), 0x7fb8d8, 0, 0.72, -0.25),
    P(new THREE.ConeGeometry(0.5, 0.9, 8), 0xf4f1e8, 0, 0.95, -1.75, 1, 1, 1, -0.9),
  ]);
}

// 배가 지나간 뒤 남는 물결 자국(띠 메시)
class Wake {
  constructor(ctx, width, life) {
    this.N = 44; this.width = width; this.life = life;
    this.pts = [];
    this.pos = new Float32Array(this.N * 2 * 3); this.age = new Float32Array(this.N * 2 * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.age, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uNoise: ctx.uniforms.uNoise, uTime: ctx.uniforms.uTime, uCol: ctx.uniforms.uFoamCol },
      vertexShader: 'attribute vec2 aAge; varying vec2 vA; varying vec3 vW; void main(){ vA = aAge; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoise; uniform float uTime; uniform vec3 uCol; varying vec2 vA; varying vec3 vW;
        void main() {
          float n = texture2D(uNoise, vW.xz * 0.35 + uTime * 0.02).b;
          float edge = smoothstep(0.25, 1.0, abs(vA.y));
          float a = (1.0 - vA.x) * (0.25 + 0.75 * edge) * smoothstep(0.35, 0.75, n + edge * 0.35) * smoothstep(0.0, 0.06, vA.x);
          gl_FragColor = vec4(uCol, a * 0.55);
        }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.layers.set(1);
    ctx.scene.add(this.mesh);
    this.t = 0;
  }

  update(dt, x, z, moving) {
    this.t += dt;
    for (const p of this.pts) p.age += dt / this.life;
    if (this.t > this.life / this.N * 1.6 && moving) {
      this.t = 0;
      const last = this.pts[0];
      const dx = last ? x - last.x : 1, dz = last ? z - last.z : 0, l = Math.hypot(dx, dz) || 1;
      this.pts.unshift({ x, z, age: 0, nx: -dz / l, nz: dx / l });
      if (this.pts.length > this.N) this.pts.pop();
    }
    for (let i = 0; i < this.N; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      const k = i * 6, a = i * 4;
      if (!p || i >= this.pts.length) { this.pos.fill(0, k, k + 6); this.pos[k + 1] = this.pos[k + 4] = -5; this.age[a] = this.age[a + 2] = 1; continue; }
      const w = this.width * (0.5 + p.age * 3.2);
      this.pos[k] = p.x + p.nx * w; this.pos[k + 1] = 0.03; this.pos[k + 2] = p.z + p.nz * w;
      this.pos[k + 3] = p.x - p.nx * w; this.pos[k + 4] = 0.03; this.pos[k + 5] = p.z - p.nz * w;
      this.age[a] = Math.min(1, p.age); this.age[a + 1] = 1; this.age[a + 2] = Math.min(1, p.age); this.age[a + 3] = -1;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAge.needsUpdate = true;
  }
}

function sign(text, w, h, bg = '#1d3a5c', fg = '#ffffff', size = 46) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `700 ${size}px "Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  }, { wrapT: THREE.ClampToEdgeWrapping });
}
export { sign as signTexture };

export function buildBoats(ctx) {
  const { docks, busRoute, cruiseRoute, duckDock } = ctx.boatPlan;
  const rnd = mulberry32(909);
  const group = new THREE.Group();
  group.name = 'boats';
  const vmat = vehicleMaterial(ctx, { roughness: 0.35, metalness: 0.2 });

  // ── 선착장(부잔교 + 건물)
  const dg = new GeoBuilder();
  for (const d of Object.values(docks)) {
    const T = [d.tx, 0, d.tz], Wv = [d.wx, 0, d.wz];
    const box = (ct, cw, y, lt, lw, h, col) => {
      dg.color(col);
      dg.obox([d.x + d.tx * ct + d.wx * cw, y, d.z + d.tz * ct + d.wz * cw], [T[0] * lt / 2, 0, T[2] * lt / 2], [0, h / 2, 0], [Wv[0] * lw / 2, 0, Wv[2] * lw / 2]);
    };
    box(0, 0, d.deckY - 0.75, d.len, d.wid, 1.5, 0x6f7377); // 부잔교
    box(0, 0, d.deckY - 0.01, d.len - 0.4, d.wid - 0.4, 0.04, 0x9a968c);
    // 도교
    const gl = d.gang.len;
    dg.color(0x8a8d90);
    dg.beam([d.gang.x, d.gang.y0 - 0.1, d.gang.z], [d.gang.x + d.wx * gl, d.deckY - 0.1, d.gang.z + d.wz * gl], 3.2, 0.2);
    dg.color(0x4f5458);
    for (const s of [-1.55, 1.55]) dg.beam([d.gang.x - d.wz * s, d.gang.y0 + 1.0, d.gang.z + d.wx * s], [d.gang.x + d.wx * gl - d.wz * s, d.deckY + 1.0, d.gang.z + d.wz * gl + d.wx * s], 0.07, 0.07);
    if (d.big) {
      // 선착장 건물: 1층은 걸어 들어갈 수 있는 편의점(동쪽 벽에 문), 2층은 막힌 상자
      const Y = d.deckY, at = (ct, cw) => [d.x + d.tx * ct + d.wx * cw, d.z + d.tz * ct + d.wz * cw];
      const solid = (ct, cw, lt, lw, top = 3.2) => { const q = at(ct, cw); ctx.walk.addBox(q[0], q[1], d.tx, d.tz, lt / 2, lw / 2, Y - 0.6, Y + top); };
      const wall = (ct, cw, y, lt, lw, h, col = 0xe8e6e0) => { box(ct, cw, Y + y, lt, lw, h, col); solid(ct, cw, lt, lw); };
      wall(-8, -4.9, 1.7, 15, 0.2, 3.4); // 강변 쪽 벽
      wall(-15.4, -1.2, 1.7, 0.2, 7.6, 3.4); // 서쪽 벽
      wall(-8, 2.5, 0.45, 15, 0.2, 0.9); // 강 쪽 창턱
      box(-8, 2.5, Y + 3.2, 15, 0.2, 0.4, 0xe8e6e0);
      box(-8, 2.5, Y + 1.95, 14.6, 0.06, 2.1, 0x0000ff); // 통유리(밤에 빛남)
      wall(-0.6, -3.1, 1.7, 0.2, 3.8, 3.4); wall(-0.6, 1.6, 1.7, 0.2, 2.0, 3.4); // 동쪽 벽(가운데가 문)
      box(-0.6, -0.3, Y + 2.85, 0.2, 1.8, 1.1, 0xe8e6e0);
      box(-0.45, -0.3, Y + 2.5, 0.06, 1.5, 0.3, 0x2a7a4a); // 문 위 띠 간판
      box(-8, -1.2, Y + 0.012, 14.6, 7.2, 0.02, 0xdcd6c8); // 바닥
      box(-8, -1.2, Y + 5.0, 15, 7.6, 3.2, 0xdfe3e6);
      box(-8, -1.2, Y + 6.75, 16, 8.6, 0.3, 0x55606a);
      box(-8, 2.62, Y + 4.9, 13.4, 0.08, 2.2, 0x0000ff);
      box(-8, 3.1, Y + 3.5, 15, 1.2, 0.16, 0x55606a); // 차양
      // 계산대
      wall(-4, -3.3, 0.5, 3.0, 0.7, 1.0, 0xd8d2c4);
      box(-3.3, -3.3, Y + 1.13, 0.42, 0.36, 0.26, 0x2a2a2e); box(-4.6, -3.3, Y + 1.06, 0.5, 0.3, 0.12, 0xe9c23a);
      // 진열대 2줄(색색의 상품)
      const GOODS = [0xd9412a, 0xe9c23a, 0x3a8ad9, 0x4aa86a, 0xf29ac2, 0xf2efe6, 0xe98a2a];
      for (const [k, ct] of [[0, -8], [1, -11]]) {
        wall(ct, -1.6, 0.8, 0.5, 3.6, 1.6, 0xf0ede4);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) box(ct, -3.1 + c * 0.6, Y + 0.42 + r * 0.5, 0.62, 0.5, 0.26, GOODS[(r * 2 + c + k * 3) % GOODS.length]);
      }
      // 음료 냉장고, 즉석조리기, 창가 식탁
      wall(-15.0, -1.2, 1.05, 0.6, 6.4, 2.1, 0xdfe6ea);
      for (let c = 0; c < 7; c++) for (let r = 0; r < 3; r++) box(-14.68, -3.9 + c * 0.9, Y + 0.5 + r * 0.6, 0.06, 0.7, 0.42, [0x3a8ad9, 0x4aa86a, 0xe9c23a, 0xd9412a][(c + r) % 4]);
      wall(-5.2, 1.95, 0.5, 3.6, 0.6, 1.0, 0xc8ccd0);
      for (const ct of [-6.4, -5.2, -4.0]) { box(ct, 1.95, Y + 1.06, 0.5, 0.4, 0.12, 0x3a3d42); box(ct, 1.95, Y + 1.16, 0.3, 0.3, 0.1, 0xf2efe6); }
      wall(-11.2, 2.0, 0.5, 5.4, 0.5, 1.0, 0xb89a6a);
      const C = at(-8, -1.2);
      d.room = { cx: C[0], cz: C[1], ux: d.tx, uz: d.tz, hl: 7.25, hw: 3.55, yTop: Y + 3.25 };
      d.store = { ramen: at(-7.05, -1.6), treat: at(-10.05, -1.6), drink: at(-13.9, -1.2), cooker: at(-4.0, 1.15), counter: at(-4, -2.4), door: at(-0.6, -0.3) };
      const pl = new THREE.PointLight(0xfff2dc, 9, 15, 1.6);
      pl.position.set(C[0], Y + 2.9, C[1]);
      group.add(pl);
    } else {
      box(-4, -1.6, d.deckY + 1.5, 7, 3.4, 0.2, 0x55606a);
      for (const t of [-7.2, -0.8]) { box(t, -1.6, d.deckY + 0.75, 0.2, 0.2, 1.5, 0x55606a); ctx.walk.addCircle(d.x + d.tx * t - d.wx * 1.6, d.z + d.tz * t - d.wz * 1.6, 0.15); }
    }
    // 난간(강 쪽 탑승구는 비운다)
    dg.color(0x4f5458);
    for (const e of [-1, 1]) {
      const a = [d.x + d.tx * e * d.len / 2, d.z + d.tz * e * d.len / 2];
      dg.beam([a[0] - d.wx * d.wid / 2, d.deckY + 1.0, a[1] - d.wz * d.wid / 2], [a[0] + d.wx * d.wid / 2, d.deckY + 1.0, a[1] + d.wz * d.wid / 2], 0.07, 0.07);
    }
    ctx.lamps.push({ x: d.x + d.tx * (d.len / 2 - 1.5), y: d.deckY, z: d.z + d.tz * (d.len / 2 - 1.5), kind: 'low', dirx: -d.tx, dirz: -d.tz });
    ctx.lamps.push({ x: d.x - d.tx * (d.len / 2 - 1.5) + d.wx * 4, y: d.deckY, z: d.z - d.tz * (d.len / 2 - 1.5) + d.wz * 4, kind: 'low', dirx: d.tx, dirz: d.tz });
  }
  // 오리배 선착장
  {
    const d = duckDock;
    dg.color(0x8a7458);
    dg.beam([d.g0[0], d.gy0 - 0.1, d.g0[1]], [d.g0[0] + d.wx * 7, 0.65, d.g0[1] + d.wz * 7], 3.3, 0.18);
    dg.beam([d.g0[0] + d.wx * 7, 0.65, d.g0[1] + d.wz * 7], [d.g0[0] + d.wx * d.len, 0.65, d.g0[1] + d.wz * d.len], 3.3, 0.18);
    dg.color(0x5a4a3a);
    for (const s of [5, 9, 13]) for (const a of [-1.5, 1.5]) dg.cylinder(d.g0[0] + d.wx * s - d.wz * a, -3, d.g0[1] + d.wz * s + d.wx * a, 0.14, 0.14, 4.2, 6, true);
  }
  const dockMesh = new THREE.Mesh(dg.build(), vmat);
  dockMesh.castShadow = true; dockMesh.receiveShadow = true;
  group.add(dockMesh);
  // 간판
  const addSign = (text, x, y, z, yaw, w, h, bg, size) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: sign(text, 512, Math.round(512 * h / w), bg, '#fff', size), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0, emissiveMap: null }));
    m.material.emissiveMap = m.material.map;
    m.position.set(x, y, z); m.rotation.y = yaw;
    group.add(m);
    ctx.nightMaterials.push({ mat: m.material, max: 0.9 });
    return m;
  };
  {
    const d = docks.yeouido, yaw = Math.atan2(d.wx, d.wz);
    const at = (ct, cw) => [d.x + d.tx * ct + d.wx * cw, d.z + d.tz * ct + d.wz * cw];
    let p = at(-8, 2.72); addSign('여의도 선착장', p[0], d.deckY + 6.0, p[1], yaw, 9, 1.1, '#1d3a5c', 64);
    p = at(-11, 2.72); addSign('한강 편의점', p[0], d.deckY + 3.05, p[1], yaw, 5.2, 0.7, '#2a7a4a', 70);
    p = at(-4.6, 2.72); addSign('즉석라면 · 간식 · 음료', p[0], d.deckY + 3.05, p[1], yaw, 6.2, 0.7, '#c0462a', 62);
    const b = docks.banpo, yb = Math.atan2(b.wx, b.wz);
    p = [b.x + b.tx * -4 + b.wx * 0.15, b.z + b.tz * -4 + b.wz * 0.15];
    addSign('반포 선착장', p[0], b.deckY + 2.15, p[1], yb, 5, 0.8, '#1d3a5c', 80);
  }

  // ── 한강버스 시간표(선착장 입구): 다음 배가 언제 오는지 1초마다 고쳐 쓴다
  const boards = Object.entries(docks).map(([key, d]) => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 400;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
    const bx = d.gang.x + d.tx * 2.7 - d.wx * 0.8, bz = d.gang.z + d.tz * 2.7 - d.wz * 0.8, by = heightAt(bx, bz);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.48), mat);
    m.position.set(bx - d.wx * 0.07, by + 1.75, bz - d.wz * 0.07); m.rotation.y = Math.atan2(-d.wx, -d.wz);
    group.add(m);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.62, 0.1), new THREE.MeshStandardMaterial({ color: 0x1d3a5c, roughness: 0.6 }));
    back.position.set(bx, by + 1.75, bz); back.rotation.y = m.rotation.y; back.castShadow = true;
    group.add(back);
    for (const k of [-0.85, 0.85]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), back.material); post.position.set(bx + d.tx * k, by + 0.5, bz + d.tz * k); group.add(post); }
    ctx.walk.addBox(bx, bz, d.tx, d.tz, 1.0, 0.1, by - 1, by + 3);
    ctx.nightMaterials.push({ mat, max: 0.75 });
    return { key, d, cv, tex, x: bx, z: bz, y: by, last: '' };
  });
  const fmtSec = (s) => (s >= 60 ? `${Math.floor(s / 60)}분 ${String(Math.floor(s % 60)).padStart(2, '0')}초` : `${Math.max(0, Math.ceil(s))}초`);
  const clockAfter = (hour, sec) => { const h = (hour + (sec * 48) / 3600) % 24; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };
  const drawBoard = (b, hour) => {
    const e = api.eta(b.key), other = b.key === 'yeouido' ? '반포' : '여의도';
    const line = e.docked ? `지금 탑승 중 · ${fmtSec(e.sec)} 뒤 출발` : `약 ${fmtSec(e.sec)} 뒤 도착`;
    if (line === b.last) return;
    b.last = line;
    const g = b.cv.getContext('2d'), F = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 512, 400);
    g.fillStyle = '#1d3a5c'; g.fillRect(0, 0, 512, 84);
    g.fillStyle = '#fff'; g.font = `700 44px ${F}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('한강버스 시간표', 256, 44);
    g.fillStyle = '#1d3a5c'; g.font = `700 36px ${F}`; g.fillText(`${b.d.name.replace(' 선착장', '')} → ${other}`, 256, 128);
    g.fillStyle = e.docked ? '#2a7a4a' : '#c0462a'; g.font = `700 38px ${F}`; g.fillText(line, 256, 196);
    g.fillStyle = '#3d3a35'; g.font = `600 30px ${F}`;
    g.fillText(e.docked ? `출발 예정 ${clockAfter(hour, e.sec)}` : `도착 예정 ${clockAfter(hour, e.sec)}`, 256, 250);
    g.fillStyle = '#6b665e'; g.font = `500 25px ${F}`;
    g.fillText(`다음 배 ${clockAfter(hour, e.next)} · 소요 약 ${fmtSec(tripSec)}`, 256, 304);
    g.fillText('배가 들어오면 부잔교 끝에서 E', 256, 352);
    b.tex.needsUpdate = true;
  };
  let boardT = 0;

  // ── 한강버스 2척
  const busGeo = busGeometry();
  const buses = [0, 1].map((i) => {
    const m = new THREE.Mesh(busGeo, vmat);
    m.castShadow = true;
    m.scale.setScalar(BUS_SCALE);
    group.add(m);
    return {
      mesh: m, s: i === 0 ? 0 : busRoute.total, dir: i === 0 ? 1 : -1, speed: 0, state: 'dock', wait: i === 0 ? 18 : 28,
      dock: i === 0 ? 'yeouido' : 'banpo', x: 0, z: 0, yaw: 0, wake: new Wake(ctx, 3.6, 12), deckY: 2.93 * BUS_SCALE,
    };
  });
  // ── 유람선
  const cruise = { mesh: new THREE.Mesh(cruiseGeometry(), vmat), s: 40, dir: 1, speed: 4.2, wake: new Wake(ctx, 3.6, 12), x: 0, z: 0, yaw: 0 };
  cruise.mesh.castShadow = true;
  group.add(cruise.mesh);

  // ── 오리배: 떠다니는 것 6척 + 선착장에 묶인(탈 수 있는) 3척
  const duckGeo = duckGeometry();
  const duckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  const cx = duckDock.x + duckDock.wx * 46, cz = duckDock.z + duckDock.wz * 46;
  const ducks = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(duckGeo, duckMat);
    m.castShadow = true;
    group.add(m);
    const moored = i >= 6;
    const k = i - 7;
    ducks.push({
      mesh: m, moored, ridden: false,
      x: moored ? duckDock.x + duckDock.wx * 8.5 + duckDock.tx * (k * 2.9) + duckDock.tx * (k === 0 ? 3.1 : k * 0.4) : cx + (rnd() - 0.5) * 70,
      z: moored ? duckDock.z + duckDock.wz * 8.5 + duckDock.tz * (k * 2.9) + duckDock.tz * (k === 0 ? 3.1 : k * 0.4) : cz + (rnd() - 0.5) * 50,
      yaw: moored ? Math.atan2(duckDock.wx, duckDock.wz) : rnd() * 6.28, v: 0, turn: 0, t: rnd() * 10, ph: rnd() * 6,
      home: null, wake: null,
    });
    const d = ducks[i];
    d.home = { x: d.x, z: d.z, yaw: d.yaw };
  }
  ctx.busList = buses;
  const rideWake = new Wake(ctx, 0.9, 5);
  ctx.scene.add(group);

  const o = {}, f = {};
  const place = (b, x, z, yaw, t, amp, y0 = 0) => {
    b.x = x; b.z = z; b.yaw = yaw;
    b.mesh.position.set(x, y0 + Math.sin(t * 1.1 + x * 0.1) * amp, z);
    b.mesh.rotation.set(Math.sin(t * 0.9 + z * 0.1) * amp * 0.25, yaw, Math.sin(t * 1.3 + x * 0.2) * amp * 0.5, 'YXZ');
  };

  const tripSec = busRoute.total / 27 + 6;
  const api = {
    docks, buses, ducks, duckDock, cruise, boards, fmtSec,
    // 선착장 key에 다음 배가 오기까지(또는 정박 중이면 떠나기까지) 남은 시간(초)
    eta(key) {
      const times = buses.map((b) => {
        if (b.dock === key) return { docked: true, sec: Math.max(0, b.wait) };
        if (b.state === 'sail') {
          const to = b.dir > 0 ? 'banpo' : 'yeouido', t1 = Math.abs((b.dir > 0 ? busRoute.total : 0) - b.s) / 27 + 5;
          return { docked: false, sec: to === key ? t1 : t1 + (to === 'yeouido' ? 24 : 18) + tripSec };
        }
        return { docked: false, sec: Math.max(0, b.wait) + tripSec };
      }).sort((p, q) => (p.docked === q.docked ? p.sec - q.sec : p.docked ? -1 : 1));
      const e = times[0];
      e.next = e.docked ? (times[1] ? times[1].sec : e.sec + tripSec * 2) : (times[1] ? times[1].sec : e.sec + tripSec * 2);
      return e;
    },
    // 플레이어가 탄 오리배는 조종 직후 바로 놓는다(한 프레임 늦게 따라와 떨리는 것을 막는다)
    placeRidden(d, t) {
      d.mesh.position.set(d.x, Math.sin(t * 1.1) * 0.02, d.z);
      d.mesh.rotation.set(Math.sin(t * 0.8) * 0.012, d.yaw, Math.sin(t * 1.0) * 0.018, 'YXZ');
    },
    // 물 위에서 배가 갈 수 있는 곳인지
    navigable(x, z) { sampleField(x, z, f); return f.d < -3.2; },

    update(dt, env) {
      const t = ctx.uniforms.uTime.value;
      // 한강버스
      for (const b of buses) {
        const end = b.dir > 0 ? busRoute.total : 0;
        if (b.state === 'dock') {
          b.wait -= dt;
          b.speed = 0;
          if (b.wait <= 0) { b.state = 'sail'; b.dock = null; }
        } else {
          const remain = Math.abs(end - b.s), gone = b.dir > 0 ? b.s : busRoute.total - b.s;
          const vmax = 34 * Math.min(1, 0.1 + remain / 70, 0.1 + gone / 45);
          b.speed = damp(b.speed, vmax, 1.5, dt);
          b.s += b.dir * b.speed * dt;
          if (remain < 0.6) { b.s = end; b.state = 'dock'; b.dock = b.dir > 0 ? 'banpo' : 'yeouido'; b.wait = b.dock === 'yeouido' ? 24 : 18; b.dir = -b.dir; }
        }
        busRoute.at(b.s, o);
        // 우측통행: 진행 방향 오른쪽으로 치우쳐 서로 비켜 간다 (선착장 근처에서는 가운데로)
        const off = 5.5 * Math.min(1, b.s / 40, (busRoute.total - b.s) / 40) * (b.state === 'dock' ? 1 : 1);
        const hx = o.tx * b.dir, hz = o.tz * b.dir;
        const want = b.state === 'dock' ? Math.atan2(docks[b.dock].tx * (b.dock === 'yeouido' ? 1 : -1), docks[b.dock].tz * (b.dock === 'yeouido' ? 1 : -1)) : Math.atan2(hx, hz);
        b.yawS = b.yawS === undefined ? want : dampAngle(b.yawS, want, b.state === 'dock' ? 0.5 : 1.6, dt);
        place(b, o.x - hz * off * (b.state === 'dock' ? 0 : 1), o.z + hx * off * (b.state === 'dock' ? 0 : 1), b.yawS, t, 0.05);
        b.wake.update(dt, b.x - Math.sin(b.yaw) * 10, b.z - Math.cos(b.yaw) * 10, b.speed > 2);
      }
      // 유람선
      {
        const c = cruise;
        c.s += c.dir * c.speed * dt;
        if (c.s > cruiseRoute.total - 2) { c.dir = -1; } else if (c.s < 2) { c.dir = 1; }
        cruiseRoute.at(c.s, o);
        const hx = o.tx * c.dir, hz = o.tz * c.dir, want = Math.atan2(hx, hz);
        c.yawS = c.yawS === undefined ? want : dampAngle(c.yawS, want, 0.4, dt);
        const ends = Math.min(1, c.s / 30, (cruiseRoute.total - c.s) / 30);
        place(c, o.x - hz * 7 * ends, o.z + hx * 7 * ends, c.yawS, t, 0.04, -0.2);
        c.wake.update(dt, c.x - Math.sin(c.yaw) * 13, c.z - Math.cos(c.yaw) * 13, true);
      }
      // 오리배
      for (const d of ducks) {
        if (d.ridden) continue;
        if (!d.moored) {
          d.t -= dt;
          if (d.t <= 0) { d.t = 4 + Math.random() * 8; d.turn = (Math.random() - 0.5) * 0.5; d.v = Math.random() < 0.3 ? 0 : 0.5 + Math.random() * 0.6; }
          // 구역 밖으로 나가거나 물가에 가까워지면 중심 쪽으로 돈다
          const far = Math.hypot(d.x - cx, d.z - cz) > 42 || !api.navigable(d.x + Math.sin(d.yaw) * 6, d.z + Math.cos(d.yaw) * 6);
          if (far) d.yaw = dampAngle(d.yaw, Math.atan2(cx - d.x, cz - d.z), 0.8, dt); else d.yaw += d.turn * dt;
          d.x += Math.sin(d.yaw) * d.v * dt; d.z += Math.cos(d.yaw) * d.v * dt;
        }
        place(d, d.x, d.z, d.yaw, t + d.ph, 0.04);
      }
      const rd = ducks.find((d) => d.ridden);
      rideWake.update(dt, rd ? rd.x - Math.sin(rd.yaw) * 1.6 : 0, rd ? rd.z - Math.cos(rd.yaw) * 1.6 : 0, !!rd && Math.abs(rd.v) > 0.5);
      boardT -= dt;
      if (boardT <= 0) { boardT = 0.5; for (const b of boards) drawBoard(b, env.hour); }
    },
  };
  return api;
}
