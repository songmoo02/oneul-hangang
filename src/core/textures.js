// 절차적 텍스처: 외부 이미지 없이 노이즈·수면 노멀을 코드로 만든다.
import * as THREE from 'three';
import { hash2 } from './math.js';

function periodicNoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % period) + period) % period;
  const x0 = m(ix) + seed, x1 = m(ix + 1) + seed, y0 = m(iy) + seed * 7, y1 = m(iy + 1) + seed * 7;
  const a = hash2(x0, y0), b = hash2(x1, y0), c = hash2(x0, y1), d = hash2(x1, y1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function periodicFbm(u, v, base, oct, seed) {
  let s = 0, a = 0.5, f = base, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * periodicNoise(u * f, v * f, f, seed + o * 13);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

// R: 큰 덩어리 fbm, G: 중간 fbm, B: 고주파, A: 또 다른 중간 fbm (모두 타일링 가능)
export function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size, v = j / size, k = (j * size + i) * 4;
      data[k] = 255 * periodicFbm(u, v, 4, 6, 1);
      data[k + 1] = 255 * periodicFbm(u, v, 8, 5, 31);
      data[k + 2] = 255 * periodicFbm(u, v, 32, 3, 57);
      data[k + 3] = 255 * periodicFbm(u, v, 16, 4, 83);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// 수면 잔물결용 노멀맵 (RG: 기울기, B: 높이)
export function makeWaterNormalTexture(size = 256) {
  const h = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size, v = j / size;
      // 잔물결: 능선이 살아 있도록 fbm을 접어서 사용
      const a = periodicFbm(u, v, 6, 5, 101);
      const b = periodicFbm(u, v, 12, 4, 151);
      h[j * size + i] = (1 - Math.abs(a * 2 - 1)) * 0.65 + b * 0.35;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (i, j) => h[((j + size) % size) * size + ((i + size) % size)];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * 6.0;
      const dy = (at(i, j + 1) - at(i, j - 1)) * 6.0;
      const k = (j * size + i) * 4;
      data[k] = 255 * Math.min(1, Math.max(0, 0.5 - dx * 0.5));
      data[k + 1] = 255 * Math.min(1, Math.max(0, 0.5 - dy * 0.5));
      data[k + 2] = 255 * at(i, j);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = opts.wrapS ?? THREE.ClampToEdgeWrapping;
  tex.wrapT = opts.wrapT ?? THREE.RepeatWrapping;
  tex.anisotropy = opts.anisotropy ?? 8;
  return tex;
}
