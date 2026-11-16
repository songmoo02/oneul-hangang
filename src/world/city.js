// 주변 환경(이동 불가 배경): 스카이라인 건물, 랜드마크, 남산과 먼 산.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';
import { mulberry32, smoothstep, lerp, fbm2, clamp } from '../core/math.js';
import { sampleField, CITY_Y, LEVEE_W, ROAD_W, bankOffset } from './field.js';
import { toWorld, LANDMARKS, V_SCALE } from './geo.js';
import { TERRAIN_BOUNDS } from './terrain.js';

// ───────────────────────── 언덕·산 ─────────────────────────
const HILLS = [
  [37.5512, 126.9882, 128, 330], // 남산
  [37.5440, 127.0080, 52, 250],
  [37.5425, 126.9850, 38, 300],
  [37.5760, 126.9450, 140, 420], // 안산
  [37.5850, 126.9580, 165, 400], // 인왕산
  [37.5930, 126.9730, 170, 400], // 북악산
  [37.6280, 126.9800, 340, 1100], // 북한산(실제보다 가깝게 놓은 원경)
  [37.4990, 126.9740, 88, 260], // 서달산·현충원
  [37.5095, 126.9480, 22, 120], // 노량진
  [37.5075, 126.9620, 38, 160], // 흑석
  [37.4520, 126.9640, 300, 900], // 관악산
  [37.4690, 127.0070, 145, 450], // 우면산
  [37.5480, 127.0300, 44, 160], // 응봉
].map(([lat, lon, h, s]) => ({ ...toWorld(lat, lon), h, s }));

const _f = {};
export function hillHeight(x, z) {
  let h = 0;
  for (const k of HILLS) {
    const dx = x - k.x, dz = z - k.z;
    const r2 = (dx * dx + dz * dz) / (k.s * k.s);
    if (r2 < 9) h += k.h * Math.exp(-r2 * 1.6);
  }
  if (h < 0.01) return 0;
  sampleField(x, z, _f);
  const m = smoothstep(60, 230, _f.d - Math.min(_f.w, 200));
  return h * m * (0.8 + 0.4 * fbm2(x * 0.004, z * 0.004, 3));
}

function buildBackdrop(ctx) {
  const step = 50, X0 = -6000, X1 = 6000, Z0 = -5200, Z1 = 5200;
  const nx = (X1 - X0) / step, nz = (Z1 - Z0) / step;
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const B = TERRAIN_BOUNDS, f = {};
  const cForest = new THREE.Color(0x4d5a2c), cAutumn = new THREE.Color(0x8a6a2e), cCity = new THREE.Color(0x65635f), c = new THREE.Color();
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = X0 + i * step, z = Z0 + j * step, k = (j * (nx + 1) + i) * 3;
      const h = hillHeight(x, z);
      sampleField(x, z, f);
      const inside = x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
      let y;
      if (inside) y = f.d > f.w + 60 ? CITY_Y - 0.5 + h : -12;
      else y = f.d < 0 ? -4 : Math.min(CITY_Y, 1.5 + f.d * 0.4) + h;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const n = fbm2(x * 0.01, z * 0.01, 3);
      c.copy(cCity).lerp(c.clone().copy(cForest).lerp(cAutumn, smoothstep(0.35, 0.7, n)), smoothstep(6, 26, h));
      c.multiplyScalar(0.8 + 0.4 * n);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  const idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.frustumCulled = false;
  m.name = 'backdrop';
  ctx.scene.add(m);
}

