// NPC: 산책·러닝·자전거·커플·강아지 산책·피크닉·버스킹·연날리기.
// 사람은 한 덩어리 지오메트리를 GPU에서 팔다리만 돌려 그리는 인스턴싱이라 수백 명도 드로우콜 하나다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from '../core/geobuilder.js';
import { mulberry32, clamp, lerp, smoothstep } from '../core/math.js';
import { injectedMaterial } from '../world/grass.js';
import { bankN, bankS, ISLANDS, ZONE, sampleField, heightAt, pathSDF, PLAZA_POINTS, NODEUL_FRAME } from '../world/field.js';
import { WALK_X_MIN, WALK_X_MAX, toWorld } from '../world/geo.js';

const MAXN = 600;

function tagged(geo, part, slot, x, y, z, sx = 1, sy = 1, sz = 1) {
  const g = geo.toNonIndexed ? geo : geo;
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const ps = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { ps[i * 2] = part; ps[i * 2 + 1] = slot; }
  g.setAttribute('aPS', new THREE.BufferAttribute(ps, 2));
  g.deleteAttribute('uv');
  return g;
}

// 치비풍 사람: 큰 머리, 짧은 팔다리. part 7 = 여자만, 8 = 남자만 보이는 부분.
const HIP = 0.5, SHOULDER = 0.9;
function humanGeometry() {
  const S = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
  const parts = [
    tagged(new THREE.CapsuleGeometry(0.17, 0.2, 3, 8), 0, 1, 0, 0.72, 0, 1.1, 1, 0.85),
    tagged(S(0.25, 12, 9), 1, 0, 0, 1.2, 0, 1, 0.95, 0.97),
    tagged(new THREE.SphereGeometry(0.268, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), 1, 3, 0, 1.212, -0.022),
    tagged(S(0.03, 6, 5), 1, 6, 0.095, 1.19, 0.228, 1, 1.35, 0.5), tagged(S(0.03, 6, 5), 1, 6, -0.095, 1.19, 0.228, 1, 1.35, 0.5),
    tagged(S(0.042, 6, 5), 1, 7, 0.155, 1.125, 0.192, 1, 0.55, 0.4), tagged(S(0.042, 6, 5), 1, 7, -0.155, 1.125, 0.192, 1, 0.55, 0.4),
    tagged(new THREE.CapsuleGeometry(0.052, 0.24, 2, 6), 2, 1, 0.25, 0.74, 0), tagged(S(0.056, 6, 5), 2, 0, 0.25, 0.55, 0),
    tagged(new THREE.CapsuleGeometry(0.052, 0.24, 2, 6), 3, 1, -0.25, 0.74, 0), tagged(S(0.056, 6, 5), 3, 0, -0.25, 0.55, 0),
    tagged(new THREE.CapsuleGeometry(0.078, 0.26, 2, 6), 4, 2, 0.088, 0.29, 0),
    tagged(new THREE.CapsuleGeometry(0.078, 0.26, 2, 6), 5, 2, -0.088, 0.29, 0),
    tagged(new THREE.BoxGeometry(0.125, 0.08, 0.22), 4, 4, 0.088, 0.04, 0.035),
    tagged(new THREE.BoxGeometry(0.125, 0.08, 0.22), 5, 4, -0.088, 0.04, 0.035),
    tagged(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5), 6, 4, 0.22, 1.32, 0.12),
    tagged(new THREE.ConeGeometry(0.62, 0.2, 10, 1, true), 6, 5, 0.22, 1.84, 0.12),
    // 여자: 단발 뒷머리, 양갈래, 치마, 머리핀
    tagged(S(0.24, 10, 8), 7, 3, 0, 1.13, -0.085, 1.06, 1.1, 0.72),
    tagged(S(0.095, 7, 6), 7, 3, 0.26, 1.38, -0.03), tagged(S(0.095, 7, 6), 7, 3, -0.26, 1.38, -0.03),
    tagged(new THREE.CylinderGeometry(0.18, 0.29, 0.24, 10), 7, 1, 0, 0.5, 0, 1, 1, 0.9),
    tagged(S(0.034, 6, 5), 7, 7, 0.19, 1.38, 0.12),
    // 남자: 모자와 챙, 짧은 뒷머리
    tagged(new THREE.SphereGeometry(0.278, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.4), 8, 2, 0, 1.228, -0.01),
    tagged(new THREE.BoxGeometry(0.3, 0.03, 0.17), 8, 2, 0, 1.31, 0.285),
    tagged(S(0.225, 9, 7), 8, 3, 0, 1.14, -0.065, 1.04, 0.9, 0.7),
  ];
  return mergeGeometries(parts);
}

// 강아지·고양이 공용: part 7·10 = 강아지만, 8·11 = 고양이만. 꼬리(9 이상)는 살랑거린다.
function petGeometry() {
  const S = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
  const leg = (p, x, z) => tagged(new THREE.CapsuleGeometry(0.042, 0.13, 2, 6), p, 1, x, 0.12, z);
  const parts = [
    tagged(S(0.2, 10, 8), 0, 1, 0, 0.33, -0.02, 0.9, 0.85, 1.55),
    tagged(S(0.17, 10, 8), 0, 1, 0, 0.5, 0.27, 1.05, 0.95, 0.95),
    tagged(S(0.026, 6, 5), 0, 6, 0.07, 0.53, 0.415, 1, 1.3, 0.5), tagged(S(0.026, 6, 5), 0, 6, -0.07, 0.53, 0.415, 1, 1.3, 0.5),
    leg(4, 0.085, 0.17), leg(4, -0.085, 0.17), leg(5, 0.085, -0.2), leg(5, -0.085, -0.2),
    // 강아지: 주둥이, 코, 늘어진 귀, 목줄, 짧은 꼬리
    tagged(S(0.075, 8, 6), 7, 0, 0, 0.46, 0.41, 1, 0.8, 1), tagged(S(0.026, 6, 5), 7, 6, 0, 0.485, 0.485),
    tagged(S(0.075, 7, 6), 7, 2, 0.155, 0.53, 0.25, 0.45, 1.25, 0.8), tagged(S(0.075, 7, 6), 7, 2, -0.155, 0.53, 0.25, 0.45, 1.25, 0.8),
    tagged(new THREE.TorusGeometry(0.115, 0.022, 5, 10), 7, 7, 0, 0.42, 0.14),
    tagged(new THREE.CapsuleGeometry(0.035, 0.14, 2, 6).rotateX(-0.7), 10, 1, 0, 0.47, -0.36),
    // 고양이: 뾰족한 귀, 분홍 코, 긴 꼬리
    tagged(new THREE.ConeGeometry(0.06, 0.12, 4), 8, 1, 0.095, 0.675, 0.27), tagged(new THREE.ConeGeometry(0.06, 0.12, 4), 8, 1, -0.095, 0.675, 0.27),
    tagged(new THREE.ConeGeometry(0.03, 0.07, 4), 8, 7, 0.095, 0.665, 0.29), tagged(new THREE.ConeGeometry(0.03, 0.07, 4), 8, 7, -0.095, 0.665, 0.29),
    tagged(S(0.02, 6, 5), 8, 7, 0, 0.485, 0.435), tagged(S(0.05, 6, 5), 8, 0, 0, 0.455, 0.405, 1.4, 0.7, 0.7),
    tagged(new THREE.CapsuleGeometry(0.028, 0.34, 2, 6).rotateX(-0.45), 11, 1, 0, 0.56, -0.4),
  ];
  return mergeGeometries(parts);
}

