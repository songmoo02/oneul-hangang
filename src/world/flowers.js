// 꽃밭: 10월 한강의 코스모스. 한 송이씩 바람(통합 바람 함수)에 흔들린다.
import * as THREE from 'three';
import { mulberry32, lerp } from '../core/math.js';
import { injectedMaterial } from './grass.js';
import { bankN, bankS, heightAt, pathSDF, sampleField } from './field.js';
import { WALK_X_MIN, WALK_X_MAX } from './geo.js';

function flowerGeometry() {
  const pos = [], part = [], idx = [];
  const v = (x, y, z, p) => { pos.push(x, y, z); part.push(p); return pos.length / 3 - 1; };
  const H = 0.55;
  // 줄기
  const a = v(-0.016, 0, 0, 0), b = v(0.016, 0, 0, 0), c = v(0.016, H, 0, 0), d = v(-0.016, H, 0, 0);
  idx.push(a, b, c, a, c, d);
  // 잎 한 쌍
  const l0 = v(0, 0.2, 0, 0), l1 = v(0.1, 0.3, 0.02, 0), l2 = v(0.02, 0.27, 0, 0), l3 = v(-0.1, 0.24, -0.02, 0), l4 = v(-0.02, 0.2, 0, 0);
  idx.push(l0, l1, l2, l0, l4, l3);
  // 꽃잎 8장(살짝 기울인 원판)과 가운데
  const tilt = 0.5, ct = Math.cos(tilt), st = Math.sin(tilt);
  const P = (r, ang, p, lift = 0) => { const x = Math.cos(ang) * r, y0 = Math.sin(ang) * r; return v(x, H + y0 * st + lift, y0 * ct + lift * 0.3, p); };
  const c0 = v(0, H, 0, 1);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * 6.283, p1 = P(0.13, a0 - 0.3, 1), p2 = P(0.13, a0 + 0.3, 1);
    idx.push(c0, p1, p2);
  }
  const m0 = v(0, H + 0.012, 0.01, 2);
  for (let i = 0; i < 5; i++) idx.push(m0, P(0.032, (i / 5) * 6.283, 2, 0.012), P(0.032, ((i + 1) / 5) * 6.283, 2, 0.012));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const KINDS = [
  { name: '코스모스', cols: [[0.9, 0.32, 0.55], [0.93, 0.9, 0.88], [0.62, 0.09, 0.33], [0.95, 0.55, 0.72]] },
  { name: '황화코스모스', cols: [[0.95, 0.5, 0.06], [0.98, 0.72, 0.1], [0.9, 0.36, 0.05]] },
  { name: '코스모스', cols: [[0.93, 0.9, 0.88], [0.95, 0.55, 0.72], [0.9, 0.32, 0.55]] },
];

export function buildFlowers(ctx, count = 9000) {
  const rnd = mulberry32(2024), o = {}, f = {};
  const patches = [];
  for (let tries = 0; tries < 800 && patches.length < 16; tries++) {
    const bank = tries % 2 ? bankS : bankN, north = bank === bankN;
    bank.at(bank.uAtX(lerp(WALK_X_MIN + 80, WALK_X_MAX - 80, rnd())), o);
    const nx = north ? o.tz : -o.tz, nz = north ? -o.tx : o.tx;
    sampleField(o.x + nx * 20, o.z + nz * 20, f);
    if (f.w < 44 || f.zone > 1) continue;
    const d = 19 + rnd() * (f.w - 34), x = o.x + nx * d, z = o.z + nz * d, r = 5 + rnd() * 6;
    if (pathSDF(x, z) < r * 0.6 || ctx.nearBridge(x, z, 8)) continue;
    if (patches.some((p) => Math.hypot(p.x - x, p.z - z) < 90)) continue;
    const kind = KINDS[patches.length % KINDS.length];
    patches.push({ x, z, r, y: heightAt(x, z), name: kind.name, kind });
  }
  const per = Math.floor(count / Math.max(1, patches.length));
  const N = per * patches.length;
  const aOff = new Float32Array(N * 4), aY = new Float32Array(N), aCol = new Float32Array(N * 3);
  let k = 0;
  for (const p of patches) {
    for (let i = 0; i < per; i++) {
      let x, z;
      for (let t = 0; t < 6; t++) { const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * p.r; x = p.x + Math.cos(a) * rr; z = p.z + Math.sin(a) * rr; if (pathSDF(x, z) > 0.6) break; }
      aOff.set([x, z, rnd() * 6.283, 0.75 + rnd() * 0.7], k * 4);
      aY[k] = heightAt(x, z);
      aCol.set(p.kind.cols[Math.floor(rnd() * p.kind.cols.length)], k * 3);
      k++;
    }
  }
  const base = flowerGeometry();
  const g = new THREE.InstancedBufferGeometry();
  for (const n of ['position', 'normal', 'aPart']) g.setAttribute(n, base.getAttribute(n));
  g.setIndex(base.getIndex());
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(aOff, 4));
  g.setAttribute('aY', new THREE.InstancedBufferAttribute(aY, 1));
  g.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  g.instanceCount = N;
  const mat = injectedMaterial(ctx, {
    uniforms: {},
    vertPre: 'attribute vec4 aOff; attribute float aY, aPart; attribute vec3 aCol; varying vec3 vFCol;',
    vertMain: /* glsl */ `
      vec3 fp = position * aOff.w;
      float cr = cos(aOff.z), sr = sin(aOff.z);
      fp.xz = vec2(fp.x * cr + fp.z * sr, -fp.x * sr + fp.z * cr);
      float wv = windAt(aOff.xy);
      vec2 away; float press = trailPress(aOff.xy, away);
      float hk = clamp(position.y / 0.55, 0.0, 1.3);
      float bend = hk * hk * (0.04 + 0.2 * wv + 0.03 * sin(uTime * 2.1 + aOff.z * 9.0)) * aOff.w;
      vec3 gPos = vec3(aOff.x + fp.x + uWindDir.x * bend + away.x * press * hk * 0.3, aY + fp.y * (1.0 - press * 0.5) - bend * 0.25, aOff.y + fp.z + uWindDir.y * bend + away.y * press * hk * 0.3);
      vec3 objectNormal = vec3(0.0, 1.0, 0.0);
      vFCol = aPart < 0.5 ? vec3(0.1, 0.26, 0.06) : aPart < 1.5 ? aCol * 0.72 : vec3(0.85, 0.6, 0.08);
    `,
    fragPre: 'varying vec3 vFCol;', fragColor: 'diffuseColor.rgb = vFCol;', roughness: 0.8,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'flowers';
  ctx.scene.add(mesh);
  return {
    patches, count: N, mesh,
    near(x, z) { for (const p of patches) if (Math.hypot(p.x - x, p.z - z) < p.r + 0.6) return p; return null; },
  };
}