// ───────────────────────── 건물 ─────────────────────────
function makeBuildingMaterial(ctx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWinLit = ctx.uniforms.uWinLit;
    shader.uniforms.uNightK = ctx.uniforms.uNightK;
    shader.uniforms.uTime = ctx.uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aSize; attribute vec4 aStyle;
        varying vec2 vWin; varying float vRoof; varying vec4 vStyle; varying float vBaseY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float faceW = abs(normal.x) > 0.5 ? aSize.z : aSize.x;
        vRoof = step(0.5, abs(normal.y));
        vec2 bay = aStyle.y < 0.5 ? vec2(2.6, 1.55) : (aStyle.y < 1.5 ? vec2(1.5, 1.75) : vec2(2.2, 1.6));
        vWin = vec2(uv.x * faceW / bay.x, uv.y * aSize.y / bay.y);
        vStyle = aStyle;
        vBaseY = position.y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWinLit, uNightK, uTime;
        varying vec2 vWin; varying float vRoof; varying vec4 vStyle; varying float vBaseY;
        float gBRough = 0.85, gBMetal = 0.0; vec3 gBEmis = vec3(0.0);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float wType = vStyle.y;
          vec2 cell = floor(vWin), fw2 = fract(vWin);
          float pix = max(fwidth(vWin.x), fwidth(vWin.y));
          float crisp = 1.0 - smoothstep(0.3, 1.0, pix);
          vec2 lo = wType < 0.5 ? vec2(0.06, 0.30) : (wType < 1.5 ? vec2(0.04, 0.07) : vec2(0.16, 0.28));
          vec2 hi = wType < 0.5 ? vec2(0.94, 0.74) : (wType < 1.5 ? vec2(0.96, 0.90) : vec2(0.84, 0.76));
          float e = clamp(pix, 0.01, 0.3);
          float win = smoothstep(lo.x, lo.x + e, fw2.x) * smoothstep(hi.x, hi.x - e, fw2.x)
                    * smoothstep(lo.y, lo.y + e, fw2.y) * smoothstep(hi.y, hi.y - e, fw2.y);
          // 아파트: 계단실·벽체 때문에 창이 없는 세로 줄
          float solid = wType < 0.5 ? step(mod(cell.x + floor(vStyle.x), 5.0), 0.5) : 0.0;
          win *= mix(1.0, 1.0 - solid, crisp);
          float cover = (hi.x - lo.x) * (hi.y - lo.y) * (wType < 0.5 ? 0.8 : 1.0);
          win = mix(cover, win, crisp) * (1.0 - vRoof);
          float rnd = fract(sin(dot(cell + vStyle.x * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
          float rnd2 = fract(rnd * 91.7);
          float litP = clamp(uWinLit * vStyle.z * (0.45 + 0.9 * fract(vStyle.x * 0.731)) * (wType > 0.5 && wType < 1.5 ? 0.5 : 1.0), 0.0, 1.0);
          // 멀어지면 창 3×3칸을 한 덩어리로 묶어 반짝임을 유지하고, 더 멀면 평균값으로
          float rndM = fract(sin(dot(floor(vWin / 3.0) + vStyle.x * 17.0, vec2(39.346, 11.135))) * 43758.5453);
          float crisp2 = 1.0 - smoothstep(1.2, 4.0, pix);
          float lit = mix(mix(litP, step(rndM, litP * 1.15), crisp2), step(rnd, litP), crisp);
          bool office = wType > 0.5 && wType < 1.5;
          vec3 glass = office ? vec3(0.07, 0.12, 0.17) : vec3(0.13, 0.17, 0.22);
          diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.3, vBaseY)); // 아래쪽은 살짝 어둡게
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * (office ? 1.0 : 0.85));
          // 옥상: 아파트는 초록 방수 페인트, 그 외는 회색
          vec3 roofCol = wType < 0.5 ? mix(vec3(0.16, 0.27, 0.19), vec3(0.3, 0.3, 0.3), step(0.6, fract(vStyle.x * 0.37))) : vec3(0.25, 0.25, 0.26);
          diffuseColor.rgb = mix(diffuseColor.rgb, roofCol, vRoof);
          gBRough = mix(0.85, office ? 0.1 : 0.28, win);
          gBMetal = mix(0.0, office ? 0.9 : 0.15, win);
          // 야경: 창마다 빛깔과 밝기가 다르고, 사무실은 층 단위로 켜지며, 일부 고층은 미디어 파사드와 옥상 띠 조명이 있다
          float bh = fract(vStyle.x * 0.613);
          vec3 warm = rnd2 < 0.48 ? vec3(1.0, 0.72, 0.4) : rnd2 < 0.7 ? vec3(1.0, 0.9, 0.7) : rnd2 < 0.88 ? vec3(0.78, 0.89, 1.0) : rnd2 < 0.94 ? vec3(0.45, 0.9, 0.85) : vec3(1.0, 0.5, 0.68);
          if (office) warm = mix(warm, vec3(0.72, 0.87, 1.0), 0.45 + 0.4 * bh);
          float bright = 0.55 + 1.3 * fract(rnd * 7.31);
          float floorLit = office ? step(fract(sin(cell.y * 12.7 + vStyle.x * 3.1) * 4375.5), 0.13 * uWinLit) * crisp2 : 0.0;
          lit = max(lit, floorLit);
          gBEmis = warm * warm * win * lit * uNightK * mix(0.62, bright * 0.6, crisp);
          float media = office ? step(0.955, bh) : 0.0;
          vec3 mcol = 0.5 + 0.5 * cos(6.2832 * (cell.y * 0.035 + cell.x * 0.01 + uTime * 0.06 + bh * 3.0 + vec3(0.0, 0.33, 0.67)));
          gBEmis = mix(gBEmis, mix(vec3(0.6), mcol, 0.7) * (0.25 + 0.75 * win) * uNightK * 0.55, media * 0.85);
          float crown = smoothstep(0.955, 0.975, vBaseY) * (1.0 - vRoof) * step(0.45, bh) * (wType > 0.5 ? 1.0 : 0.35);
          vec3 ccol = 0.55 + 0.45 * cos(6.2832 * (bh * 4.0 + vec3(0.0, 0.33, 0.67)));
          gBEmis += crown * ccol * 1.3 * uNightK;
          // 옥상 항공장애등(붉게 깜박임)
          gBEmis += vec3(2.5, 0.1, 0.05) * vRoof * step(0.7, bh) * step(0.985, max(abs(fract(vWin.x * 0.02) - 0.5), 0.0) + 0.5) * step(0.5, fract(uTime * 0.45 + bh)) * uNightK * (wType > 0.5 ? 1.0 : 0.0);
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gBRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gBMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gBEmis;');
  };
  return mat;
}

