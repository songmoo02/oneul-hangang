// 대교 7개: 공통 상판·교각·난간 + 다리마다 다른 구조(아치·트러스·V자 교각·2층).
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';
import { canvasTexture } from '../core/textures.js';
import { smoothstep, lerp, mulberry32 } from '../core/math.js';
import { BRIDGE_AXES, sampleField, heightFromField, heightAt, CITY_Y, registerPathShape, ZONE, SEORAE_FRAME } from './field.js';

const SIDEWALK_W = 2.45, SIDEWALK_EDGE = 0.3, SIDEWALK_H = 0.12;
const STEP_RISE = 0.19, STEP_RUN = 0.36;

// ───────────────────────── 계획 단계 (지형을 만들기 전에 실행) ─────────────────────────
export function planBridges(ctx) {
  const plans = BRIDGE_AXES.map((axis) => planOne(ctx, axis));
  ctx.bridgePlans = plans;
  ctx.footbridges = planFootbridges(ctx);
  // 식생 배치 등에서 "다리 밑인지" 확인하는 함수
  ctx.nearBridge = (x, z, margin = 3) => {
    for (const p of plans) {
      const rx = x - p.ax, rz = z - p.az;
      const s = rx * p.dx + rz * p.dz;
      if (s < -margin || s > p.L + margin) continue;
      const a = Math.abs(rx * p.sx + rz * p.sz);
      if (a < p.W / 2 + margin + (p.stairs.length ? 3 : 0)) return p;
    }
    return null;
  };
  return plans;
}

// 서래섬과 반포한강공원을 잇는 작은 보행교 3개
function planFootbridges(ctx) {
  const F = SEORAE_FRAME, f = {}, list = [];
  for (const la of [-56, 0, 56]) {
    const ox = F.cx + F.ax * la, oz = F.cz + F.az * la;
    // 섬 중심에서 강변 쪽(-b)으로 가며 양 끝을 찾는다
    let t0 = null, t1 = null;
    for (let t = 0; t < 60; t += 0.25) {
      sampleField(ox - F.bx * t, oz - F.bz * t, f);
      if (t1 === null && f.zone === ZONE.SEORAE && f.d < 3.6) t1 = t;
      if (t1 !== null && f.zone === ZONE.S && f.d >= 3.8) { t0 = t; break; }
    }
    if (t0 === null) continue;
    const sx0 = ox - F.bx * t0, sz0 = oz - F.bz * t0; // 강변 쪽 끝
    const len = t0 - t1;
    const g0 = heightAt(sx0, sz0) + 0.04, g1 = heightAt(ox - F.bx * t1, oz - F.bz * t1) + 0.04;
    const y = (s) => lerp(g0, g1, s / len) + 0.75 * Math.sin((Math.PI * s) / len);
    const fb = { ax: sx0, az: sz0, dx: F.bx, dz: F.bz, sx: -F.bz, sz: F.bx, len, y, halfW: 1.4 };
    ctx.walk.addStrip({ ax: fb.ax, az: fb.az, dx: fb.dx, dz: fb.dz, sx: fb.sx, sz: fb.sz, s0: 0, s1: len, a0: -1.25, a1: 1.25, y, tag: 'seorae' });
    registerPathShape({ t: 1, ax: sx0, az: sz0, bx: sx0 - F.bx * 4, bz: sz0 - F.bz * 4, r: 1.6 });
    list.push(fb);
  }
  return list;
}

