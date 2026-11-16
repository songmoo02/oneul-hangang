// 플레이어 주변 192×192유닛의 지면 정보를 담는 "따라다니는 지도" 텍스처.
// R: 지면 높이, G: 풀 종류(0 없음, 0.35 잔디, 0.7 거친 풀), B: 예비, A: 머리 위 나뭇잎 양(낙엽용)
// 풀·낙엽 셰이더가 정점 단계에서 읽는다. 플레이어가 움직이면 새로 드러난 줄만 다시 계산한다.
import * as THREE from 'three';
import { smoothstep } from '../core/math.js';
import { sampleField, heightFromField, pathSDF, NODEUL_FRAME, ZONE, LEVEE_W } from './field.js';

export const GM_N = 128, GM_T = 1.5;
export const GM_SIZE = GM_N * GM_T;

// 셰이더에서 지도를 읽는 함수. 반정밀 실수 텍스처의 선형 보간이 안 되는 기기가 있어 직접 4점을 섞는다.
export const GM_GLSL = /* glsl */ `
uniform sampler2D uGrassMap;
vec4 gmSample(vec2 w) {
  vec2 st = w / ${GM_T.toFixed(2)} - 0.5;
  vec2 i = floor(st), f = st - i;
  const float inv = 1.0 / ${GM_N.toFixed(1)};
  vec4 a = texture2D(uGrassMap, (i + vec2(0.5, 0.5)) * inv);
  vec4 b = texture2D(uGrassMap, (i + vec2(1.5, 0.5)) * inv);
  vec4 c = texture2D(uGrassMap, (i + vec2(0.5, 1.5)) * inv);
  vec4 d = texture2D(uGrassMap, (i + vec2(1.5, 1.5)) * inv);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

export class GrassMap {
  constructor(ctx) {
    this.ctx = ctx;
    this.data = new Uint16Array(GM_N * GM_N * 4);
    this.tex = new THREE.DataTexture(this.data, GM_N, GM_N, THREE.RGBAFormat, THREE.HalfFloatType);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.oi = null; this.oj = null;
    this._f = {};
    // 나무 위치 격자(낙엽이 나무 아래에만 생기도록)
    this.cells = new Map();
    for (const t of ctx.trees || []) {
      if (t.v === 2) continue; // 소나무는 잎을 떨구지 않는다
      const k = Math.floor(t.x / 8) * 100003 + Math.floor(t.z / 8);
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(t);
    }
  }

  canopy(x, z) {
    const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
    let m = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = this.cells.get((ci + a) * 100003 + (cj + b));
      if (!arr) continue;
      for (const t of arr) {
        const d = Math.hypot(t.x - x, t.z - z);
        const v = 1 - smoothstep(1.2 * t.s, 4.6 * t.s, d);
        if (v > m) m = v;
      }
    }
    return m;
  }

  _fill(i, j) {
    const x = (i + 0.5) * GM_T, z = (j + 0.5) * GM_T, f = this._f;
    sampleField(x, z, f);
    const h = heightFromField(f, x, z), d = f.d;
    let g = 0;
    if (d > 0) {
      if (f.zone <= 1) {
        const w = f.w;
        const onPath = (d > 5.5 && d < 9.9) || (w > 20 && d > 11.5 && d < 16.9);
        if (d > 5.3 && !onPath && d < w + LEVEE_W - 1.5) {
          if (d < w - 1 && pathSDF(x, z) < 0.5) g = 0;
          else g = d < w - 1 ? 0.35 : 0.7;
        }
      } else if (f.zone === ZONE.NODEUL) {
        const F = NODEUL_FRAME;
        const s = (x - F.cx) * F.ax + (z - F.cz) * F.az;
        if (d > 10.2 && h < F.topY - 1.6) g = d < 18.5 ? 0.7 : s > 48 ? 0.6 : 0.35;
      } else if (f.zone === ZONE.SEORAE) {
        if (d > 7.3 || (d > 2.8 && d < 3.9)) g = 0.4;
      }
    }
    const k = ((((j % GM_N) + GM_N) % GM_N) * GM_N + (((i % GM_N) + GM_N) % GM_N)) * 4;
    const H = THREE.DataUtils.toHalfFloat;
    this.data[k] = H(h);
    this.data[k + 1] = H(g);
    this.data[k + 2] = 0;
    this.data[k + 3] = H(d > 0.3 ? this.canopy(x, z) : 0);
  }

  update(cx, cz) {
    const ci = Math.floor(cx / GM_T) - GM_N / 2, cj = Math.floor(cz / GM_T) - GM_N / 2;
    if (ci === this.oi && cj === this.oj) return;
    const full = this.oi === null || Math.abs(ci - this.oi) >= GM_N || Math.abs(cj - this.oj) >= GM_N;
    if (full) {
      for (let j = cj; j < cj + GM_N; j++) for (let i = ci; i < ci + GM_N; i++) this._fill(i, j);
    } else {
      for (let i = ci; i < ci + GM_N; i++) {
        if (i >= this.oi && i < this.oi + GM_N) continue;
        for (let j = cj; j < cj + GM_N; j++) this._fill(i, j);
      }
      for (let j = cj; j < cj + GM_N; j++) {
        if (j >= this.oj && j < this.oj + GM_N) continue;
        for (let i = ci; i < ci + GM_N; i++) this._fill(i, j);
      }
    }
    this.oi = ci; this.oj = cj;
    this.tex.needsUpdate = true;
  }
}