export function buildCity(ctx) {
  buildBackdrop(ctx);
  const rnd = mulberry32(20261014);
  const list = []; // {x,y,z,w,h,d,rot,type,seed,lit,color}
  const f = {}, g1 = {}, g2 = {};
  const WALLS_APT = [0xcfc9bc, 0xc2c7cb, 0xd8d1c0, 0xb9b2a5, 0xc9c0b2, 0xaeb5ba, 0xbfae98, 0xa9a39a, 0xd2cabb];
  const WALLS_LOW = [0xb8b0a2, 0xa9a59c, 0xc2b8a8, 0x9d9a94, 0xb5a696];
  const WALLS_OFFICE = [0x7f95a8, 0x6b8196, 0x8fa3b0, 0x5f7488, 0x9aa7ad, 0x74889a];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const xYeouidoE = toWorld(0, 126.9445).x, xSeogang = toWorld(0, 126.9150).x;
  const xHangang = toWorld(0, 126.9600).x, xDongjak = toWorld(0, 126.9810).x, xBanpoW = toWorld(0, 126.9860).x;
  const cemetery = toWorld(37.4995, 126.9745);

  const cellSize = 36;
  for (let z = -2300; z < 2100; z += cellSize) {
    for (let x = -3000; x < 3200; x += cellSize) {
      const px = x + (rnd() - 0.5) * 16, pz = z + (rnd() - 0.5) * 16;
      sampleField(px, pz, f);
      if (f.zone > 1 || f.d < 0) continue;
      const inland = f.d - f.w - LEVEE_W - ROAD_W;
      if (inland < 9) continue;
      // 멀수록 듬성듬성
      if (rnd() > clamp(1.25 - inland / 1500, 0.3, 1)) continue;
      // 강변과 나란한 방향
      sampleField(px + 8, pz, g1); sampleField(px, pz + 8, g2);
      const rot = Math.atan2(g2.d - f.d, g1.d - f.d) + Math.PI / 2;
      const south = f.zone === 1;
      let type = 0, h = 20, w = 22, d = 7, lit = 1, color;
      const r = rnd();
      const hh = hillHeightCached(px, pz);
      if (hh > 34) continue; // 산 정상부는 숲
      if (Math.hypot(px - cemetery.x, pz - cemetery.z) < 230) continue; // 현충원

      if (south && px < xYeouidoE && inland < 330) {
        // 여의도
        const core = px > xSeogang + 180 && px < xYeouidoE - 150 && inland > 40;
        if (core && r < 0.6) { type = 1; h = lerp(48, 120, Math.pow(rnd(), 1.6)); w = lerp(16, 24, rnd()); d = lerp(14, 20, rnd()); lit = 1.2; }
        else if (r < 0.85) { type = 0; h = lerp(20, 32, rnd()); w = lerp(22, 30, rnd()); d = 6.5; }
        else { type = 1; h = lerp(30, 60, rnd()); w = 16; d = 14; }
      } else if (!south && px < xHangang - 240) {
        // 마포·공덕
        if (r < 0.22 && inland > 60) { type = 1; h = lerp(40, 95, Math.pow(rnd(), 1.5)); w = 15; d = 13; }
        else if (r < 0.7) { type = 0; h = lerp(26, 48, rnd()); w = lerp(18, 26, rnd()); d = 6.5; }
        else { type = 2; h = lerp(6, 16, rnd()); w = lerp(9, 15, rnd()); d = lerp(8, 12, rnd()); }
      } else if (!south && px < xHangang + 60) {
        // 용산
        if (r < 0.3 && inland > 40) { type = 1; h = lerp(50, 115, Math.pow(rnd(), 1.4)); w = 16; d = 14; lit = 1.1; }
        else if (r < 0.75) { type = 0; h = lerp(28, 52, rnd()); w = 22; d = 7; }
        else { type = 2; h = lerp(6, 15, rnd()); w = 11; d = 9; }
      } else if (!south && px < toWorld(0, 126.9960).x) {
        // 이촌: 강을 따라 늘어선 판상형 아파트
        if (inland < 150) { type = 0; h = lerp(26, 40, rnd()); w = lerp(24, 32, rnd()); d = 6.5; }
        else if (r < 0.25) { type = 0; h = lerp(22, 36, rnd()); w = 22; d = 6.5; }
        else if (r < 0.6) { type = 2; h = lerp(5, 13, rnd()); w = 10; d = 9; }
        else continue; // 용산공원 쪽은 비운다
      } else if (!south) {
        if (r < 0.55) { type = 0; h = lerp(20, 38, rnd()); w = 22; d = 7; } else { type = 2; h = lerp(5, 13, rnd()); w = 10; d = 9; }
      } else if (south && px < xDongjak - 40) {
        // 노량진·흑석
        if (r < 0.4) { type = 0; h = lerp(28, 48, rnd()); w = 22; d = 7; }
        else { type = 2; h = lerp(5, 14, rnd()); w = lerp(8, 13, rnd()); d = lerp(8, 11, rnd()); }
      } else if (south && px > xBanpoW) {
        // 반포: 대단지 아파트
        if (inland < 380) { type = 0; h = lerp(42, 62, rnd()); w = lerp(20, 26, rnd()); d = 8; lit = 1.1; }
        else if (r < 0.5) { type = 0; h = lerp(24, 44, rnd()); w = 22; d = 7; }
        else { type = 1; h = lerp(20, 50, rnd()); w = 14; d = 12; }
      } else {
        if (r < 0.5) { type = 0; h = lerp(22, 40, rnd()); w = 22; d = 7; } else { type = 2; h = lerp(5, 13, rnd()); w = 10; d = 9; }
      }
      color = type === 0 ? pick(WALLS_APT) : type === 1 ? pick(WALLS_OFFICE) : pick(WALLS_LOW);
      list.push({ x: px, y: CITY_Y + hh - 0.3, z: pz, w, h, d, rot: rot + (type === 2 ? rnd() * 0.5 : (rnd() - 0.5) * 0.12), type, seed: rnd() * 100, lit, color });
    }
  }

  // 랜드마크 타워 (같은 인스턴스 메시에 추가)
  const tower = (key, dx, dz, w, h, d, rot, color, lit = 1.2, type = 1) => {
    const p = toWorld(...LANDMARKS[key]);
    h *= 1.3; w *= 1.15; d *= 1.15; // 랜드마크는 실제보다 조금 크게 세워 멀리서도 눈에 띄게
    list.push({ x: p.x + dx, y: CITY_Y - 0.3, z: p.z + dz, w, h, d, rot, type, seed: rnd() * 100, lit: lit * 1.25, color });
    return p;
  };
  tower('parc1', -10, 0, 20, 333 * V_SCALE, 20, 0.6, 0x8fa0ae, 1.3);
  tower('parc1', 22, 14, 18, 256 * V_SCALE, 18, 0.6, 0x8fa0ae, 1.3);
  tower('ifc', 0, 0, 17, 284 * V_SCALE, 17, 0.5, 0x7e96a8, 1.3);
  tower('ifc', -24, 10, 15, 204 * V_SCALE, 15, 0.5, 0x7e96a8, 1.3);
  tower('ifc', 20, -14, 15, 176 * V_SCALE, 15, 0.5, 0x7e96a8, 1.3);
  tower('lgTwin', -9, 0, 15, 150 * V_SCALE, 15, 0.55, 0xa9b4b8, 1.2);
  tower('lgTwin', 9, 6, 15, 150 * V_SCALE, 15, 0.55, 0xa9b4b8, 1.2);
  for (let k = 0; k < 3; k++) tower('ichonTowers', (k - 1) * 30, (k - 1) * -8, 15, (200 - k * 22) * V_SCALE, 15, 0.2, 0x8d9aa4, 1.0);

  // 인스턴스 메시
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const n = list.length;
  const aSize = new Float32Array(n * 3), aStyle = new Float32Array(n * 4);
  const mesh = new THREE.InstancedMesh(geo, makeBuildingMaterial(ctx), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  list.forEach((b, i) => {
    q.setFromAxisAngle(up, -b.rot);
    m4.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHex(b.color));
    aSize.set([b.w, b.h, b.d], i * 3);
    aStyle.set([b.seed, b.type, b.lit, 0], i * 4);
  });
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 3));
  geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(aStyle, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.name = 'buildings';
  ctx.scene.add(mesh);

  buildLandmarks(ctx);
  return { count: n };
}