function planOne(ctx, axis) {
  const { def, ax, az, dx, dz, sx, sz, L, sW0, sW1 } = axis;
  const H = def.H, W = def.W;
  const y0 = CITY_Y + 0.25;
  const p = {
    ...axis, name: def.name, H, W, type: def.type, accent: def.accent,
    deckY: (s) => y0 + (H - y0) * smoothstep(6, sW0 - 4, s) * (1 - smoothstep(sW1 + 4, L - 6, s)),
    at: (s, a = 0) => [ax + dx * s + sx * a, az + dz * s + sz * a],
    stairs: [], piers: [], gaps: { 1: [], '-1': [] }, mid: (sW0 + sW1) / 2,
  };
  const f = {};
  const fieldAt = (s, a = 0) => { const q = p.at(s, a); return sampleField(q[0], q[1], f); };
  const groundAt = (s, a = 0) => { const q = p.at(s, a); return heightAt(q[0], q[1]); };

  // 노들섬 통과 구간 (한강대교)
  if (def.id === 'hangang') {
    let i0 = null, i1 = null;
    for (let s = sW0; s <= sW1; s += 0.5) {
      if (fieldAt(s).zone === ZONE.NODEUL && f.d > 0) { if (i0 === null) i0 = s; i1 = s; }
    }
    p.island = [i0, i1];
  }

  // 교각 위치
  const span = def.span;
  const list = [];
  if (def.id === 'hangang') {
    const [i0, i1] = p.island;
    const nN = Math.max(2, Math.round((i0 - sW0 + 10) / 34));
    for (let k = 0; k <= nN; k++) list.push(lerp(sW0 - 6, i0 + 4, k / nN));
    p.archSpans = [];
    for (let k = 0; k <= 6; k++) {
      const s = lerp(i1 - 4, sW1 + 5, k / 6);
      list.push(s);
      if (k > 0) p.archSpans.push([lerp(i1 - 4, sW1 + 5, (k - 1) / 6), s]);
    }
    for (let s = sW1 + 5 + 30; s < L - 16; s += 30) list.push(s);
    for (let s = sW0 - 6 - 30; s > 16; s -= 30) list.push(s);
  } else {
    let anchor = p.mid, aSpan = span;
    if (def.type === 'nielsen') { anchor = lerp(sW0, sW1, 0.7); aSpan = 66; p.archSpans = [[anchor - 33, anchor + 33]]; }
    if (def.type === 'langer') {
      p.archSpans = [];
      for (let k = -2; k < 2; k++) p.archSpans.push([p.mid + k * span, p.mid + (k + 1) * span]);
      anchor = p.mid + span / 2;
    }
    list.push(anchor - aSpan / 2, anchor + aSpan / 2);
    for (let s = anchor + aSpan / 2 + span; s < L - 16; s += span) list.push(s);
    for (let s = anchor - aSpan / 2 - span; s > 16; s -= span) list.push(s);
  }
  list.sort((a, b) => a - b);
  p.pierS = list;
  for (const s of list) {
    fieldAt(s);
    const h = heightFromField(f, ...p.at(s));
    const onLand = f.d > 0;
    if (onLand && f.zone <= 1 && f.d > 4.2 && f.d < 18.5 && f.w > 20) continue; // 산책로·자전거길 위는 비운다
    if (onLand && f.zone === ZONE.NODEUL && h > 4) continue;
    if (p.deckY(s) - h < 4.2) continue;
    p.piers.push({ s, base: onLand ? h - 0.6 : -6.5, onLand });
  }

  // 보도(양쪽)
  if (def.walk) {
    for (const sg of [1, -1]) {
      const aIn = W / 2 - SIDEWALK_EDGE - SIDEWALK_W, aOut = W / 2 - SIDEWALK_EDGE - 0.05;
      ctx.walk.addStrip({
        ax, az, dx, dz, sx, sz, s0: 3, s1: L - 3,
        a0: sg > 0 ? aIn : -aOut, a1: sg > 0 ? aOut : -aIn,
        y: (s) => p.deckY(s) + SIDEWALK_H, tag: def.id,
      });
    }
    if (p.island) {
      // 노들섬 위에서는 차도도 건널 수 있다(횡단)
      ctx.walk.addStrip({ ax, az, dx, dz, sx, sz, s0: p.island[0] + 16, s1: p.island[1] - 16, a0: -W / 2 + 2.7, a1: W / 2 - 2.7, y: (s) => p.deckY(s), tag: def.id });
    }
  }

  // 둔치에서 다리로 올라가는 계단 (양 끝 × 양쪽)
  if (def.walk && def.type !== 'double') {
    for (const end of [-1, 1]) { // -1: 북단, +1: 남단 (육지 쪽으로 올라감)
      for (const sg of [1, -1]) {
        const a = sg * (W / 2 + 1.25);
        let sB = null;
        const from = end < 0 ? sW0 : sW1;
        for (let k = 0; k < 60; k += 0.5) {
          const s = from + end * k;
          fieldAt(s, a);
          if (f.zone <= 1 && f.d >= 10.6) { sB = s; break; }
        }
        if (sB === null || f.w < 20) continue;
        const yB = groundAt(sB, a);
        let len = 16, sT = sB, yT = 0, n = 0;
        for (let it = 0; it < 6; it++) {
          sT = sB + end * len;
          yT = p.deckY(sT) + SIDEWALK_H;
          n = Math.ceil((yT - yB) / STEP_RISE);
          len = n * STEP_RUN;
        }
        if (sT < 10 || sT > L - 10 || n < 8) continue;
        const land = 2.9;
        const st = { end, sg, a, sB, sT, yB, yT, n, len, land };
        p.stairs.push(st);
        const slope = (yT - yB) / len;
        const stairY = (s) => Math.min(p.deckY(s) + SIDEWALK_H, yB + Math.abs(s - sB) * slope);
        ctx.walk.addStrip({
          ax, az, dx, dz, sx, sz,
          s0: Math.min(sB, sT + end * land), s1: Math.max(sB, sT + end * land),
          a0: sg > 0 ? W / 2 + 0.05 : -W / 2 - 2.45, a1: sg > 0 ? W / 2 + 2.45 : -W / 2 - 0.05,
          y: stairY, tag: def.id + '-stair',
        });
        // 다리 보도와 계단참을 잇는 면
        ctx.walk.addStrip({
          ax, az, dx, dz, sx, sz,
          s0: Math.min(sT, sT + end * land), s1: Math.max(sT, sT + end * land),
          a0: sg > 0 ? W / 2 - 0.5 : -W / 2 - 0.1, a1: sg > 0 ? W / 2 + 0.1 : -W / 2 + 0.5,
          y: (s) => p.deckY(s) + SIDEWALK_H, tag: def.id + '-landing',
        });
        p.gaps[sg].push([Math.min(sT, sT + end * land) - 0.1, Math.max(sT, sT + end * land) + 0.1]);
        // 계단 아래 지면에서의 충돌(계단 밑을 통과하지 못하게)
        const c0 = p.at(sB + end * 2.2, a), c1 = p.at(sT + end * land, a);
        ctx.walk.addCapsule({ ax: c0[0], az: c0[1], bx: c1[0], bz: c1[1], r: 1.0 });
        // 계단 입구 포장
        const b0 = p.at(sB + end * 0.5, a), b1 = p.at(sB - end * 4.5, a);
        registerPathShape({ t: 1, ax: b0[0], az: b0[1], bx: b1[0], bz: b1[1], r: 1.7 });
        registerPathShape({ t: 0, x: b0[0], z: b0[1], r: 2.4 });
      }
    }
  }

  // 한강대교: 노들섬 위에서는 난간을 비워 섬으로 드나들 수 있게 한다
  if (p.island) {
    for (const sg of [1, -1]) p.gaps[sg].push([p.island[0] + 15, p.island[1] - 15]);
  }

  // 잠수교(반포대교 아래층)
  if (def.type === 'double') {
    const JW = 14;
    const sJ0 = sW0 - 13, sJ1 = sW1 + 13;
    const gN = groundAt(sJ0) + 0.05, gS = groundAt(sJ1) + 0.05;
    const sH = lerp(sW0, sW1, 0.62);
    const jy = (s) => {
      const base = 3.1 + 3.4 * (1 - smoothstep(16, 48, Math.abs(s - sH)));
      return s < p.mid ? lerp(gN, base, smoothstep(sJ0, sJ0 + 16, s)) : lerp(gS, base, 1 - smoothstep(sJ1 - 16, sJ1, s));
    };
    p.jamsu = { W: JW, s0: sJ0, s1: sJ1, y: jy, sH };
    ctx.walk.addStrip({ ax, az, dx, dz, sx, sz, s0: sJ0, s1: sJ1, a0: -JW / 2 + 0.35, a1: JW / 2 - 0.35, y: jy, tag: 'jamsu' });
    const q0 = p.at(sJ0 + 2), q1 = p.at(sJ0 - 5), q2 = p.at(sJ1 - 2), q3 = p.at(sJ1 + 5);
    registerPathShape({ t: 1, ax: q0[0], az: q0[1], bx: q1[0], bz: q1[1], r: JW / 2 });
    registerPathShape({ t: 1, ax: q2[0], az: q2[1], bx: q3[0], bz: q3[1], r: JW / 2 });
  }
  return p;
}

