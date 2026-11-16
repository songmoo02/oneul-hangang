// 지형 필드: 임의의 (x, z)에 대해 "물가까지의 부호 거리 d", 구역, 둔치 폭, 높이를 해석적으로 계산한다.
// 지형 메시·보행 판정·나무 배치·미니맵이 모두 이 함수 하나를 공유한다.
import { clamp, lerp, smoothstep, vnoise } from '../core/math.js';
import { BANK_N_RAW, BANK_S_RAW, BRIDGE_DEFS, NODEUL, BAMSEOM, SEORAE, PLAZAS, toWorld } from './geo.js';

export const PARK_Y = 2.2; // 둔치(한강공원) 기준 높이
export const CITY_Y = 8.5; // 제방 위 도시 기준 높이
export const LEVEE_W = 14; // 제방 사면 폭
export const ROAD_W = 22; // 강변북로·올림픽대로 폭
export const EMB_W = 5; // 호안 폭
export const ZONE = { N: 0, S: 1, NODEUL: 2, BAMSEOM: 3, SEORAE: 4 };

// ───────────────────────── 폴리라인 ─────────────────────────
class Polyline {
  constructor(pts, closed = false) {
    const n = closed ? pts.length : pts.length - 1;
    this.n = n;
    this.closed = closed;
    this.pts = pts;
    this.ax = new Float64Array(n); this.az = new Float64Array(n);
    this.dx = new Float64Array(n); this.dz = new Float64Array(n);
    this.il2 = new Float64Array(n); this.len = new Float64Array(n);
    this.cum = new Float64Array(n + 1);
    this.w0 = new Float64Array(n); this.w1 = new Float64Array(n);
    let area = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.ax[i] = a.x; this.az[i] = a.z;
      this.dx[i] = b.x - a.x; this.dz[i] = b.z - a.z;
      const l2 = this.dx[i] * this.dx[i] + this.dz[i] * this.dz[i];
      this.il2[i] = 1 / l2;
      this.len[i] = Math.sqrt(l2);
      this.cum[i + 1] = this.cum[i] + this.len[i];
      this.w0[i] = a.w ?? 0; this.w1[i] = b.w ?? 0;
      area += a.x * b.z - b.x * a.z;
      minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
      minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
    }
    this.orient = area >= 0 ? 1 : -1;
    this.total = this.cum[n];
    this.cx = (minX + maxX) / 2; this.cz = (minZ + maxZ) / 2;
    this.radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;
  }

  // out: dist(부호 없는 거리), side(선분 방향 기준 좌우), u(호 길이), w
  nearest(x, z, out) {
    const { n, ax, az, dx, dz, il2 } = this;
    let best = Infinity, bi = 0, bt = 0;
    for (let i = 0; i < n; i++) {
      const rx = x - ax[i], rz = z - az[i];
      let t = (rx * dx[i] + rz * dz[i]) * il2[i];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = rx - dx[i] * t, pz = rz - dz[i] * t;
      const d2 = px * px + pz * pz;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    out.dist = Math.sqrt(best);
    out.side = dx[bi] * (z - az[bi]) - dz[bi] * (x - ax[bi]);
    out.u = this.cum[bi] + bt * this.len[bi];
    out.w = this.w0[bi] + (this.w1[bi] - this.w0[bi]) * bt;
    out.i = bi; out.t = bt;
    return out;
  }

  // 호 길이 u에서의 점과 접선
  at(u, out = {}) {
    u = clamp(u, 0, this.total - 1e-6);
    let lo = 0, hi = this.n - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (this.cum[m] <= u) lo = m; else hi = m - 1;
    }
    const t = (u - this.cum[lo]) / this.len[lo];
    out.x = this.ax[lo] + this.dx[lo] * t;
    out.z = this.az[lo] + this.dz[lo] * t;
    out.tx = this.dx[lo] / this.len[lo];
    out.tz = this.dz[lo] / this.len[lo];
    out.w = this.w0[lo] + (this.w1[lo] - this.w0[lo]) * t;
    return out;
  }

  // x 좌표가 주어졌을 때(서→동 단조 폴리라인) 호 길이
  uAtX(x) {
    for (let i = 0; i < this.n; i++) {
      const x0 = this.ax[i], x1 = x0 + this.dx[i];
      if ((x >= x0 && x <= x1) || (x <= x0 && x >= x1)) {
        const t = Math.abs(this.dx[i]) < 1e-9 ? 0 : (x - x0) / this.dx[i];
        return this.cum[i] + t * this.len[i];
      }
    }
    return x < this.ax[0] ? 0 : this.total;
  }
}