const _hc = new Map();
function hillHeightCached(x, z) {
  const k = Math.round(x / 20) * 100000 + Math.round(z / 20);
  let v = _hc.get(k);
  if (v === undefined) { v = hillHeight(x, z); _hc.set(k, v); }
  return v;
}

function buildLandmarks(ctx) {
  const group = new THREE.Group();
  group.name = 'landmarks';

  // 63빌딩: 위로 갈수록 좁아지는 금빛 유리 판상형
  {
    const p = toWorld(...LANDMARKS.b63);
    const H = 250 * V_SCALE * 1.35;
    const g = new THREE.BoxGeometry(33, H, 11.5, 1, 14, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + H / 2) / H;
      pos.setZ(i, pos.getZ(i) * lerp(1.9, 0.85, Math.pow(t, 0.6)));
      pos.setX(i, pos.getX(i) * lerp(1.0, 0.93, t));
    }
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.22, emissive: 0x6a4a18, emissiveIntensity: 0 });
    const m = new THREE.Mesh(g, mat);
    m.position.set(p.x, CITY_Y + H / 2, p.z);
    m.rotation.y = 0.35;
    group.add(m);
    ctx.nightMaterials.push({ mat, max: 0.4 });
  }

  // 파크원 붉은 모서리 기둥
  {
    const gb = new GeoBuilder();
    const p = toWorld(...LANDMARKS.parc1);
    for (const [dx, dz, w, h] of [[-10, 0, 23, 333 * V_SCALE * 1.3], [22, 14, 20.7, 256 * V_SCALE * 1.3]]) {
      const co = Math.cos(-0.6), si = Math.sin(-0.6);
      for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = cx * (w / 2 + 0.2), lz = cz * (w / 2 + 0.2);
        const x = p.x + dx + lx * co + lz * si, z = p.z + dz - lx * si + lz * co;
        gb.box(x, CITY_Y + h / 2, z, 1.3, h + 1, 1.3, -0.6);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xb5332b, roughness: 0.5, emissive: 0xff3020, emissiveIntensity: 0 });
    group.add(new THREE.Mesh(gb.build(), mat));
    ctx.nightMaterials.push({ mat, max: 1.4 });
  }

  // 국회의사당
  {
    const p = toWorld(...LANDMARKS.assembly);
    const gb = new GeoBuilder();
    gb.color(0xcfcabd);
    gb.box(p.x, CITY_Y + 9.5, p.z, 64, 19, 42, 0.45);
    gb.color(0xb9b4a8);
    gb.box(p.x, CITY_Y + 19.8, p.z, 68, 1.6, 46, 0.45);
    const m = new THREE.Mesh(gb.build(), ctx.materials.concrete);
    group.add(m);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6f9a8c, roughness: 0.55, metalness: 0.3, emissive: 0x6fd0b0, emissiveIntensity: 0 }));
    ctx.nightMaterials.push({ mat: dome.material, max: 0.5 });
    dome.position.set(p.x, CITY_Y + 20.5, p.z);
    dome.scale.y = 0.8;
    group.add(dome);
  }

  // N서울타워
  {
    const p = toWorld(...LANDMARKS.namsan);
    const base = CITY_Y + hillHeight(p.x, p.z) - 2;
    const gb = new GeoBuilder();
    gb.color(0xd8d6d0);
    gb.cylinder(p.x, base, p.z, 6.2, 3.8, 92, 16, false);
    gb.color(0xc4c8cc);
    gb.cylinder(p.x, base + 92, p.z, 11, 11, 13, 20, true);
    gb.cylinder(p.x, base + 105, p.z, 8, 6, 7, 20, true);
    gb.color(0xb44a3a);
    gb.cylinder(p.x, base + 112, p.z, 1.5, 0.5, 62, 8, true);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x9fc4ff, emissiveIntensity: 0 });
    group.add(new THREE.Mesh(gb.build(), mat));
    ctx.nightMaterials.push({ mat, max: 1.3 });
  }

  // 세빛섬: 반포대교 서쪽 물 위에 떠 있는 세 건물
  {
    const c = toWorld(...LANDMARKS.sebit);
    const b = bankOffset('S', c.x, -30);
    const cols = [0x8f7bff, 0x4fc3ff, 0xff7ab8];
    [[-44, 0, 17, 10], [0, -8, 22, 12], [47, 2, 14.5, 8.5]].forEach(([o, n2, r, h], i) => {
      const x = b.x + b.tx * o - b.lx * n2, z = b.z + b.tz * o - b.lz * n2;
      const gb = new GeoBuilder();
      gb.color(0x555a60);
      gb.cylinder(x, -0.2, z, r + 3, r + 3, 1.0, 32, true);
      gb.color(0xa9c4d2);
      gb.cylinder(x, 0.8, z, r, r * 0.9, h * 0.55, 32, true);
      gb.color(0xe8eef0);
      gb.cylinder(x, 0.8 + h * 0.55, z, r * 0.93, r * 0.93, 0.35, 32, true);
      gb.color(0xa9c4d2);
      gb.cylinder(x + 1.5, 1.15 + h * 0.55, z - 1, r * 0.62, r * 0.5, h * 0.45, 32, true);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.55, emissive: cols[i], emissiveIntensity: 0 });
      group.add(new THREE.Mesh(gb.build(), mat));
      ctx.nightMaterials.push({ mat, max: 0.7 });
    });
  }

  ctx.scene.add(group);
}