// ───────────────────────── 메시 생성 ─────────────────────────
function girderDepth(p) {
  const pier0 = p.pierS[0] ?? 0, span = p.def.span;
  switch (p.type) {
    case 'haunch': return (s) => 1.25 + 1.7 * Math.pow(Math.abs(Math.cos(Math.PI * (s - pier0) / span)), 3);
    case 'truss': return () => 0.2;
    case 'double': return () => 1.9;
    case 'vpier': return () => 1.5;
    default: return () => 1.55;
  }
}

function framesAlong(p, s0, s1, step, yFn, aOff = 0) {
  const out = [];
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const q = p.at(s, aOff);
    out.push({ p: [q[0], yFn(s), q[1]], s: [p.sx, 0, p.sz], u: [0, 1, 0], sv: s });
  }
  return out;
}

function runsOutside(gaps, s0, s1) {
  const g = gaps.slice().sort((a, b) => a[0] - b[0]);
  const runs = [];
  let cur = s0;
  for (const [a, b] of g) {
    if (a > cur) runs.push([cur, Math.min(a, s1)]);
    cur = Math.max(cur, b);
  }
  if (cur < s1) runs.push([cur, s1]);
  return runs.filter((r) => r[1] - r[0] > 0.5);
}

function deckTexture(W, opts = {}) {
  return canvasTexture(512, 256, (g, w, h) => {
    const px = w / W;
    g.fillStyle = '#2f3034'; g.fillRect(0, 0, w, h);
    const rnd = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const v = 38 + rnd() * 30;
      g.fillStyle = `rgba(${v},${v},${v + 3},0.5)`;
      g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    }
    const line = (a, color, lw, dashed) => {
      g.fillStyle = color;
      const x = (a + W / 2) * px - lw / 2;
      if (dashed) g.fillRect(x, 0, lw, h * 0.42); else g.fillRect(x, 0, lw, h);
    };
    if (opts.jamsu) {
      g.fillStyle = '#3d5646'; g.fillRect(0, 0, 3.2 * px, h); // 자전거 차로
      g.fillStyle = '#8c887f'; g.fillRect(w - 3.4 * px, 0, 3.4 * px, h); // 보행로
      line(-W / 2 + 3.2, '#e4e2d6', 3, false);
      line(W / 2 - 3.4, '#e4e2d6', 3, false);
      line(-0.1, '#d9b53a', 3, true);
      line(-W / 2 + 1.6, '#e4e2d6', 2, true);
      return;
    }
    const edge = W / 2 - 2.95;
    line(-edge, '#dddbd0', 3, false);
    line(edge, '#dddbd0', 3, false);
    const med = opts.median || 0;
    if (med > 0) {
      g.fillStyle = '#3a3733'; g.fillRect((W / 2 - med / 2) * px, 0, med * px, h);
      line(-med / 2 - 0.35, '#d9b53a', 3, false);
      line(med / 2 + 0.35, '#d9b53a', 3, false);
    } else {
      line(-0.14, '#d9b53a', 2.5, false);
      line(0.14, '#d9b53a', 2.5, false);
    }
    const half = edge - med / 2 - (med > 0 ? 0.35 : 0);
    const lanes = Math.max(1, Math.floor(half / 3.1));
    for (let k = 1; k < lanes; k++) {
      const a = med / 2 + (med > 0 ? 0.35 : 0) + (half * k) / lanes;
      line(a, '#dddbd0', 2.5, true);
      line(-a, '#dddbd0', 2.5, true);
    }
  }, { anisotropy: 8 });
}