function smoothPath(raw, sub) {
  const out = [];
  const P = raw;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(i - 1, 0)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(i + 2, P.length - 1)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z), w: lerp(p1.w, p2.w, t) });
    }
  }
  out.push({ ...P[P.length - 1] });
  return out;
}

const rawToWorld = (raw) => raw.map(([lat, lon, w]) => ({ ...toWorld(lat, lon), w }));

export const bankN = new Polyline(smoothPath(rawToWorld(BANK_N_RAW), 6));
export const bankS = new Polyline(smoothPath(rawToWorld(BANK_S_RAW), 6));

// ───────────────────────── 대교 축(다른 모듈과 공유) ─────────────────────────
// 강변(본류)만으로 계산한 부호 거리. 다리 끝점을 "제방 위"에 맞추는 데 쓴다.
const _p = {}, _q = {};
function bankOnly(x, z, out) {
  bankN.nearest(x, z, _p);
  bankS.nearest(x, z, _q);
  const dN = _p.side > 0 ? -_p.dist : _p.dist;
  const dS = _q.side < 0 ? -_q.dist : _q.dist;
  if (dN >= dS) { out.d = dN; out.w = _p.w; } else { out.d = dS; out.w = _q.w; }
  return out;
}

export const BRIDGE_AXES = BRIDGE_DEFS.map((def) => {
  const n = toWorld(def.n[0], def.n[1]), s = toWorld(def.s[0], def.s[1]);
  let dx = s.x - n.x, dz = s.z - n.z;
  const l = Math.hypot(dx, dz);
  dx /= l; dz /= l;
  const f = {};
  // 물을 건너는 구간을 찾고, 양쪽으로 제방 위(둔치+사면을 지난 곳)까지 연장한다
  let sw0 = null, sw1 = null;
  for (let t = -300; t <= l + 300; t += 1) {
    if (bankOnly(n.x + dx * t, n.z + dz * t, f).d < 0) { if (sw0 === null) sw0 = t; sw1 = t; }
  }
  let tA = sw0, tB = sw1;
  for (let k = 0; k < 400; k++) { tA -= 1; bankOnly(n.x + dx * tA, n.z + dz * tA, f); if (f.d >= f.w + LEVEE_W + 12) break; }
  for (let k = 0; k < 400; k++) { tB += 1; bankOnly(n.x + dx * tB, n.z + dz * tB, f); if (f.d >= f.w + LEVEE_W + 12) break; }
  return {
    def, id: def.id,
    ax: n.x + dx * tA, az: n.z + dz * tA, // 북쪽 끝(제방 위)
    dx, dz, // 북→남 단위 방향
    sx: -dz, sz: dx, // 측면 단위 벡터
    L: tB - tA,
    sW0: sw0 - tA, sW1: sw1 - tA, // 물 위 구간
  };
});
export const bridgeAxis = (id) => BRIDGE_AXES.find((b) => b.id === id);

// ───────────────────────── 섬 ─────────────────────────
function makeNodeul() {
  const c = toWorld(NODEUL.lat, NODEUL.lon);
  const hb = bridgeAxis('hangang');
  const bx = hb.dx, bz = hb.dz; // 다리 방향
  const ax = hb.dz, az = -hb.dx; // 섬 긴 축(+가 상류·동쪽)
  const pts = [];
  const N = 64;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const s = Math.sin(th);
    const la = NODEUL.a * Math.cos(th);
    const lb = NODEUL.b * s * (0.5 + 0.5 * s * s);
    pts.push({ x: c.x + la * ax + lb * bx, z: c.z + la * az + lb * bz });
  }
  return { poly: new Polyline(pts, true), zone: ZONE.NODEUL, frame: { cx: c.x, cz: c.z, ax, az, bx, bz } };
}