const NPC_VERT_PRE = /* glsl */ `
attribute vec2 aPS;
attribute vec4 aXf; // x, y, z, 방향
attribute vec4 aAn; // 걸음 위상, 진폭, 자세(0 걷기 1 앉기 2 자전거 3 연주), 크기
attribute vec3 aC1, aC2;
attribute float aSex; // 사람: 1 여자 / 0 남자. 동물: 1 강아지 / 0 고양이
uniform float uHip, uShoulder, uRainOn, uPet;
varying vec3 vGCol;
`;

const NPC_VERT_MAIN = /* glsl */ `
  vec3 np = position, nn = normal;
  float part = aPS.x, slot = aPS.y;
  float ph = aAn.x, amp = aAn.y, pose = aAn.z;
  float wave = step(9.5, pose); pose = mod(pose, 10.0); // 10 이상이면 손을 흔드는 중
  float sw = sin(ph);
  float ang = 0.0, pivY = 0.0;
  // 성별(또는 강아지/고양이)에 따라 한쪽 부분만 남긴다
  bool onlyA = (part > 6.5 && part < 7.5) || (part > 9.5 && part < 10.5);
  bool onlyB = (part > 7.5 && part < 8.5) || part > 10.5;
  if ((onlyA && aSex < 0.5) || (onlyB && aSex > 0.5)) np = vec3(0.0, uHip + 0.1, 0.0);
  if (uPet < 0.5) {
    if (part > 1.5 && part < 3.5) {
      pivY = uShoulder;
      float sg = part < 2.5 ? 1.0 : -1.0;
      ang = sg * sw * 0.55 * amp;
      if (pose > 0.5 && pose < 1.5) ang = -0.35;
      else if (pose > 1.5 && pose < 2.5) ang = -1.05;
      else if (pose > 2.5 && pose < 3.5) ang = -0.9 + (sg > 0.0 ? 0.25 * sin(uTime * 7.0 + ph) : 0.0);
      else if (pose > 3.5) ang = -2.7 + 0.35 * sin(uTime * 6.0 + ph * 3.0); // 환호(두 팔 번쩍)
      if (wave > 0.5 && uPet < 0.5 && sg > 0.0) ang = -2.75 + 0.4 * sin(uTime * 11.0 + ph);
    } else if (part > 3.5 && part < 5.5) {
      pivY = uHip;
      float sg = part < 4.5 ? 1.0 : -1.0;
      ang = -sg * sw * 0.6 * amp;
      if (pose > 0.5 && pose < 1.5) ang = -1.5;
      else if (pose > 1.5 && pose < 2.5) ang = -0.95 - 0.45 * sg * sw;
    }
  } else {
    if (part > 3.5 && part < 5.5) { pivY = uHip; ang = (part < 4.5 ? 1.0 : -1.0) * sw * 0.7 * amp; }
    if (part > 8.5) np.x += sin(uTime * 12.0 + aXf.w * 3.0) * mix(0.12, 0.6, aSex) * max(0.0, -np.z - 0.22);
  }
  if (ang != 0.0) {
    float c = cos(ang), s = sin(ang);
    np.y -= pivY;
    np.yz = vec2(np.y * c - np.z * s, np.y * s + np.z * c);
    np.y += pivY;
    nn.yz = vec2(nn.y * c - nn.z * s, nn.y * s + nn.z * c);
  }
  // 동물이 앉을 때: 앞다리는 세우고 몸을 일으킨다
  if (uPet > 0.5 && pose > 0.5 && !(part > 3.5 && part < 4.5)) {
    float c = cos(-0.5), s = sin(-0.5);
    vec2 q = np.yz - vec2(0.1, 0.17);
    np.yz = vec2(q.x * c - q.y * s, q.x * s + q.y * c) + vec2(0.1, 0.17);
    nn.yz = vec2(nn.y * c - nn.z * s, nn.y * s + nn.z * c);
    if (part > 4.5 && part < 5.5) np.y = max(np.y, 0.03);
  }
  // 우산: 비가 올 때 걷는 사람만 편다
  if (part > 5.5 && part < 6.5) np = mix(vec3(0.2, 0.9, 0.1), np, uRainOn * step(pose, 0.5));
  np.y += abs(cos(ph)) * 0.03 * amp;
  float cy = cos(aXf.w), sy = sin(aXf.w);
  vec3 gPos = vec3(np.x * cy + np.z * sy, np.y, -np.x * sy + np.z * cy) * aAn.w + aXf.xyz;
  vec3 objectNormal = vec3(nn.x * cy + nn.z * sy, nn.y, -nn.x * sy + nn.z * cy);
  vec3 skin = mix(vec3(0.83, 0.55, 0.4), aC1 * 1.25 + 0.12, uPet), shoe = vec3(0.75, 0.73, 0.68);
  float hh = fract(aC1.r * 37.1 + aC1.g * 17.3 + aC2.b * 29.7);
  vec3 hair = hh < 0.6 ? vec3(0.025, 0.02, 0.018) : hh < 0.86 ? vec3(0.1, 0.05, 0.025) : vec3(0.27, 0.15, 0.07);
  vGCol = slot < 0.5 ? skin : slot < 1.5 ? aC1 : slot < 2.5 ? aC2 : slot < 3.5 ? hair : slot < 4.5 ? shoe : slot < 5.5 ? aC1 * 0.7 + 0.12 : slot < 6.5 ? vec3(0.012) : vec3(0.9, 0.36, 0.38);
`;

const JACKETS = [0xf2c2cf, 0xcfe0f2, 0xf2e2b0, 0xd8c8f0, 0xc6ad86, 0x2b3a55, 0x1f1f22, 0x7c7f86, 0x6b6f4a, 0x7a2f33, 0xc49a3a, 0xe6e2d8, 0x4a6a8a, 0x556b4a, 0xd9a0a8, 0x8a5a3c, 0xb8c2c8];
const PANTS = [0x1c1d22, 0x2b3142, 0x55575c, 0xb8a888, 0x3a4a66, 0x2a2a2a];
const SPORT = [0x9be03a, 0xff7a2a, 0x3ab8ff, 0xff4a7a, 0xf2f2f2, 0x30d0b0];
const DOGS = [0xd9b98a, 0xf2efe8, 0x4a3a2c, 0x8a6a48, 0x2a2622, 0xc9c2b6];
const CATS = [0xe9a04a, 0xf2efe8, 0x2a2622, 0x8a8a8e, 0xd9c2a0, 0x5a4a3c];
const COLLARS = [0xd9412a, 0x3a8ad9, 0xe9c23a, 0x4aa86a];

// 시간대별 인원 비율
function density(kind, h, rain) {
  const seg = (pts) => { for (let i = 0; i < pts.length - 1; i++) if (h >= pts[i][0] && h < pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (h - pts[i][0]) / (pts[i + 1][0] - pts[i][0])); return pts[0][1]; };
  let v;
  switch (kind) {
    case 'run': v = seg([[0, 0.08], [5, 0.3], [6, 1], [8, 0.7], [10, 0.3], [16.5, 0.35], [18, 0.85], [21, 0.8], [23, 0.3], [24, 0.08]]); break;
    case 'bike': v = seg([[0, 0.1], [5, 0.3], [7, 0.6], [12, 0.6], [17, 0.95], [19.5, 0.7], [22, 0.35], [24, 0.1]]); break;
    case 'couple': v = seg([[0, 0.25], [2, 0.05], [8, 0.1], [12, 0.35], [16.5, 0.8], [18, 1], [22, 0.9], [24, 0.25]]); break;
    case 'dog': v = seg([[0, 0.05], [5.5, 0.3], [7, 0.85], [10, 0.5], [16, 0.6], [18, 1], [21, 0.5], [24, 0.05]]); break;
    case 'picnic': v = seg([[0, 0], [9, 0], [11.5, 0.55], [15, 0.7], [17.5, 1], [20, 0.7], [22.5, 0.15], [24, 0]]); break;
    case 'busk': v = h > 16.3 && h < 22.2 ? 1 : 0; break;
    case 'kite': v = h > 8.5 && h < 18.2 ? 1 : 0; break;
    case 'photo': return h > 9 && h < 23.5 ? (rain > 0.25 ? 0.3 : 1) : 0.15;
    case 'vendor': return h > 7 && h < 23.2 ? 1 : 0;
    case 'fw': return h > 19.45 && h < 21.3 ? (rain > 0.25 ? 0.25 : 1) : 0;
    default: v = seg([[0, 0.12], [5, 0.15], [7, 0.45], [11, 0.6], [16, 0.8], [18, 1], [20.5, 0.8], [22.5, 0.4], [24, 0.12]]);
  }
  if (rain > 0.25) v *= kind === 'picnic' || kind === 'busk' || kind === 'kite' ? 0 : kind === 'bike' ? 0.15 : 0.4;
  return v;
}