function ribbon(frames, a0, a1, yOff, uv0 = 0, uv1 = 1, vScale = 1 / 8) {
  const pos = [], nor = [], uv = [], idx = [];
  frames.forEach((f, i) => {
    for (const [a, u] of [[a0, uv0], [a1, uv1]]) {
      pos.push(f.p[0] + f.s[0] * a, f.p[1] + yOff, f.p[2] + f.s[2] * a);
      nor.push(0, 1, 0);
      uv.push(u, f.sv * vScale);
    }
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // 면이 아래를 향하면 뒤집는다
  const a = new THREE.Vector3().fromArray(pos, 0), b = new THREE.Vector3().fromArray(pos, 3), c = new THREE.Vector3().fromArray(pos, 6);
  if (b.sub(a).cross(c.sub(a)).y < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); }
  return g;
}

export function buildBridges(ctx) {
  const group = new THREE.Group();
  group.name = 'bridges';
  const concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 });
  ctx.materials.concrete = concrete;
  ctx.materials.steel = steel;

  for (const p of ctx.bridgePlans) {
    const cg = new GeoBuilder(); // 콘크리트
    const sg = new GeoBuilder(); // 강재(난간 등)
    const ag = new GeoBuilder(); // 다리 고유 구조(아치·트러스) – 밤에 조명
    const gg = new GeoBuilder(); // 경관조명 띠
    const { W, L } = p;
    const gd = girderDepth(p);
    const isRail = p.type === 'truss';
    const frames = framesAlong(p, 0, L, 3, p.deckY);

    if (!isRail) {
      // 상판 슬래브(윗면은 텍스처 리본으로 따로)
      cg.color(0x8f8d86);
      cg.sweep(frames, [[-W / 2, 0], [W / 2, 0], [W / 2, -0.85], [-W / 2, -0.85]], { skip: [0] });
      // 거더
      cg.color(0x85837c);
      const gw = W / 2 - 2.2;
      cg.sweep(frames, (i) => {
        const g = gd(frames[Math.min(i, frames.length - 1)].sv);
        return [[-gw, -0.85], [gw, -0.85], [gw * 0.86, -0.85 - g], [-gw * 0.86, -0.85 - g]];
      }, { skip: [0] });
      // 보도 + 방호벽
      for (const s of [1, -1]) {
        const a0 = s * (W / 2 - SIDEWALK_EDGE - SIDEWALK_W - 0.1), a1 = s * (W / 2 - SIDEWALK_EDGE);
        cg.color(0xa7a399);
        cg.sweep(frames, [[a0, 0], [a1, 0], [a1, SIDEWALK_H], [a0, SIDEWALK_H]], { skip: [0] });
        cg.color(0x8f8d86);
        cg.sweep(frames, [[a1, 0], [s * (W / 2), 0], [s * (W / 2), 0.32], [a1, 0.32]], { skip: [0] });
      }
      const tex = deckTexture(W, { median: p.type === 'langer' ? 7.4 : 0 });
      const top = new THREE.Mesh(ribbon(frames, -W / 2, W / 2, 0.01), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
      top.receiveShadow = true;
      group.add(top);
      ctx.wetMaterials.push(top.material);

      // 난간
      for (const s of [1, -1]) {
        const a = s * (W / 2 - 0.13);
        for (const [r0, r1] of runsOutside(p.gaps[s], 0.5, L - 0.5)) {
          const fr = framesAlong(p, r0, r1, 3, p.deckY);
          sg.color(0x5c6168);
          sg.sweep(fr, [[a - 0.05, 1.12], [a + 0.05, 1.12], [a + 0.05, 1.2], [a - 0.05, 1.2]]);
          sg.sweep(fr, [[a - 0.025, 0.68], [a + 0.025, 0.68], [a + 0.025, 0.73], [a - 0.025, 0.73]]);
          const yaw = Math.atan2(-p.dz, p.dx);
          for (let sv = r0 + 0.3; sv < r1; sv += 2.4) {
            const q = p.at(sv, a);
            sg.box(q[0], p.deckY(sv) + 0.74, q[1], 0.07, 0.86, 0.07, yaw);
          }
        }
      }
      // 경관조명 띠(상판 측면)
      for (const s of [1, -1]) {
        const a = s * (W / 2 + 0.03);
        gg.sweep(framesAlong(p, p.sW0 - 8, p.sW1 + 8, 4, p.deckY), [[a - 0.03, -0.62], [a + 0.03, -0.62], [a + 0.03, -0.48], [a - 0.03, -0.48]]);
      }
      // 가로등
      const lampStep = 21;
      for (let sv = 12; sv < L - 8; sv += lampStep) {
        for (const s of [1, -1]) {
          const q = p.at(sv, s * (W / 2 - SIDEWALK_EDGE - 0.22));
          ctx.lamps.push({ x: q[0], y: p.deckY(sv) + SIDEWALK_H, z: q[1], kind: 'bridge', dirx: -p.sx * s, dirz: -p.sz * s });
        }
      }
    }

    // 교각
    for (const pier of p.piers) buildPier(ctx, p, pier, gd, cg, ag);

    // 다리별 구조
    if (p.type === 'nielsen') buildNielsen(p, ag);
    if (p.type === 'tiedarch') buildTiedArches(p, ag, { aRib: W / 2 - 2.95, ribW: 0.5, ribH: 0.85, riseK: 0.23, color: 0xc4c8be, clear: 6.0 });
    if (p.type === 'langer') { buildTiedArches(p, ag, { aRib: 4.25, ribW: 0.6, ribH: 0.95, riseK: 0.21, color: 0xb8d4e2, clear: 6.4 }); buildMedianTrack(p, cg, sg); }
    if (isRail) buildTruss(p, ag, sg);
    if (p.type === 'double') buildJamsu(ctx, p, cg, sg, group);

    // 계단
    for (const st of p.stairs) buildStair(p, st, cg, sg);

    const addMesh = (gb, mat, cast = true) => {
      if (gb.count === 0) return null;
      const m = new THREE.Mesh(gb.build(), mat);
      m.castShadow = cast; m.receiveShadow = true;
      group.add(m);
      return m;
    };
    addMesh(cg, concrete);
    addMesh(sg, steel);
    if (ag.count) {
      const archMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25, emissive: new THREE.Color(p.accent), emissiveIntensity: 0 });
      addMesh(ag, archMat);
      ctx.nightMaterials.push({ mat: archMat, max: isRail ? 0.06 : p.type === 'vpier' ? 0.5 : 0.32 });
    }
    if (gg.count) {
      const glowMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, emissive: new THREE.Color(p.accent), emissiveIntensity: 0 });
      addMesh(gg, glowMat, false);
      ctx.nightMaterials.push({ mat: glowMat, max: 3.2 });
    }
  }
  // 서래섬 보행교
  {
    const cg = new GeoBuilder(), sg = new GeoBuilder();
    for (const fb of ctx.footbridges) {
      const fr = [];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const sv = (fb.len * i) / n;
        fr.push({ p: [fb.ax + fb.dx * sv, fb.y(sv), fb.az + fb.dz * sv], s: [fb.sx, 0, fb.sz], u: [0, 1, 0], sv });
      }
      cg.color(0x9a8a72);
      cg.sweep(fr, [[-fb.halfW, 0], [fb.halfW, 0], [fb.halfW, -0.28], [-fb.halfW, -0.28]], { caps: true });
      sg.color(0x5c5248);
      for (const a of [-fb.halfW + 0.06, fb.halfW - 0.06]) {
        sg.sweep(fr, [[a - 0.04, 0.95], [a + 0.04, 0.95], [a + 0.04, 1.03], [a - 0.04, 1.03]]);
        for (let i = 0; i <= n; i += 2) {
          const f0 = fr[i];
          sg.box(f0.p[0] + fb.sx * a, f0.p[1] + 0.5, f0.p[2] + fb.sz * a, 0.07, 1.0, 0.07, Math.atan2(-fb.dz, fb.dx));
        }
      }
    }
    if (cg.count) {
      const m1 = new THREE.Mesh(cg.build(), concrete), m2 = new THREE.Mesh(sg.build(), steel);
      m1.castShadow = m2.castShadow = true; m1.receiveShadow = true;
      group.add(m1, m2);
    }
  }
  ctx.scene.add(group);
  return group;
}