function makeBamseom(def) {
  const c = toWorld(def.lat, def.lon);
  const ax = 0.992, az = 0.125, bx = -0.125, bz = 0.992;
  const pts = [];
  const N = 30;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const m = 1 + 0.16 * Math.sin(3 * th + def.seed) + 0.09 * Math.sin(5 * th + def.seed * 2.1);
    const la = def.a * Math.cos(th) * m, lb = def.b * Math.sin(th) * m;
    pts.push({ x: c.x + la * ax + lb * bx, z: c.z + la * az + lb * bz });
  }
  return { poly: new Polyline(pts, true), zone: ZONE.BAMSEOM };
}

function makeSeorae() {
  const x = toWorld(0, SEORAE.lon).x;
  const p = bankS.at(bankS.uAtX(x));
  const nx = p.tz, nz = -p.tx; // 남쪽 강변에서 물 쪽(북쪽) 법선
  const cx = p.x + nx * (SEORAE.gap + SEORAE.b), cz = p.z + nz * (SEORAE.gap + SEORAE.b);
  const pts = [];
  const N = 16, a = SEORAE.a - SEORAE.b, b = SEORAE.b;
  for (let i = 0; i <= N; i++) { // 동쪽 반원
    const th = -Math.PI / 2 + (i / N) * Math.PI;
    pts.push([a + b * Math.cos(th), b * Math.sin(th)]);
  }
  for (let i = 0; i <= N; i++) { // 서쪽 반원
    const th = Math.PI / 2 + (i / N) * Math.PI;
    pts.push([-a + b * Math.cos(th), b * Math.sin(th)]);
  }
  const wp = pts.map(([la, lb]) => ({ x: cx + la * p.tx + lb * nx, z: cz + la * p.tz + lb * nz }));
  return { poly: new Polyline(wp, true), zone: ZONE.SEORAE, frame: { cx, cz, ax: p.tx, az: p.tz, bx: nx, bz: nz } };
}

const nodeul = makeNodeul();
const seorae = makeSeorae();
export const ISLANDS = [nodeul, ...BAMSEOM.map(makeBamseom), seorae];
export const NODEUL_FRAME = { ...nodeul.frame, topY: BRIDGE_DEFS.find((b) => b.id === 'hangang').H - 0.12, midY: 5.8 };
export const SEORAE_FRAME = seorae.frame;

// ───────────────────────── 필드 샘플 ─────────────────────────
const _a = {}, _b = {}, _c = {};

export function sampleField(x, z, out) {
  bankN.nearest(x, z, _a);
  bankS.nearest(x, z, _b);
  const dN = _a.side > 0 ? -_a.dist : _a.dist; // 북쪽 강변: 남쪽이 물
  const dS = _b.side < 0 ? -_b.dist : _b.dist; // 남쪽 강변: 북쪽이 물
  let d, zone, w, u;
  if (dN >= dS) { d = dN; zone = ZONE.N; w = _a.w; u = _a.u; } else { d = dS; zone = ZONE.S; w = _b.w; u = _b.u; }
  if (d < 0) {
    for (let k = 0; k < ISLANDS.length; k++) {
      const isl = ISLANDS[k], poly = isl.poly;
      const gap = Math.hypot(x - poly.cx, z - poly.cz) - poly.radius;
      if (-gap <= d) continue; // 이 섬이 더 가까울 수 없음
      poly.nearest(x, z, _c);
      const di = _c.side * poly.orient > 0 ? _c.dist : -_c.dist;
      if (di > d) { d = di; zone = isl.zone; w = 1e6; u = _c.u; }
    }
  }
  out.d = d; out.zone = zone; out.w = w; out.u = u;
  return out;
}