export function buildNPCs(ctx) {
  const rnd = mulberry32(555);
  const u = ctx.uniforms;
  const col = new THREE.Color();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const colArr = (hex) => { col.setHex(hex); return [col.r, col.g, col.b]; };

  const api0 = {};
  // ── 경로
  const paths = [];
  for (const bank of [bankN, bankS]) {
    const north = bank === bankN;
    const a = bank.uAtX(WALK_X_MIN + 30), b = bank.uAtX(WALK_X_MAX - 30);
    paths.push({
      u0: Math.min(a, b), u1: Math.max(a, b), closed: false, bank: true,
      at(uu, o) { bank.at(uu, o); o.nx = north ? o.tz : -o.tz; o.nz = north ? -o.tx : o.tx; return o; },
    });
  }
  const nodeul = ISLANDS.find((i) => i.zone === ZONE.NODEUL).poly;
  paths.push({
    u0: 0, u1: nodeul.total, closed: true, bank: false,
    at(uu, o) { nodeul.at(((uu % nodeul.total) + nodeul.total) % nodeul.total, o); o.nx = -o.tz * nodeul.orient; o.nz = o.tx * nodeul.orient; return o; },
  });

  // ── 인스턴스 데이터
  const list = []; // 모든 사람 NPC
  const dogs = [];
  const bikes = [];
  const mk = (o) => { const n = { x: 0, y: 0, z: 0, yaw: 0, phase: rnd() * 6.28, amp: 0, pose: 0, scale: 0.94 + rnd() * 0.12, sex: rnd() < 0.5 ? 1 : 0, shown: false, vis: 0, rank: rnd(), c1: colArr(pick(JACKETS)), c2: colArr(pick(PANTS)), ...o }; list.push(n); return n; };
  const o = {};
  const parkU = (p) => { // 넓은 공원일수록 사람이 많이 나오도록
    for (let k = 0; k < 20; k++) { const uu = lerp(p.u0, p.u1, rnd()); p.at(uu, o); if (rnd() < clamp(o.w / 90, 0.25, 1)) return uu; }
    return lerp(p.u0, p.u1, rnd());
  };
  const mover = (kind, p, extra = {}) => {
    const dir = rnd() < 0.5 ? 1 : -1;
    return mk({ kind, path: p, u: p.bank ? parkU(p) : rnd() * p.u1, dir, laneJ: (rnd() - 0.5) * 0.9, side: 0, back: 0, ...extra });
  };
  for (let b = 0; b < 2; b++) {
    const p = paths[b];
    for (let i = 0; i < 38; i++) mover('walk', p, { speed: 1.1 + rnd() * 0.5 });
    for (let i = 0; i < 14; i++) mover('run', p, { speed: 2.9 + rnd() * 1.1, c1: colArr(pick(SPORT)), c2: colArr(0x1c1d22) });
    for (let i = 0; i < 14; i++) { const m = mover('bike', p, { speed: 5.5 + rnd() * 3, pose: 2, c1: colArr(pick(SPORT.concat(JACKETS))) }); bikes.push(m); }
    for (let i = 0; i < 10; i++) { // 커플: 나란히 걷는 두 사람
      const a = mover('couple', p, { speed: 0.95 + rnd() * 0.25, side: -0.3 });
      mk({ kind: 'couple', follow: a, side: 0.3, back: 0, rank: a.rank, sex: 1 - a.sex });
    }
    for (let i = 0; i < 10; i++) { // 강아지 산책
      const a = mover('dog', p, { speed: 1.0 + rnd() * 0.4 });
      dogs.push({ type: 'dog', owner: a, x: 0, y: 0, z: 0, yaw: 0, phase: rnd() * 6, amp: 0, pose: 0, c: colArr(pick(DOGS)), c2: colArr(pick(DOGS)), scale: 0.8 + rnd() * 0.45, mode: 'heel', t: 0, cool: 8 + rnd() * 20, vis: 0, happy: 0, follow: 0 });
    }
    // 러닝크루: 두 줄로 달리는 무리
    const lead = mover('run', p, { speed: 3.3, c1: colArr(pick(SPORT)), c2: colArr(0x1c1d22), rank: 0.3 + rnd() * 0.3 });
    lead.side = -0.35;
    for (let i = 1; i < 8; i++) mk({ kind: 'run', follow: lead, side: i % 2 ? 0.35 : -0.35, back: Math.floor(i / 2) * 1.25, rank: lead.rank, c1: lead.c1, c2: lead.c2, speed: 3.3 });
  }
  for (let i = 0; i < 9; i++) mover('walk', paths[2], { speed: 1.0 + rnd() * 0.4 });
  for (let i = 0; i < 4; i++) { const a = mover('couple', paths[2], { speed: 0.9, side: -0.3 }); mk({ kind: 'couple', follow: a, side: 0.3, back: 0, rank: a.rank }); }

  // ── 고정 무리: 피크닉(돗자리·치킨·그늘막)
  const propsG = [new GeoBuilder(), new GeoBuilder(), new GeoBuilder()];
  const tentG = new GeoBuilder();
  const MATS = [0xd94a3a, 0x3a7ad9, 0xe9c23a, 0x4aa86a, 0xe98a9a, 0xf2efe6];
  const f = {};
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < 36; tries++) {
    const p = paths[rnd() < 0.5 ? 0 : 1];
    const uu = lerp(p.u0, p.u1, rnd());
    p.at(uu, o);
    if (o.w < 48) continue;
    const d = 21 + rnd() * (o.w - 34);
    const x = o.x + o.nx * d, z = o.z + o.nz * d;
    if (pathSDF(x, z) < 5 || ctx.nearBridge(x, z, 6)) continue;
    if ((ctx.trees || []).some((t) => Math.hypot(t.x - x, t.z - z) < 3.5)) continue;
    const y = heightAt(x, z);
    const rank = placed / 36, bucket = Math.min(2, Math.floor(rank * 3));
    const g = propsG[bucket];
    const rot = rnd() * 6.28;
    g.color(pick(MATS));
    g.box(x, y + 0.02, z, 2.0, 0.03, 1.5, rot);
    g.color(0xd8b070); g.box(x + Math.cos(rot) * 0.1, y + 0.1, z - Math.sin(rot) * 0.1, 0.34, 0.14, 0.34, rot + 0.3);
    g.color(0xc0c4c8); g.cylinder(x + 0.35, y + 0.03, z + 0.2, 0.035, 0.035, 0.12, 6); g.cylinder(x - 0.3, y + 0.03, z + 0.3, 0.035, 0.035, 0.12, 6);
    const n = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * 6.28 + 0.5;
      mk({ kind: 'picnic', static: true, x: x + Math.cos(a) * 0.75, y: y - 0.4, z: z + Math.sin(a) * 0.75, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), pose: 1, rank: rank * 0.999 });
    }
    if (rnd() < 0.36) { // 그늘막 텐트
      tentG.color(pick([0x7fb0c8, 0xe9a03a, 0x8ac06a, 0xd9d2c2]));
      const tx = x + Math.cos(rot) * 2.4, tz = z - Math.sin(rot) * 2.4, R = 1.25, S = 8;
      ctx.walk.addCircle(tx, tz, 1.05);
      for (let i = 0; i < S; i++) {
        const a0 = (i / S) * Math.PI * 1.5 + rot, a1 = ((i + 1) / S) * Math.PI * 1.5 + rot;
        for (let j = 0; j < 3; j++) {
          const e0 = (j / 3) * 1.45, e1 = ((j + 1) / 3) * 1.45;
          const P = (a, e) => [tx + Math.cos(a) * Math.cos(e) * R, y + Math.sin(e) * R * 1.05, tz + Math.sin(a) * Math.cos(e) * R];
          tentG.quad(P(a0, e0), P(a1, e0), P(a1, e1), P(a0, e1), [Math.cos(a0), 0.5, Math.sin(a0)]);
        }
      }
    }
    placed++;
  }
  const propMeshes = propsG.map((g) => { const m = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); m.receiveShadow = true; ctx.scene.add(m); return m; });
  // 그늘막 천은 바람에 살짝 부푼다
  const tentMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  tentMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: u.uTime, uWind: u.uWind, uGust: u.uGust });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind, uGust;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normal * sin(uTime * 3.1 + position.x * 2.3 + position.z * 1.7 + position.y * 3.0) * 0.035 * (0.3 + uWind + uGust);');
  };
  const tents = new THREE.Mesh(tentG.build(), tentMat);
  tents.castShadow = true;
  ctx.scene.add(tents);

  // ── 버스킹(연주자 + 구경꾼)
  const F = NODEUL_FRAME;
  const buskSpots = [
    { x: PLAZA_POINTS[0].x, z: PLAZA_POINTS[0].z + 6 },
    { x: PLAZA_POINTS[3].x - 4, z: PLAZA_POINTS[3].z },
    { x: F.cx + F.ax * -26 + F.bx * 10, z: F.cz + F.az * -26 + F.bz * 10 },
  ];
  const guitarG = new GeoBuilder();
  for (const s of buskSpots) {
    s.y = heightAt(s.x, s.z);
    s.yaw = rnd() * 6.28;
    mk({ kind: 'busk', static: true, x: s.x, y: s.y, z: s.z, yaw: s.yaw, pose: 3, rank: 0, sex: 0, c1: colArr(0x2a2a2e) });
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    guitarG.color(0xa8662e); guitarG.box(s.x + fx * 0.22, s.y + 0.7, s.z + fz * 0.22, 0.36, 0.42, 0.1, s.yaw);
    guitarG.color(0x3a2a1e); guitarG.beam([s.x + fx * 0.22, s.y + 0.75, s.z + fz * 0.22], [s.x + fx * 0.22 + fz * 0.6, s.y + 0.95, s.z + fz * 0.22 - fx * 0.6], 0.05, 0.05);
    guitarG.color(0x222222); guitarG.box(s.x - fz * 0.9, s.y + 0.3, s.z + fx * 0.9, 0.4, 0.6, 0.35, s.yaw); // 앰프
    ctx.walk.addCircle(s.x - fz * 0.9, s.z + fx * 0.9, 0.25);
    ctx.walk.addCircle(s.x, s.z, 0.3);
    const n = 7 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const a = s.yaw + (rnd() - 0.5) * 2.2, r = 3 + rnd() * 2.6;
      const ax = s.x + Math.sin(a) * r, az = s.z + Math.cos(a) * r;
      mk({ kind: 'busk', static: true, x: ax, y: heightAt(ax, az), z: az, yaw: Math.atan2(s.x - ax, s.z - az), pose: 0, rank: 0.2 + rnd() * 0.7 });
    }
  }
  const guitars = new THREE.Mesh(guitarG.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  ctx.scene.add(guitars);

  // ── 연 날리는 아이들
  const kites = [];
  for (let tries = 0; tries < 300 && kites.length < 6; tries++) {
    const p = paths[kites.length % 2];
    const uu = lerp(p.u0, p.u1, rnd());
    p.at(uu, o);
    if (o.w < 56) continue;
    const d = 24 + rnd() * (o.w - 40);
    const x = o.x + o.nx * d, z = o.z + o.nz * d;
    if (pathSDF(x, z) < 6 || ctx.nearBridge(x, z, 40)) continue;
    const n = mk({ kind: 'kite', static: true, x, y: heightAt(x, z), z, yaw: 0, pose: 3, scale: 0.68, rank: 0, c1: colArr(pick(SPORT)) });
    kites.push({ n, col: pick([0xff5a3a, 0x3a9aff, 0xffd23a, 0x5ad06a]), ph: rnd() * 6 });
  }
  const kitePos = new Float32Array(kites.length * 6);
  const kiteLineGeo = new THREE.BufferGeometry();
  kiteLineGeo.setAttribute('position', new THREE.BufferAttribute(kitePos, 3));
  const kiteLines = new THREE.LineSegments(kiteLineGeo, new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.55 }));
  kiteLines.frustumCulled = false;
  ctx.scene.add(kiteLines);
  const kiteGeo = new THREE.BufferGeometry();
  kiteGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.7, 0, 0.45, 0, 0, 0, -0.9, 0, -0.45, 0, 0], 3));
  kiteGeo.setIndex([0, 1, 2, 0, 2, 3]);
  kiteGeo.computeVertexNormals();
  const kiteMeshes = kites.map((k) => { const m = new THREE.Mesh(kiteGeo, new THREE.MeshStandardMaterial({ color: k.col, side: THREE.DoubleSide, roughness: 0.7 })); ctx.scene.add(m); return m; });

  // ── 배달원(치킨): 필요할 때만 등장
  const courier = mk({ kind: 'courier', static: true, pose: 0, rank: 2, c1: colArr(0xe9482a), c2: colArr(0x1c1d22), job: null });

  // ── 상인과 손님: 편의점 점원, 푸드트럭 사장님, 오리배 매표원
  {
    const d = ctx.boatPlan.docks.yeouido, at = (ct, cw) => [d.x + d.tx * ct + d.wx * cw, d.z + d.tz * ct + d.wz * cw];
    const face = (dx, dz) => Math.atan2(dx, dz);
    const apron = colArr(0x2a7a4a);
    let q = at(-4, -4.15);
    api0.clerk = mk({ kind: 'vendor', static: true, x: q[0], y: d.deckY, z: q[1], yaw: face(d.wx, d.wz), pose: 0, rank: 0, sex: 1, c1: apron, c2: colArr(0x1c1d22) });
    q = at(-8.9, 0.9); mk({ kind: 'vendor', static: true, x: q[0], y: d.deckY, z: q[1], yaw: face(-d.tx, -d.tz), rank: 0 });
    q = at(-12.6, -2.6); mk({ kind: 'vendor', static: true, x: q[0], y: d.deckY, z: q[1], yaw: face(-d.tx, -d.tz), rank: 0 });
    q = at(-5.4, 0.9); mk({ kind: 'vendor', static: true, x: q[0], y: d.deckY, z: q[1], yaw: face(d.wx, d.wz), pose: 3, rank: 0 }); // 라면 끓이는 손님
    const t = ctx.facilityPlan.truck, ty = heightAt(t.x, t.z);
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), sx = Math.cos(t.yaw), sz = -Math.sin(t.yaw);
    mk({ kind: 'vendor', static: true, x: t.x - fx * 0.5 - sx * 0.1, y: ty + 0.62, z: t.z - fz * 0.5 - sz * 0.1, yaw: face(sx, sz), pose: 3, rank: 0, sex: 0, c1: colArr(0xc0462a), c2: colArr(0x1c1d22) });
    for (const k of [-1.3, 1.2]) mk({ kind: 'vendor', static: true, x: t.x + sx * 3.0 + fx * k, y: ty, z: t.z + sz * 3.0 + fz * k, yaw: face(-sx, -sz), rank: 0 });
    const dk = ctx.boatPlan.duckDock;
    const dx0 = dk.g0[0] + dk.tx * 2.4, dz0 = dk.g0[1] + dk.tz * 2.4;
    mk({ kind: 'vendor', static: true, x: dx0, y: heightAt(dx0, dz0), z: dz0, yaw: face(-dk.wx, -dk.wz), rank: 0, sex: 0, c1: colArr(0xe9c23a), c2: colArr(0x2b3142) });
    ctx.walk.addCircle(dx0, dz0, 0.3);
  }

  // ── 불꽃놀이 구경꾼(여의도 물가와 건너편 강변)
  const fwSite = (() => {
    const X = toWorld(0, 126.9412).x, a = bankN.at(bankN.uAtX(X)), b = bankS.at(bankS.uAtX(X));
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  })();
  ctx.fwSite = fwSite;
  for (const [pi, cnt] of [[1, 130], [0, 40]]) {
    const p = paths[pi], bank = pi === 1 ? bankS : bankN;
    const ua = bank.uAtX(toWorld(0, 126.9378).x), ub = bank.uAtX(toWorld(0, 126.9448).x);
    for (let i = 0; i < cnt; i++) {
      p.at(lerp(ua, ub, rnd()), o);
      const d = rnd() < 0.6 ? 1.6 + rnd() * 3.6 : 9.6 + rnd() * 2.2;
      const x = o.x + o.nx * d, z = o.z + o.nz * d;
      const r = rnd(), sit = r < 0.3;
      mk({ kind: 'fw', static: true, x, y: heightAt(x, z) - (sit ? 0.4 : 0), z, yaw: Math.atan2(fwSite.x - x, fwSite.z - z) + (rnd() - 0.5) * 0.3, pose: sit ? 1 : r > 0.82 ? 4 : 0, rank: rnd() * 0.99 });
    }
  }

  // ── 길고양이: 공원 곳곳에서 앉아 있거나 어슬렁거린다
  for (let tries = 0; tries < 600 && dogs.filter((d) => d.type === 'cat').length < 20; tries++) {
    const p = paths[tries % 2];
    p.at(lerp(p.u0, p.u1, rnd()), o);
    if (o.w < 26) continue;
    const d = 3 + rnd() * Math.min(40, o.w - 10);
    const x = o.x + o.nx * d, z = o.z + o.nz * d;
    if (pathSDF(x, z) < 1.5 || ctx.nearBridge(x, z, 4)) continue;
    dogs.push({ type: 'cat', owner: null, x, y: heightAt(x, z), z, hx: x, hz: z, tx: x, tz: z, yaw: rnd() * 6.28, phase: rnd() * 6, amp: 0, pose: 1, c: colArr(pick(CATS)), c2: colArr(pick(CATS)), scale: 0.7 + rnd() * 0.2, mode: 'sit', t: 3 + rnd() * 15, vis: 1, happy: 0, follow: 0 });
  }

  // ── 잠수교에서 슈퍼카를 찍는 사람들
  ctx.photoSpots = [];
  {
    const bp = ctx.bridgePlans.find((q) => q.jamsu), J = bp.jamsu;
    for (let i = 0; i < 14; i++) {
      const sv = lerp(J.s0 + 20, J.s1 - 20, (i + rnd() * 0.7) / 14), side = i % 2 ? 1 : -1, a = side * (J.W / 2 - 0.9 - rnd() * 0.6);
      const q = bp.at(sv, a), yaw = Math.atan2(-bp.sx * side + bp.dx * (rnd() - 0.5), -bp.sz * side + bp.dz * (rnd() - 0.5));
      const n = mk({ kind: 'photo', static: true, x: q[0], y: J.y(sv), z: q[1], yaw, pose: 3, rank: rnd() * 0.99 });
      ctx.photoSpots.push({ x: q[0], y: J.y(sv), z: q[1], yaw, n });
    }
  }

  // ── 한강버스 승객(지붕 갑판 좌석에 앉아 있다)
  const BS = 1.5, SEAT_Z = [-5.6, -4.3, -3.0, -1.7, -0.4, 0.9, 2.2, 3.5];
  for (let b = 0; b < 2; b++) for (const sz of SEAT_Z) for (const sx of [-1.75, -1.15, 1.15, 1.75]) {
    if (rnd() < 0.55) continue;
    mk({ kind: 'pass', static: true, bus: b, lx: sx * BS, lz: sz * BS, pose: 1, rank: 0 });
  }

  // ── 배달 오토바이(탑박스에 치킨이 들어 있다)
  const motoG = new GeoBuilder();
  motoG.color(0x1c1c1e);
  for (const z of [-0.62, 0.62]) for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * 6.283, a1 = ((i + 1) / 10) * 6.283;
    motoG.beam([0, 0.3 + Math.sin(a0) * 0.3, z + Math.cos(a0) * 0.3], [0, 0.3 + Math.sin(a1) * 0.3, z + Math.cos(a1) * 0.3], 0.09, 0.07);
  }
  motoG.color(0xe9482a); motoG.box(0, 0.55, 0.05, 0.34, 0.34, 1.0); motoG.box(0, 0.85, 0.5, 0.3, 0.5, 0.12);
  motoG.color(0x1c1c1e); motoG.box(0, 0.78, -0.2, 0.32, 0.1, 0.62); motoG.box(0, 1.12, 0.52, 0.62, 0.04, 0.04);
  motoG.color(0xfff2c0); motoG.box(0, 0.95, 0.6, 0.14, 0.12, 0.05);
  motoG.color(0xf2efe6); motoG.box(0, 1.08, -0.72, 0.5, 0.48, 0.5); // 탑박스
  motoG.color(0xe9482a); motoG.box(0, 1.08, -0.975, 0.36, 0.2, 0.02);
  const moto = new THREE.Mesh(motoG.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }));
  moto.castShadow = true; moto.visible = false;
  ctx.scene.add(moto);
  const boxLid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.6 }));
  boxLid.geometry.translate(0, 0, 0.25);
  moto.add(boxLid); boxLid.position.set(0, 1.33, -0.97);
  const chickenBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xc9a15a, roughness: 0.8 }));
  chickenBox.visible = false;
  ctx.scene.add(chickenBox);

  // ── 사람 인스턴스 메시
  const N = Math.min(MAXN, list.length);
  const hg = new THREE.InstancedBufferGeometry();
  const base = humanGeometry();
  for (const k of ['position', 'normal', 'aPS']) hg.setAttribute(k, base.getAttribute(k));
  hg.setIndex(base.getIndex());
  const aXf = new Float32Array(N * 4), aAn = new Float32Array(N * 4), aC1 = new Float32Array(N * 3), aC2 = new Float32Array(N * 3);
  const aSex = new Float32Array(N);
  list.forEach((n, i) => { if (i < N) { aC1.set(n.c1, i * 3); aC2.set(n.c2, i * 3); aSex[i] = n.sex; } });
  hg.setAttribute('aSex', new THREE.InstancedBufferAttribute(aSex, 1));
  const xfAttr = new THREE.InstancedBufferAttribute(aXf, 4).setUsage(THREE.DynamicDrawUsage);
  const anAttr = new THREE.InstancedBufferAttribute(aAn, 4).setUsage(THREE.DynamicDrawUsage);
  hg.setAttribute('aXf', xfAttr); hg.setAttribute('aAn', anAttr);
  hg.setAttribute('aC1', new THREE.InstancedBufferAttribute(aC1, 3));
  hg.setAttribute('aC2', new THREE.InstancedBufferAttribute(aC2, 3));
  hg.instanceCount = N;
  const rainOn = { value: 0 };
  const humanMat = injectedMaterial(ctx, {
    uniforms: { uHip: { value: HIP }, uShoulder: { value: SHOULDER }, uRainOn: rainOn, uPet: { value: 0 } },
    vertPre: NPC_VERT_PRE, vertMain: NPC_VERT_MAIN, fragPre: 'varying vec3 vGCol;', fragColor: 'diffuseColor.rgb = vGCol;',
    roughness: 0.85, side: THREE.FrontSide,
  });
  const humans = new THREE.Mesh(hg, humanMat);
  humans.frustumCulled = false;
  humans.name = 'npcs';
  ctx.scene.add(humans);

  // ── 강아지 인스턴스 메시
  const DN = dogs.length;
  const dg = new THREE.InstancedBufferGeometry();
  const dbase = petGeometry();
  for (const k of ['position', 'normal', 'aPS']) dg.setAttribute(k, dbase.getAttribute(k));
  dg.setIndex(dbase.getIndex());
  const dXf = new Float32Array(DN * 4), dAn = new Float32Array(DN * 4), dC = new Float32Array(DN * 3);
  const dC2 = new Float32Array(DN * 3), dSex = new Float32Array(DN);
  dogs.forEach((d, i) => { dC.set(d.c, i * 3); dC2.set(d.type === 'dog' ? colArr(pick(DOGS.concat(d.c ? [] : []))) : d.c2, i * 3); dSex[i] = d.type === 'dog' ? 1 : 0; });
  dg.setAttribute('aSex', new THREE.InstancedBufferAttribute(dSex, 1));
  const dxfAttr = new THREE.InstancedBufferAttribute(dXf, 4).setUsage(THREE.DynamicDrawUsage);
  const danAttr = new THREE.InstancedBufferAttribute(dAn, 4).setUsage(THREE.DynamicDrawUsage);
  dg.setAttribute('aXf', dxfAttr); dg.setAttribute('aAn', danAttr);
  dg.setAttribute('aC1', new THREE.InstancedBufferAttribute(dC, 3));
  dg.setAttribute('aC2', new THREE.InstancedBufferAttribute(dC2, 3));
  dg.instanceCount = DN;
  const dogMat = injectedMaterial(ctx, {
    uniforms: { uHip: { value: 0.2 }, uShoulder: { value: 0.2 }, uRainOn: { value: 0 }, uPet: { value: 1 } },
    vertPre: NPC_VERT_PRE, vertMain: NPC_VERT_MAIN, fragPre: 'varying vec3 vGCol;', fragColor: 'diffuseColor.rgb = vGCol;',
    roughness: 0.9, side: THREE.FrontSide,
  });
  const dogMesh = new THREE.Mesh(dg, dogMat);
  dogMesh.frustumCulled = false;
  ctx.scene.add(dogMesh);

  // ── 자전거
  const bg = new GeoBuilder();
  bg.color(0x1c1c1e);
  for (const z of [-0.52, 0.52]) for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * 6.283, a1 = ((i + 1) / 10) * 6.283;
    bg.beam([0, 0.33 + Math.sin(a0) * 0.33, z + Math.cos(a0) * 0.33], [0, 0.33 + Math.sin(a1) * 0.33, z + Math.cos(a1) * 0.33], 0.04, 0.04);
  }
  bg.color(0xf0f0ec);
  bg.beam([0, 0.33, -0.52], [0, 0.82, -0.2], 0.04, 0.04); bg.beam([0, 0.82, -0.2], [0, 0.78, 0.38], 0.05, 0.05);
  bg.beam([0, 0.33, 0.52], [0, 0.98, 0.36], 0.04, 0.04); bg.beam([0, 0.33, -0.52], [0, 0.4, 0.02], 0.04, 0.04); bg.beam([0, 0.4, 0.02], [0, 0.82, -0.2], 0.04, 0.04);
  bg.color(0x3a9a5a);
  bg.box(0, 0.7, -0.55, 0.07, 0.03, 0.42); bg.box(0, 0.7, 0.55, 0.07, 0.03, 0.36);
  bg.color(0x1c1c1e);
  bg.box(0, 0.9, -0.22, 0.14, 0.05, 0.26); bg.box(0, 1.0, 0.36, 0.5, 0.035, 0.035);
  const bikeGeo = bg.build();
  ctx.bikeGeo = bikeGeo;
  const bikeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
  ctx.materials.bike = bikeMat;
  const bikeMesh = new THREE.InstancedMesh(bikeGeo, bikeMat, bikes.length);
  bikeMesh.frustumCulled = false;
  ctx.scene.add(bikeMesh);

  // ── 발밑 그림자(부드러운 원)
  const sg = new THREE.PlaneGeometry(1, 1);
  sg.rotateX(-Math.PI / 2);
  const shadowK = { value: 0.4 };
  const blobs = new THREE.InstancedMesh(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    uniforms: { uK: shadowK },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uK; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 1.6) * uK; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }',
  }), N + DN);
  blobs.frustumCulled = false;
  blobs.layers.set(1);
  blobs.renderOrder = 3;
  ctx.scene.add(blobs);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  let bellCool = 0;
  const api = {
    count: N, dogCount: DN, buskSpots, list, onBell: null, pets: dogs, clerk: api0.clerk, fwSite,
    cheer: 0, // 불꽃이 터질 때 구경꾼이 환호한다(0~1)
    busking: false, nearCount: 0,

    // 치킨 배달: (x,z)까지 걸어와 건네주고 돌아간다
    deliver(x, z, onArrive) {
      const g = {};
      sampleField(x, z, g);
      const e = 1;
      const gx = sampleField(x + e, z, {}).d - sampleField(x - e, z, {}).d, gz = sampleField(x, z + e, {}).d - sampleField(x, z - e, {}).d;
      const gl = Math.hypot(gx, gz) || 1;
      const dist = Math.max(8, Math.min(40, g.w - g.d - 2));
      courier.job = { sx: x + (gx / gl) * dist, sz: z + (gz / gl) * dist, tx: x, tz: z, state: 'come', t: 0, onArrive };
      courier.x = courier.job.sx; courier.z = courier.job.sz; courier.y = heightAt(courier.x, courier.z);
      courier.pose = 2; moto.visible = true;
    },

    // 인사: (x,z) 주변 사람들이 손을 흔들어 답한다. 답한 사람 수를 돌려준다
    greet(x, z, y, r = 8) {
      let c = 0;
      for (let i = 0; i < N; i++) {
        const n = list[i];
        if (n.vis < 0.5 || n.kind === 'bike' || n.kind === 'run') continue;
        const d = Math.hypot(n.x - x, n.z - z), rr = n.kind === 'pass' ? 110 : r;
        if (d < rr && (n.kind === 'pass' || Math.abs(n.y - y) < 3)) { n.wave = 1.6 + Math.random() * 0.8; c++; }
      }
      for (const d of dogs) if (d.type === 'dog' && d.vis > 0.5 && Math.hypot(d.x - x, d.z - z) < 5 && d.happy <= 0) d.happy = 1.2;
      return c;
    },

    update(dt, env, player) {
      const hour = env.hour, rain = env.weather.cur.rain;
      const px = player.state.x, pz = player.state.z, py = player.state.y;
      rainOn.value = rain > 0.2 ? 1 : 0;
      shadowK.value = lerp(0.38, 0.2, env.night) * (1 - env.weather.cur.over * 0.5);
      bellCool -= dt;
      let near = 0;
      const dens = {};
      for (const k of ['walk', 'run', 'bike', 'couple', 'dog', 'picnic', 'busk', 'kite', 'vendor', 'fw', 'photo']) dens[k] = density(k, hour, rain);
      api.busking = dens.busk > 0;
      propMeshes.forEach((m, i) => { m.visible = dens.picnic > i / 3 + 0.02; });
      tents.visible = dens.picnic > 0.3;
      guitars.visible = api.busking;

      for (let i = 0; i < N; i++) {
        const n = list[i];
        // 이동
        if (n.follow) {
          const l = n.follow;
          n.u = l.u - l.dir * n.back; n.dir = l.dir; n.path = l.path; n.lane = l.lane; n.speed = l.speed;
        } else if (n.path) {
          n.u += n.dir * n.speed * dt;
          const p = n.path;
          if (p.closed) n.u = ((n.u % p.u1) + p.u1) % p.u1;
          else if (n.u > p.u1) { n.u = p.u1; n.dir = -1; } else if (n.u < p.u0) { n.u = p.u0; n.dir = 1; }
          // 우측통행: 진행 방향에 따라 차로가 갈린다
          if (!p.bank) n.lane = 7.4 + (n.dir > 0 ? -0.9 : 0.9) + n.laneJ * 0.6;
          else if (n.kind === 'bike') n.lane = (n.dir > 0 ? 13.2 : 15.2) + n.laneJ * 0.7;
          else n.lane = (n.dir > 0 ? 6.9 : 8.5) + n.laneJ * 0.7;
        }
        if (n.path) {
          n.path.at(n.u, o);
          const d = n.lane + n.side * n.dir;
          n.x = o.x + o.nx * d; n.z = o.z + o.nz * d;
          n.yaw = Math.atan2(o.tx * n.dir, o.tz * n.dir);
          n.phase += dt * (n.kind === 'bike' ? 7 : n.speed * (n.kind === 'run' ? 2.3 : 3.6));
          n.amp = n.kind === 'run' ? 1.5 : 1;
        } else if (n === courier) {
          const j = courier.job;
          if (j) {
            // 오토바이를 타고 와서, 내려서 탑박스를 열고 치킨을 꺼내 건넨 뒤, 다시 타고 돌아간다
            const tx = j.state === 'come' ? j.tx : j.sx, tz = j.state === 'come' ? j.tz : j.sz;
            const dx = tx - n.x, dz = tz - n.z, dl = Math.hypot(dx, dz);
            const park = () => { moto.position.set(j.mx, n.y, j.mz); moto.rotation.y = j.myaw; };
            if (j.state === 'come' || j.state === 'leave') {
              if (dl > (j.state === 'come' ? 3.2 : 1.2)) {
                const v = Math.min(9, 2 + dl * 0.9);
                n.x += (dx / dl) * v * dt; n.z += (dz / dl) * v * dt; n.yaw = Math.atan2(dx, dz); n.y = heightAt(n.x, n.z);
                n.pose = 2; n.amp = 0; n.phase = 0;
                moto.position.set(n.x, n.y, n.z); moto.rotation.y = n.yaw; boxLid.rotation.x = 0;
                if (api.onMoto) api.onMoto(dt, Math.hypot(n.x - px, n.z - pz));
              } else if (j.state === 'come') {
                j.state = 'open'; j.t = 1.6; j.mx = n.x; j.mz = n.z; j.myaw = n.yaw;
                n.x -= Math.sin(n.yaw) * 1.5; n.z -= Math.cos(n.yaw) * 1.5; n.x += Math.cos(n.yaw) * 0.5; n.z -= Math.sin(n.yaw) * 0.5; // 오토바이 뒤로 가서 선다
              } else { courier.job = null; moto.visible = false; }
            } else if (j.state === 'open') { // 탑박스를 연다
              j.t -= dt; n.pose = 3; n.amp = 0; n.yaw = Math.atan2(j.mx - n.x, j.mz - n.z); park();
              boxLid.rotation.x = -1.3 * Math.min(1, (1.6 - j.t) / 0.7);
              if (j.t <= 0) { j.state = 'carry'; chickenBox.visible = true; }
            } else if (j.state === 'carry') { // 치킨을 들고 걸어온다
              const cx = j.tx - n.x, cz = j.tz - n.z, cl = Math.hypot(cx, cz);
              park(); n.pose = 3;
              if (cl > 1.0) { n.x += (cx / cl) * 1.8 * dt; n.z += (cz / cl) * 1.8 * dt; n.yaw = Math.atan2(cx, cz); n.phase += dt * 8; n.amp = 1; n.y = heightAt(n.x, n.z); }
              else { j.state = 'hand'; j.t = 1.4; n.amp = 0; chickenBox.visible = false; if (j.onArrive) j.onArrive(); }
              chickenBox.position.set(n.x + Math.sin(n.yaw) * 0.32, n.y + 0.72, n.z + Math.cos(n.yaw) * 0.32); chickenBox.rotation.y = n.yaw;
            } else if (j.state === 'hand') { j.t -= dt; n.pose = 0; n.wave = 0.3; park(); if (j.t <= 0) j.state = 'back'; }
            else if (j.state === 'back') { // 오토바이로 돌아가 탄다
              const cx = j.mx - n.x, cz = j.mz - n.z, cl = Math.hypot(cx, cz);
              park(); boxLid.rotation.x = Math.min(0, boxLid.rotation.x + dt * 2);
              if (cl > 0.4) { n.x += (cx / cl) * 2.2 * dt; n.z += (cz / cl) * 2.2 * dt; n.yaw = Math.atan2(cx, cz); n.phase += dt * 9; n.amp = 1; }
              else { j.state = 'leave'; n.x = j.mx; n.z = j.mz; }
            }
          }
        } else if (n.kind === 'pass') { // 버스 승객: 배의 움직임을 따라간다
          const b = ctx.busList && ctx.busList[n.bus];
          if (b) { const sn = Math.sin(b.yaw), cs = Math.cos(b.yaw); n.x = b.x + cs * n.lx + sn * n.lz; n.z = b.z - sn * n.lx + cs * n.lz; n.y = b.mesh.position.y + 3.17 * 1.5 - 0.4; n.yaw = b.yaw; }
        }
        // 표시 여부(시간대·날씨): 플레이어에게서 멀 때만 바꿔 갑자기 나타나지 않게 한다
        const dx = n.x - px, dz = n.z - pz, dist = Math.hypot(dx, dz);
        const want = n === courier ? !!courier.job : n.kind === 'pass' ? true : n.rank < (dens[n.kind] ?? 0);
        if (want !== n.shown && (dist > 70 || n.static && n.kind !== 'picnic' || n === courier || !api._init)) n.shown = want;
        n.vis = n.shown ? Math.min(1, n.vis + dt * 2) : Math.max(0, n.vis - dt * 2);
        if (n.vis > 0 && dist < 26) near++;
        if (n.path && n.vis > 0) {
          if (dist < 170) n.y = heightAt(n.x, n.z);
          // 플레이어를 살짝 비켜 간다
          if (dist < 1.3 && Math.abs(n.y - py) < 1.5 && dist > 0.01) { const k = (1.3 - dist) / dist; n.x += dx * k; n.z += dz * k; }
          if (n.kind === 'bike' && dist < 7 && bellCool <= 0 && api.onBell) { bellCool = 9; api.onBell(dist); }
        }
        const k4 = i * 4;
        aXf[k4] = n.x; aXf[k4 + 1] = n.y + (n.pose === 2 ? 0.4 : 0) + (n.kind === 'fw' && n.pose !== 1 ? Math.abs(Math.sin(u.uTime.value * 7 + n.phase)) * 0.12 * api.cheer : 0); aXf[k4 + 2] = n.z; aXf[k4 + 3] = n.yaw;
        if (n.wave > 0) n.wave -= dt;
        aAn[k4] = n.phase; aAn[k4 + 1] = n.amp; aAn[k4 + 2] = n.pose + (n.wave > 0 ? 10 : 0); aAn[k4 + 3] = n.scale * n.vis;
        const s = n.vis > 0 && n.pose !== 1 && n.kind !== 'pass' ? 0.95 * n.scale : 0;
        m4.compose(v3.set(n.x, n.y + 0.03, n.z), q.identity(), sc.set(s, 1, s));
        blobs.setMatrixAt(i, m4);
      }
      api._init = true;
      api.nearCount = near;
      xfAttr.needsUpdate = true; anAttr.needsUpdate = true;

      // 자전거
      bikes.forEach((b, i) => {
        q.setFromAxisAngle(up, b.yaw);
        const s = b.vis;
        m4.compose(v3.set(b.x, b.y, b.z), q, sc.set(s, s, s));
        bikeMesh.setMatrixAt(i, m4);
      });
      bikeMesh.instanceMatrix.needsUpdate = true;

      // 강아지(주인 옆을 따라간다)와 고양이(제자리 근처를 어슬렁거린다)
      const psp = player.state.speed;
      dogs.forEach((d, i) => {
        const dp = Math.hypot(d.x - px, d.z - pz);
        let tx = d.x, tz = d.z, sp = 0, hop = 0;
        d.pose = 0;
        if (d.happy > 0) { // 쓰다듬는 중: 가만히 기뻐한다
          d.happy -= dt;
          d.yaw = Math.atan2(px - d.x, pz - d.z);
          if (d.type === 'dog') hop = Math.abs(Math.sin(u.uTime.value * 9)) * 0.09; else d.pose = 1;
        } else if (d.follow > 0) { // 간식을 받은 뒤 한동안 따라다닌다
          d.follow -= dt;
          const a = Math.atan2(d.x - px, d.z - pz);
          tx = px + Math.sin(a) * 1.0; tz = pz + Math.cos(a) * 1.0; sp = Math.max(3.5, psp + 1.5);
          if (dp > 30 || Math.abs(d.y - py) > 3) d.follow = 0;
        } else if (d.type === 'dog') {
          const ow = d.owner;
          const hx = ow.x + Math.sin(ow.yaw) * 0.7 + Math.cos(ow.yaw) * 0.55, hz = ow.z + Math.cos(ow.yaw) * 0.7 - Math.sin(ow.yaw) * 0.55;
          d.cool -= dt;
          if (d.mode === 'heel') {
            if (!d.init) { d.x = hx; d.z = hz; d.init = true; }
            if (d.cool <= 0 && dp < 6 && ow.vis > 0.9 && Math.abs(ow.y - py) < 1) { d.mode = 'curious'; d.t = 6 + Math.random() * 5; }
          } else if (d.mode === 'curious') {
            d.t -= dt;
            if (d.t <= 0 || Math.hypot(ow.x - px, ow.z - pz) > 22) { d.mode = 'heel'; d.cool = 40 + Math.random() * 60; }
          }
          tx = hx; tz = hz; sp = ow.speed + 2.5;
          if (d.mode === 'curious') { const a = Math.atan2(d.x - px, d.z - pz); tx = px + Math.sin(a) * 1.1; tz = pz + Math.cos(a) * 1.1; sp = 5.5; }
          if (Math.hypot(tx - d.x, tz - d.z) > 12) { d.x = tx; d.z = tz; }
          d.vis = ow.vis;
        } else {
          d.t -= dt;
          if (dp < 2.6 && psp > 6 && d.mode !== 'flee') { // 뛰어오면 깜짝 놀라 달아난다
            const a = Math.atan2(d.x - px, d.z - pz) + (Math.random() - 0.5);
            d.mode = 'flee'; d.tx = d.x + Math.sin(a) * 7; d.tz = d.z + Math.cos(a) * 7; d.t = 4;
          } else if (d.t <= 0) {
            if (d.mode === 'sit') {
              const a = Math.random() * 6.28, r = 2 + Math.random() * 6;
              d.tx = d.hx + Math.sin(a) * r; d.tz = d.hz + Math.cos(a) * r; d.mode = 'walk'; d.t = 14;
            } else { d.mode = 'sit'; d.t = 6 + Math.random() * 16; }
          }
          if (d.mode !== 'sit') { tx = d.tx; tz = d.tz; sp = d.mode === 'flee' ? 6 : 1.1; if (Math.hypot(tx - d.x, tz - d.z) < 0.2) { d.mode = 'sit'; d.t = 6 + Math.random() * 16; } }
          else d.pose = 1;
          const want = rain > 0.3 ? 0 : 1;
          d.vis = want > d.vis ? Math.min(1, d.vis + dt) : dp > 60 ? Math.max(0, d.vis - dt) : d.vis;
        }
        const dx = tx - d.x, dz = tz - d.z, dl = Math.hypot(dx, dz);
        if (sp > 0 && dl > 0.15) {
          const st = Math.min(dl, sp * dt), nx = d.x + (dx / dl) * st, nz = d.z + (dz / dl) * st;
          if (d.type === 'dog' || sampleField(nx, nz, f).d > 1.5) { d.x = nx; d.z = nz; } else { d.mode = 'sit'; d.t = 5; }
          d.yaw = Math.atan2(dx, dz); d.phase += st * 11; d.amp = 1;
        } else { d.amp = 0; if (d.type === 'dog' && d.mode === 'heel' && d.happy <= 0 && d.follow <= 0) d.yaw = d.owner.yaw; }
        if (dp < 170) d.y = heightAt(d.x, d.z);
        const k4 = i * 4;
        dXf[k4] = d.x; dXf[k4 + 1] = d.y + hop; dXf[k4 + 2] = d.z; dXf[k4 + 3] = d.yaw;
        dAn[k4] = d.phase; dAn[k4 + 1] = d.amp; dAn[k4 + 2] = d.pose; dAn[k4 + 3] = d.scale * d.vis;
        const s = d.vis > 0 ? 0.6 * d.scale : 0;
        m4.compose(v3.set(d.x, d.y + 0.03, d.z), q.identity(), sc.set(s, 1, s));
        blobs.setMatrixAt(N + i, m4);
      });
      dxfAttr.needsUpdate = true; danAttr.needsUpdate = true;
      blobs.instanceMatrix.needsUpdate = true;

      // 연: 바람 방향으로 떠서 흔들린다
      const w = env.weather, wind = w.cur.wind + w.gust * 0.6, wa = w.windAngle, t = u.uTime.value;
      kites.forEach((k, i) => {
        const n = k.n, on = n.vis > 0.5;
        const el = 0.55 + 0.35 * Math.min(1, wind * 1.6) + Math.sin(t * 0.9 + k.ph) * 0.06, L = 20 + wind * 8;
        const wob = Math.sin(t * 1.7 + k.ph) * 1.2;
        const kx = n.x + Math.cos(wa) * Math.cos(el) * L - Math.sin(wa) * wob, kz = n.z + Math.sin(wa) * Math.cos(el) * L + Math.cos(wa) * wob, ky = n.y + 1.1 + Math.sin(el) * L;
        n.yaw = Math.atan2(kx - n.x, kz - n.z);
        kitePos.set(on ? [n.x, n.y + 0.6, n.z, kx, ky, kz] : [0, -50, 0, 0, -50, 0], i * 6);
        const m = kiteMeshes[i];
        m.visible = on;
        m.position.set(kx, ky, kz);
        m.rotation.set(-0.7, Math.atan2(n.x - kx, n.z - kz), Math.sin(t * 2.3 + k.ph) * 0.25, 'YXZ');
      });
      kiteLineGeo.attributes.position.needsUpdate = true;
    },
  };
  return api;
}