function buildPier(ctx, p, pier, gd, cg, ag) {
  const { s, base } = pier;
  const top = p.deckY(s) - 0.85 - gd(s);
  const c = p.at(s);
  const W = p.W;
  const stadium = (halfAcross, halfThick, n = 6) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const th = -Math.PI / 2 + (i / n) * Math.PI;
      pts.push([halfAcross + halfThick * Math.cos(th), halfThick * Math.sin(th)]);
    }
    for (let i = 0; i <= n; i++) {
      const th = Math.PI / 2 + (i / n) * Math.PI;
      pts.push([-halfAcross + halfThick * Math.cos(th), halfThick * Math.sin(th)]);
    }
    // (across, along) → 월드
    return pts.map(([a, b]) => [c[0] + p.sx * a + p.dx * b, c[1] + p.sz * a + p.dz * b]);
  };
  const addCollider = (halfAcross, r) => {
    if (!pier.onLand) return;
    const a = p.at(s, -halfAcross), b = p.at(s, halfAcross);
    ctx.walk.addCapsule({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r });
  };

  if (p.type === 'vpier') {
    // 원효대교: V자 교각
    const footTop = Math.max(base + 2.4, pier.onLand ? base + 1.6 : 1.6);
    cg.color(0x8a8880);
    cg.prism(stadium(W / 2 - 3.2, 2.2), base, footTop);
    ag.color(0x9a978e);
    for (const a of [-(W / 2 - 4.2), W / 2 - 4.2]) {
      const b = p.at(s, a);
      for (const sgn of [-1, 1]) {
        const t = p.at(s + sgn * 8.5, a);
        ag.beam([b[0], footTop - 0.3, b[1]], [t[0], p.deckY(s + sgn * 8.5) - 2.2, t[1]], 1.5, 1.7);
      }
    }
    addCollider(W / 2 - 3.2, 2.2);
    return;
  }
  if (p.type === 'double') {
    // 반포대교: 둥근 기둥 2개 + 가로보 (잠수교 양옆으로 선다)
    cg.color(0x94928a);
    for (const a of [-8.4, 8.4]) {
      const q = p.at(s, a);
      cg.cylinder(q[0], base, q[1], 1.15, 1.05, top - 1.5 - base, 12, false);
    }
    cg.color(0x8a8880);
    cg.obox([c[0], top - 0.75, c[1]], [p.sx * (W / 2 - 0.8), 0, p.sz * (W / 2 - 0.8)], [0, 0.75, 0], [p.dx * 1.2, 0, p.dz * 1.2]);
    return;
  }
  if (p.type === 'truss') {
    // 한강철교: 뾰족한 물가름이 있는 석조 교각
    cg.color(0x7d776c);
    const hw = W / 2 - 1, pts = [];
    pts.push([hw + 2.2, 0], [hw, 1.4], [-hw, 1.4], [-hw - 2.2, 0], [-hw, -1.4], [hw, -1.4]);
    cg.prism(pts.map(([a, b]) => [c[0] + p.sx * a + p.dx * b, c[1] + p.sz * a + p.dz * b]), base, top - 0.6);
    cg.color(0x8c867a);
    cg.obox([c[0], top - 0.3, c[1]], [p.sx * (hw + 0.6), 0, p.sz * (hw + 0.6)], [0, 0.3, 0], [p.dx * 1.8, 0, p.dz * 1.8]);
    addCollider(hw, 1.6);
    return;
  }
  // 기본: 벽식 교각 + 머리보
  cg.color(0x8f8d85);
  const hw = W / 2 - (p.type === 'haunch' ? 4.2 : 3.6);
  cg.prism(stadium(hw, 1.05), base, top - 1.0);
  cg.color(0x86847c);
  cg.obox([c[0], top - 0.5, c[1]], [p.sx * (hw + 1.6), 0, p.sz * (hw + 1.6)], [0, 0.5, 0], [p.dx * 1.35, 0, p.dz * 1.35]);
  addCollider(hw, 1.3);
}