// ───────────────────────── 광장·연결로 SDF ─────────────────────────
const pathShapes = [];
export function registerPathShape(s) { pathShapes.push(s); }
export function pathSDF(x, z) {
  let m = 1e6;
  for (let i = 0; i < pathShapes.length; i++) {
    const s = pathShapes[i];
    let d;
    if (s.t === 0) {
      d = Math.hypot(x - s.x, z - s.z) - s.r;
    } else {
      const ex = s.bx - s.ax, ez = s.bz - s.az;
      let t = ((x - s.ax) * ex + (z - s.az) * ez) / (ex * ex + ez * ez);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      d = Math.hypot(x - s.ax - ex * t, z - s.az - ez * t) - s.r;
    }
    if (d < m) m = d;
  }
  return m;
}

// 강변을 따라 x 위치와 물가 거리 d로 지정한 월드 좌표
export function bankOffset(bankId, x, d) {
  const bank = bankId === 'N' || bankId === ZONE.N ? bankN : bankS;
  const p = bank.at(bank.uAtX(x));
  const north = bank === bankN;
  const lx = north ? p.tz : -p.tz, lz = north ? -p.tx : p.tx; // 육지 방향 법선
  return { x: p.x + lx * d, z: p.z + lz * d, tx: p.tx, tz: p.tz, lx, lz, w: p.w };
}

export const PLAZA_POINTS = PLAZAS.map((pl) => {
  const p = bankOffset(pl.bank, toWorld(0, pl.lon).x, pl.d);
  registerPathShape({ t: 0, x: p.x, z: p.z, r: pl.r });
  return { ...pl, x: p.x, z: p.z };
});

// ───────────────────────── 높이 ─────────────────────────
const easeOut = (t) => t * (2 - t);
const parkLevel = (x, z) => PARK_Y + 0.35 * vnoise(x * 0.012 + 5.3, z * 0.012 + 9.1);
const mound = (x, z) => Math.max(0, vnoise(x * 0.021 + 31.7, z * 0.021 + 17.2) - 0.48) * 3.4;

export function heightFromField(f, x, z) {
  const d = f.d;
  if (d <= 0) return Math.max(-5, -0.35 + d * 0.45);
  const zone = f.zone;
  if (zone <= 1) {
    const P = parkLevel(x, z);
    if (d < EMB_W) return -0.35 + (P + 0.35) * easeOut(d / EMB_W);
    const w = f.w;
    if (d <= w) {
      const m = smoothstep(19, 30, d) * (1 - smoothstep(w - 16, w - 5, d));
      if (m <= 0) return P;
      const flat = smoothstep(2, 9, pathSDF(x, z)); // 광장 근처는 평탄하게
      return P + m * flat * mound(x, z);
    }
    if (d < w + LEVEE_W) {
      const t = (d - w) / LEVEE_W;
      return P + (CITY_Y - P) * t * t * (3 - 2 * t);
    }
    return CITY_Y;
  }
  if (zone === ZONE.NODEUL) {
    const F = NODEUL_FRAME;
    const ring = PARK_Y;
    if (d < 4) return -0.35 + (ring + 0.35) * easeOut(d / 4);
    const s = (x - F.cx) * F.ax + (z - F.cz) * F.az;
    const k = 1 - smoothstep(24, 64, Math.abs(s));
    const target = lerp(F.midY, F.topY, k);
    return ring + (target - ring) * smoothstep(12, 18.5, d);
  }
  if (zone === ZONE.SEORAE) {
    return -0.35 + (2.0 + 0.35) * easeOut(Math.min(d, 4) / 4) + 0.15 * vnoise(x * 0.05, z * 0.05);
  }
  // 밤섬
  return -0.35 + easeOut(Math.min(d, 10) / 10) * (1.5 + 0.7 * vnoise(x * 0.03, z * 0.03));
}

const _f = {};
export function heightAt(x, z) {
  return heightFromField(sampleField(x, z, _f), x, z);
}

// 지면 보행 가능 여부
export function isGroundWalkable(f) {
  if (f.d < 0.7) return false;
  if (f.zone <= 1) return f.d <= f.w + 2;
  return f.zone !== ZONE.BAMSEOM;
}

// 강변 한 점에서 산책로 위 시작 위치 등을 찾을 때 사용
export function groundInfo(x, z, out = {}) {
  sampleField(x, z, out);
  out.h = heightFromField(out, x, z);
  out.walkable = isGroundWalkable(out);
  return out;
}