// 포물선 아치 한 줄의 프레임
function archFrames(p, s0, s1, rise, aFn, n = 28) {
  const out = [];
  const len = s1 - s0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = s0 + len * t;
    const h = 4 * rise * t * (1 - t), dh = 4 * rise * (1 - 2 * t) / len; // dh/ds
    const a = aFn(h / rise);
    const q = p.at(s, a);
    const tl = Math.hypot(1, dh);
    out.push({
      p: [q[0], p.deckY(s) + 0.25 + h, q[1]],
      s: [p.sx, 0, p.sz],
      u: [(-p.dx * dh) / tl, 1 / tl, (-p.dz * dh) / tl],
      t, h, a, sv: s,
    });
  }
  return out;
}

// 서강대교: 붉은 닐센 아치(안쪽으로 기운 두 리브 + 엇갈린 케이블)
function buildNielsen(p, ag) {
  const [s0, s1] = p.archSpans[0];
  const rise = 15.5, a0 = p.W / 2 - 3.25, aTop = 2.4;
  const ribs = [];
  for (const sgn of [1, -1]) {
    ag.color(0xc23b30);
    const fr = archFrames(p, s0, s1, rise, (k) => sgn * lerp(a0, aTop, k), 36);
    ag.sweep(fr, [[-0.5, -0.65], [0.5, -0.65], [0.5, 0.65], [-0.5, 0.65]], { caps: true });
    ribs.push(fr);
    // 엇갈린 케이블
    ag.color(0xd8d4cc);
    const nH = 16;
    for (let i = 1; i < nH; i++) {
      const t = i / nH, f = fr[Math.round(t * 36)];
      for (const off of [-0.07, 0.07]) {
        const sD = lerp(s0, s1, Math.min(0.98, Math.max(0.02, t + off)));
        const q = p.at(sD, sgn * a0);
        ag.beam(f.p, [q[0], p.deckY(sD) + 0.3, q[1]], 0.09, 0.09);
      }
    }
  }
  // 리브 사이 가로재
  ag.color(0xc23b30);
  for (let i = 5; i <= 31; i += 2) {
    const a = ribs[0][i], b = ribs[1][i];
    if (a.h > 7.0) ag.beam(a.p, b.p, 0.45, 0.45);
  }
}

// 한강대교·동작대교: 수직 행어가 있는 타이드/랭거 아치 (경간마다 반복)
function buildTiedArches(p, ag, o) {
  for (const [s0, s1] of p.archSpans) {
    const len = s1 - s0, rise = len * o.riseK;
    const ribs = [];
    for (const sgn of [1, -1]) {
      ag.color(o.color);
      const fr = archFrames(p, s0 + 0.6, s1 - 0.6, rise, () => sgn * o.aRib, 26);
      ag.sweep(fr, [[-o.ribW / 2, -o.ribH / 2], [o.ribW / 2, -o.ribH / 2], [o.ribW / 2, o.ribH / 2], [-o.ribW / 2, o.ribH / 2]], { caps: true });
      ribs.push(fr);
      for (let i = 2; i <= 24; i += 2) {
        const f = fr[i];
        const q = p.at(f.sv, sgn * o.aRib);
        ag.beam(f.p, [q[0], p.deckY(f.sv) + 0.15, q[1]], 0.14, 0.14);
      }
    }
    for (let i = 4; i <= 22; i += 3) {
      const a = ribs[0][i], b = ribs[1][i];
      if (a.h > o.clear) ag.beam(a.p, b.p, 0.3, 0.3);
    }
    for (let i = 4; i < 22; i += 3) {
      const a = ribs[0][i], b = ribs[1][i + 3];
      if (a.h > o.clear && b.h > o.clear) ag.beam(a.p, b.p, 0.16, 0.16);
    }
  }
}

// 동작대교 가운데 지하철 4호선 선로
function buildMedianTrack(p, cg, sg) {
  const fr = framesAlong(p, 4, p.L - 4, 3, p.deckY);
  cg.color(0x4a463f);
  cg.sweep(fr, [[-3.45, 0], [3.45, 0], [3.45, 0.28], [-3.45, 0.28]], { skip: [0] });
  cg.color(0x96938b);
  for (const a of [-3.6, 3.6]) cg.sweep(fr, [[a - 0.12, 0], [a + 0.12, 0], [a + 0.12, 1.05], [a - 0.12, 1.05]], { skip: [0] });
  sg.color(0x6f6a62);
  for (const c of [-1.75, 1.75]) {
    for (const r of [-0.72, 0.72]) {
      const a = c + r;
      sg.sweep(fr, [[a - 0.04, 0.28], [a + 0.04, 0.28], [a + 0.04, 0.42], [a - 0.04, 0.42]], { skip: [0] });
    }
  }
  // 전차선 기둥
  sg.color(0x595d63);
  for (let s = 14; s < p.L - 10; s += 22) {
    if (p.archSpans.some(([a, b]) => s > a && s < b)) continue;
    const y = p.deckY(s);
    for (const sgn of [-1, 1]) {
      const b = p.at(s, sgn * 3.25), t = p.at(s, sgn * 1.2);
      sg.beam([b[0], y + 0.3, b[1]], [b[0], y + 5.6, b[1]], 0.16, 0.16);
      sg.beam([b[0], y + 5.4, b[1]], [t[0], y + 5.4, t[1]], 0.1, 0.1);
    }
  }
}

// 한강철교: 나란한 세 줄의 트러스교
function buildTruss(p, ag, sg) {
  const lines = [{ a: -8.6, h: 6.2, c: 0x5e7f88 }, { a: 0, h: 7.2, c: 0x6c8a78 }, { a: 8.6, h: 6.2, c: 0x767c84 }];
  const piers = p.pierS.filter((s) => s > 6 && s < p.L - 6);
  const edges = [4, ...piers, p.L - 4];
  for (const ln of lines) {
    const P = (s, a, y) => { const q = p.at(s, ln.a + a); return [q[0], p.deckY(s) + y, q[1]]; };
    // 바닥판과 선로
    sg.color(0x4b4a47);
    const fr = framesAlong(p, 2, p.L - 2, 4, p.deckY, ln.a);
    sg.sweep(fr, [[-2.7, -0.55], [2.7, -0.55], [2.7, 0], [-2.7, 0]]);
    sg.color(0x3a3835);
    sg.sweep(fr, [[-1.9, 0], [1.9, 0], [1.9, 0.12], [-1.9, 0.12]], { skip: [0] });
    sg.color(0x77726a);
    for (const r of [-0.72, 0.72]) sg.sweep(fr, [[r - 0.04, 0.12], [r + 0.04, 0.12], [r + 0.04, 0.27], [r - 0.04, 0.27]], { skip: [0] });

    ag.color(ln.c);
    for (let k = 0; k < edges.length - 1; k++) {
      const s0 = edges[k] + 0.4, s1 = edges[k + 1] - 0.4, len = s1 - s0;
      if (len < 10) continue;
      let np = Math.max(4, Math.round(len / 5));
      if (np % 2) np++;
      const over = s0 > p.sW0 - 30 && s1 < p.sW1 + 30;
      if (!over) continue; // 물 위 구간에만 트러스
      for (const sd of [-2.5, 2.5]) {
        ag.beam(P(s0, sd, 0.1), P(s1, sd, 0.1), 0.34, 0.4); // 하현재
        ag.beam(P(s0 + len / np, sd, ln.h), P(s1 - len / np, sd, ln.h), 0.34, 0.4); // 상현재
        for (let i = 0; i < np; i++) {
          const a = s0 + (len * i) / np, b = s0 + (len * (i + 1)) / np;
          if (i === 0) ag.beam(P(a, sd, 0.1), P(b, sd, ln.h), 0.3, 0.34);
          else if (i === np - 1) ag.beam(P(a, sd, ln.h), P(b, sd, 0.1), 0.3, 0.34);
          else if (i % 2 === 1) ag.beam(P(a, sd, ln.h), P(b, sd, 0.1), 0.2, 0.22);
          else ag.beam(P(a, sd, 0.1), P(b, sd, ln.h), 0.2, 0.22);
          if (i > 0) ag.beam(P(a, sd, 0.1), P(a, sd, ln.h), 0.2, 0.2);
        }
      }
      for (let i = 1; i < np; i++) {
        const a = s0 + (len * i) / np;
        ag.beam(P(a, -2.5, ln.h), P(a, 2.5, ln.h), 0.18, 0.18);
        if (i < np - 1) {
          const b = s0 + (len * (i + 1)) / np;
          ag.beam(P(a, i % 2 ? -2.5 : 2.5, ln.h), P(b, i % 2 ? 2.5 : -2.5, ln.h), 0.1, 0.1);
        }
      }
    }
  }
}

// 잠수교: 낮은 아래층 다리. 가운데가 배가 지나도록 볼록하다.
function buildJamsu(ctx, p, cg, sg, group) {
  const J = p.jamsu;
  const fr = framesAlong(p, J.s0, J.s1, 3, J.y);
  cg.color(0x8f8d86);
  cg.sweep(fr, [[-J.W / 2, 0], [J.W / 2, 0], [J.W / 2, -0.75], [-J.W / 2, -0.75]], { skip: [0] });
  const top = new THREE.Mesh(ribbon(fr, -J.W / 2, J.W / 2, 0.01), new THREE.MeshStandardMaterial({ map: deckTexture(J.W, { jamsu: true }), roughness: 0.92 }));
  top.receiveShadow = true;
  group.add(top);
  ctx.wetMaterials.push(top.material);
  // 낮은 교각
  cg.color(0x85837c);
  for (let s = J.s0 + 12; s < J.s1 - 8; s += 17) {
    const y = J.y(s);
    if (y < 2.6) continue;
    const c = p.at(s);
    cg.obox([c[0], (y - 0.75 - 6) / 2, c[1]], [p.sx * (J.W / 2 - 1.2), 0, p.sz * (J.W / 2 - 1.2)], [0, (y - 0.75 + 6) / 2, 0], [p.dx * 0.7, 0, p.dz * 0.7]);
  }
  // 난간과 조명
  const yaw = Math.atan2(-p.dz, p.dx);
  for (const s of [1, -1]) {
    const a = s * (J.W / 2 - 0.15);
    const fr2 = framesAlong(p, J.s0 + 13, J.s1 - 13, 3, J.y);
    sg.color(0x5c6168);
    sg.sweep(fr2, [[a - 0.05, 1.02], [a + 0.05, 1.02], [a + 0.05, 1.1], [a - 0.05, 1.1]]);
    sg.sweep(fr2, [[a - 0.025, 0.55], [a + 0.025, 0.55], [a + 0.025, 0.6], [a - 0.025, 0.6]]);
    for (let sv = J.s0 + 13.3; sv < J.s1 - 13; sv += 2.4) {
      const q = p.at(sv, a);
      sg.box(q[0], J.y(sv) + 0.52, q[1], 0.07, 1.04, 0.07, yaw);
    }
    for (let sv = J.s0 + 16; sv < J.s1 - 14; sv += 17) {
      const q = p.at(sv, s * (J.W / 2 - 0.5));
      ctx.lamps.push({ x: q[0], y: J.y(sv), z: q[1], kind: 'low', dirx: -p.sx * s, dirz: -p.sz * s });
    }
  }
}

// 둔치 ↔ 다리 보도 계단
function buildStair(p, st, cg, sg) {
  const { end, sg: side, sB, sT, yB, n, land } = st;
  const aC = side * (p.W / 2 + 1.25), halfW = 1.2;
  const yaw = Math.atan2(-p.dz, p.dx);
  const rise = (st.yT - yB) / n;
  // 디딤판
  cg.color(0xa29f96);
  for (let i = 0; i < n; i++) {
    const s = sB + end * (i + 0.5) * STEP_RUN;
    const q = p.at(s, aC);
    const y = yB + (i + 1) * rise;
    cg.obox([q[0], y - 0.09, q[1]], [p.sx * halfW, 0, p.sz * halfW], [0, 0.09, 0], [p.dx * (STEP_RUN / 2 + 0.02), 0, p.dz * (STEP_RUN / 2 + 0.02)]);
  }
  // 계단참
  const sL = sT + end * land / 2;
  const qL = p.at(sL, aC);
  cg.obox([qL[0], p.deckY(sL) + SIDEWALK_H - 0.12, qL[1]], [p.sx * halfW, 0, p.sz * halfW], [0, 0.12, 0], [p.dx * (land / 2), 0, p.dz * (land / 2)]);
  // 옆판(스트링거)과 받침 기둥
  cg.color(0x8a8880);
  for (const e of [-1, 1]) {
    const a = aC + e * (halfW + 0.07);
    const b0 = p.at(sB, a), b1 = p.at(sT, a), b2 = p.at(sT + end * land, a);
    cg.beam([b0[0], yB - 0.15, b0[1]], [b1[0], st.yT - 0.3, b1[1]], 0.14, 0.5);
    cg.beam([b1[0], st.yT - 0.3, b1[1]], [b2[0], p.deckY(sT + end * land) + SIDEWALK_H - 0.3, b2[1]], 0.14, 0.5);
  }
  for (const k of [0.5, 1]) {
    const s = sB + end * st.len * k + (k === 1 ? end * land * 0.6 : 0);
    const q = p.at(s, aC);
    const yTop = (k === 1 ? p.deckY(s) + SIDEWALK_H : yB + (st.yT - yB) * k) - 0.5;
    const yBot = heightAt(q[0], q[1]) - 0.3;
    if (yTop - yBot > 1) cg.cylinder(q[0], yBot, q[1], 0.28, 0.28, yTop - yBot, 8, false);
  }
  // 난간
  sg.color(0x5c6168);
  for (const e of [-1, 1]) {
    const a = aC + e * (halfW - 0.04);
    const b0 = p.at(sB, a), b1 = p.at(sT, a), b2 = p.at(sT + end * land, a);
    const y2 = p.deckY(sT + end * land) + SIDEWALK_H;
    sg.beam([b0[0], yB + 1.05, b0[1]], [b1[0], st.yT + 1.05, b1[1]], 0.07, 0.07);
    // 다리 쪽은 보도로 드나드는 곳이라 계단참 난간을 비운다
    if (e * side > 0) {
      sg.beam([b1[0], st.yT + 1.05, b1[1]], [b2[0], y2 + 1.05, b2[1]], 0.07, 0.07);
      for (let k = 0; k <= 2; k++) {
        const q = p.at(sT + end * land * (k / 2), a);
        sg.box(q[0], p.deckY(sT + end * land * (k / 2)) + SIDEWALK_H + 0.52, q[1], 0.06, 1.05, 0.06, yaw);
      }
    }
    for (let i = 0; i <= n; i += 5) {
      const q = p.at(sB + end * i * STEP_RUN, a);
      sg.box(q[0], yB + i * rise + 0.52, q[1], 0.06, 1.05, 0.06, yaw);
    }
  }
  // 계단참 끝 난간
  const e0 = p.at(sT + end * land, aC - halfW), e1 = p.at(sT + end * land, aC + halfW);
  const yE = p.deckY(sT + end * land) + SIDEWALK_H + 1.05;
  sg.beam([e0[0], yE, e0[1]], [e1[0], yE, e1[1]], 0.07, 0.07);
}
