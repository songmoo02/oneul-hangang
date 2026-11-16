// 지형 메시: 강변 근처는 촘촘하게(3.125유닛), 나머지는 평평한 큰 판으로 만든다.
// 색은 텍스처 이미지 없이, 정점에 실어 보낸 필드 값(물가 거리 등)으로 셰이더에서 그린다.
import * as THREE from 'three';
import {
  sampleField, heightFromField, pathSDF, NODEUL_FRAME,
  CITY_Y, LEVEE_W, ROAD_W, EMB_W,
} from './field.js';

export const TERRAIN_BOUNDS = { x0: -2000, x1: 2200, z0: -1100, z1: 1100 };
const CH = 200, CELLS = 64;

export function buildTerrain(ctx) {
  const { x0, x1, z0, z1 } = TERRAIN_BOUNDS;
  const group = new THREE.Group();
  group.name = 'terrain';
  const material = makeTerrainMaterial(ctx);
  const f = {};
  const step = CH / CELLS;
  const N = CELLS + 1, NP = CELLS + 3; // NP: 법선 계산용 패딩 포함

  // 공유 인덱스
  const index = new Uint16Array(CELLS * CELLS * 6);
  let q = 0;
  for (let j = 0; j < CELLS; j++) {
    for (let i = 0; i < CELLS; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      index[q++] = a; index[q++] = c; index[q++] = b;
      index[q++] = b; index[q++] = c; index[q++] = d;
    }
  }
  const indexAttr = new THREE.BufferAttribute(index, 1);
  // 먼 청크용 성긴 인덱스(2칸·4칸 간격)
  const coarseIndex = (k) => {
    const arr = [];
    for (let j = 0; j < CELLS; j += k) for (let i = 0; i < CELLS; i += k) {
      const a = j * N + i, b = a + k, c = a + k * N, d = c + k;
      arr.push(a, c, b, b, c, d);
    }
    return new THREE.BufferAttribute(new Uint16Array(arr), 1);
  };
  const indexMid = coarseIndex(2), indexLo = coarseIndex(4);
  const chunks = [];

  const coarsePos = [], coarseField = [], coarseZone = [], coarseIdx = [];
  const hp = new Float32Array(NP * NP);
  let fineCount = 0;

  for (let cz = z0; cz < z1; cz += CH) {
    for (let cx = x0; cx < x1; cx += CH) {
      // 강변 근처인지 판정 (5×5 표본)
      let fine = false;
      for (let j = 0; j <= 4 && !fine; j++) {
        for (let i = 0; i <= 4 && !fine; i++) {
          sampleField(cx + (i / 4) * CH, cz + (j / 4) * CH, f);
          if (f.d > -52 && (f.zone > 1 || f.d < f.w + LEVEE_W + ROAD_W + 40)) fine = true;
        }
      }
      if (!fine) {
        const base = coarsePos.length / 3;
        for (const [ox, oz] of [[0, 0], [CH, 0], [0, CH], [CH, CH]]) {
          const x = cx + ox, z = cz + oz;
          sampleField(x, z, f);
          coarsePos.push(x, heightFromField(f, x, z), z);
          coarseField.push(f.d, Math.min(f.w, 500), f.u, 100);
          coarseZone.push(f.zone);
        }
        coarseIdx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        continue;
      }
      fineCount++;
      const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3);
      const fld = new Float32Array(N * N * 4), zon = new Float32Array(N * N);
      for (let j = 0; j < NP; j++) {
        for (let i = 0; i < NP; i++) {
          const x = cx + (i - 1) * step, z = cz + (j - 1) * step;
          sampleField(x, z, f);
          const h = heightFromField(f, x, z);
          hp[j * NP + i] = h;
          if (i >= 1 && i <= N && j >= 1 && j <= N) {
            const k = (j - 1) * N + (i - 1);
            pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
            fld[k * 4] = f.d; fld[k * 4 + 1] = Math.min(f.w, 500); fld[k * 4 + 2] = f.u;
            fld[k * 4 + 3] = f.d > 0 && f.zone <= 1 && f.d < f.w + 4 ? Math.min(pathSDF(x, z), 100) : 100;
            zon[k] = f.zone;
          }
        }
      }
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const pi = (j + 1) * NP + (i + 1);
          const dx = hp[pi + 1] - hp[pi - 1], dz = hp[pi + NP] - hp[pi - NP];
          let nx = -dx, ny = 2 * step, nz = -dz;
          const l = Math.hypot(nx, ny, nz);
          const k = (j * N + i) * 3;
          nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('aField', new THREE.BufferAttribute(fld, 4));
      g.setAttribute('aZone', new THREE.BufferAttribute(zon, 1));
      g.setIndex(indexAttr);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const levels = [indexAttr, indexMid, indexLo].map((ix, li) => {
        let geo = g;
        if (li > 0) {
          geo = new THREE.BufferGeometry();
          for (const name of ['position', 'normal', 'aField', 'aZone']) geo.setAttribute(name, g.getAttribute(name));
          geo.setIndex(ix);
          geo.boundingSphere = g.boundingSphere; geo.boundingBox = g.boundingBox;
        }
        const m = new THREE.Mesh(geo, material);
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.visible = li === 0;
        group.add(m);
        return m;
      });
      chunks.push({ levels, x: cx + CH / 2, z: cz + CH / 2, cur: 0 });
    }
  }

  // 평평한 구역은 메시 하나로 합친다
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(coarsePos, 3));
  const cn = new Float32Array(coarsePos.length);
  for (let i = 1; i < cn.length; i += 3) cn[i] = 1;
  cg.setAttribute('normal', new THREE.BufferAttribute(cn, 3));
  cg.setAttribute('aField', new THREE.Float32BufferAttribute(coarseField, 4));
  cg.setAttribute('aZone', new THREE.Float32BufferAttribute(coarseZone, 1));
  cg.setIndex(coarseIdx);
  const coarse = new THREE.Mesh(cg, material);
  coarse.receiveShadow = true;
  coarse.frustumCulled = false;
  group.add(coarse);

  ctx.scene.add(group);
  const update = (cam) => {
    for (const c of chunks) {
      const d = Math.hypot(cam.x - c.x, cam.z - c.z);
      const lv = d < 430 ? 0 : d < 950 ? 1 : 2;
      if (lv !== c.cur) { c.levels[c.cur].visible = false; c.levels[lv].visible = true; c.cur = lv; }
    }
  };
  return { group, material, fineCount, update };
}

function makeTerrainMaterial(ctx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const C = (hex) => ({ value: new THREE.Color(hex) });
  const colors = {
    cGrassA: C(0x4f7a2c), cGrassB: C(0x6f8c38), cGrassDry: C(0xa39a4e), cLawn: C(0x6a9a3a),
    cPave: C(0xb7afa1), cPlaza: C(0xc6bfb2), cAsphalt: C(0x3c3e43), cRoad: C(0x303135),
    cRock: C(0x8d8b84), cLevee: C(0x566e2e), cCity: C(0x5d5c59), cLineY: C(0xd9b53a), cLineW: C(0xdedcd2),
    cSoil: C(0x6a5a38), cLitter: C(0x9c6c30), cSand: C(0xb9ab84), cMud: C(0x3a3a30), cWall: C(0x9c9a92),
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, colors, {
      uNoise: ctx.uniforms.uNoise,
      uWet: ctx.uniforms.uWet,
      uNodeulC: { value: new THREE.Vector2(NODEUL_FRAME.cx, NODEUL_FRAME.cz) },
      uNodeulAx: { value: new THREE.Vector4(NODEUL_FRAME.ax, NODEUL_FRAME.az, NODEUL_FRAME.topY, NODEUL_FRAME.midY) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aField; attribute float aZone;
        varying vec4 vField; varying float vZone; varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vField = aField; vZone = aZone; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${TERRAIN_PRELUDE}`)
      .replace('#include <color_fragment>', TERRAIN_COLOR)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;');
  };
  return mat;
}

const TERRAIN_PRELUDE = /* glsl */ `
uniform sampler2D uNoise;
uniform float uWet;
uniform vec2 uNodeulC;
uniform vec4 uNodeulAx;
uniform vec3 cGrassA, cGrassB, cGrassDry, cLawn, cPave, cPlaza, cAsphalt, cRoad, cRock, cLevee, cCity, cLineY, cLineW, cSoil, cLitter, cSand, cMud, cWall;
varying vec4 vField; varying float vZone; varying vec3 vWPos;
float gRough = 1.0;
float tBand(float d, float a, float b, float aa) {
  return smoothstep(a - aa, a + aa, d) * (1.0 - smoothstep(b - aa, b + aa, d));
}
float tLine(float d, float c, float hw, float aa) {
  return 1.0 - smoothstep(hw, hw + aa, abs(d - c));
}
// 벽돌·판석 줄눈 (0: 면, 1: 줄눈)
float tJoint(vec2 q, float stagger) {
  q.x += stagger * 0.5 * floor(q.y);
  vec2 f = abs(fract(q) - 0.5);
  return smoothstep(0.43, 0.49, max(f.x, f.y));
}
`;

const TERRAIN_COLOR = /* glsl */ `
{
  float d = vField.x, w = vField.y, u = vField.z, pd = vField.w;
  vec2 wp = vWPos.xz;
  float camDist = length(cameraPosition - vWPos);
  float aa = clamp(fwidth(d) * 0.55, 0.03, 0.7);
  float lod = 1.0 - smoothstep(50.0, 200.0, camDist);
  float lineFade = 1.0 - smoothstep(0.25, 0.8, fwidth(d));
  float n1 = texture2D(uNoise, wp * 0.0037).r;
  float n2 = texture2D(uNoise, wp * 0.029).g;
  float n3 = texture2D(uNoise, wp * 0.33).b;
  float n4 = texture2D(uNoise, wp * 1.9).b;

  vec3 grass = mix(cGrassA, cGrassB, smoothstep(0.38, 0.62, n1));
  grass = mix(grass, cGrassDry, smoothstep(0.48, 0.78, n2) * 0.5);
  grass *= 0.78 + 0.36 * n3 + 0.2 * (n4 - 0.5) * lod;
  vec3 col = grass;
  float rough = 0.97;
  float paved = 0.0;

  vec3 rock = cRock * (0.78 + 0.44 * n3) * (1.0 - 0.3 * tJoint(vec2(u * 0.9, d * 1.5), 1.0) * lod);
  rock = mix(rock * vec3(0.5, 0.56, 0.46), rock, smoothstep(0.7, 2.4, d));
  vec3 pave = cPave * (0.9 + 0.2 * n3) * (1.0 - 0.2 * tJoint(vec2(u * 2.0, d * 4.0), 1.0) * lod);
  vec3 plaza = cPlaza * (0.9 + 0.2 * n3) * (1.0 - 0.18 * tJoint(wp * 0.55, 0.0) * lod);

  if (vZone < 1.5) {
    float inPark = 1.0 - smoothstep(w - 0.5, w + 1.5, d);
    // 호안
    float emb = 1.0 - smoothstep(${(EMB_W - 0.5).toFixed(1)}, ${(EMB_W + 0.1).toFixed(1)}, d);
    // 보행 산책로
    float wk = tBand(d, 6.0, 9.4, aa) * inPark;
    // 자전거도로
    float bk = tBand(d, 12.0, 16.4, aa) * step(20.0, w) * inPark;
    vec3 asp = cAsphalt * (0.85 + 0.3 * n4);
    float cl = tLine(d, 14.2, 0.05, aa) * step(0.5, fract(u / 4.0));
    float el = tLine(d, 12.3, 0.045, aa) + tLine(d, 16.1, 0.045, aa);
    asp = mix(asp, cLineY, cl * lineFade);
    asp = mix(asp, cLineW, clamp(el, 0.0, 1.0) * lineFade);
    // 광장·연결로
    float pz = (1.0 - smoothstep(-0.25, 0.25, pd)) * smoothstep(${(EMB_W - 0.6).toFixed(1)}, ${(EMB_W + 0.6).toFixed(1)}, d) * inPark;

    col = mix(col, plaza, pz);
    col = mix(col, pave, wk);
    col = mix(col, asp, bk);
    col = mix(col, rock, emb);
    paved = max(max(wk, bk), pz) * (1.0 - emb);
    rough = mix(rough, 0.84, max(paved, emb));

    // 제방 사면
    float lv = 1.0 - inPark;
    vec3 levee = mix(cLevee, cGrassDry, n2 * 0.55) * (0.72 + 0.44 * n3);
    col = mix(col, levee, lv);
    // 제방 위 간선도로
    float r0 = w + ${(LEVEE_W + 1.5).toFixed(1)}, r1 = r0 + ${ROAD_W.toFixed(1)};
    float rd = tBand(d, r0, r1, aa);
    vec3 road = cRoad * (0.85 + 0.3 * n4);
    float l = (d - r0 - 0.8) / 3.4;
    float ln = (1.0 - smoothstep(0.018, 0.018 + aa * 0.3, abs(l - floor(l + 0.5)))) * step(0.5, l) * step(l, 5.5);
    float center = 1.0 - step(0.5, abs(l - 3.0));
    vec3 lc = mix(cLineW, cLineY, center);
    float dash = mix(step(0.55, fract(u / 9.0)), 1.0, center);
    road = mix(road, lc, ln * dash * lineFade);
    col = mix(col, road, rd);
    float city = smoothstep(r1 - 0.5, r1 + 0.5, d);
    col = mix(col, cCity * (0.82 + 0.36 * n3), city);
    paved = max(paved, max(rd, city));
    rough = mix(rough, 0.9, max(rd, city));
  } else if (vZone < 2.5) {
    // 노들섬
    float s = dot(wp - uNodeulC, uNodeulAx.xy);
    float emb = 1.0 - smoothstep(3.0, 4.4, d);
    float ring = tBand(d, 5.2, 9.6, aa);
    float wall = tBand(d, 12.6, 18.2, 0.5);
    float top = smoothstep(uNodeulAx.z - 1.9, uNodeulAx.z - 0.7, vWPos.y);
    vec3 lawn = mix(cLawn, cGrassB, n2 * 0.5) * (0.84 + 0.28 * n3);
    vec3 forest = mix(cSoil, cLitter, smoothstep(0.35, 0.7, n2)) * (0.72 + 0.44 * n3);
    vec3 inner = mix(lawn, forest, smoothstep(34.0, 62.0, s));
    col = mix(grass, inner, smoothstep(16.5, 19.5, d));
    // 기단부: 층층이 식물이 자라는 틈새 정원 느낌
    float tier = fract(vWPos.y * 0.9);
    vec3 wallCol = mix(cWall * (0.8 + 0.3 * n3), grass * 0.9, smoothstep(0.55, 0.75, tier) * (0.5 + 0.5 * n2));
    col = mix(col, wallCol, wall);
    col = mix(col, pave, ring);
    col = mix(col, plaza, top);
    col = mix(col, rock, emb);
    paved = max(ring, top) * (1.0 - emb);
    rough = mix(rough, 0.84, max(paved, emb));
  } else if (vZone < 3.5) {
    // 밤섬 (출입 불가 생태 보전 구역)
    vec3 sand = cSand * (0.82 + 0.36 * n3);
    vec3 wild = mix(cLevee, cGrassDry, smoothstep(0.3, 0.7, n2)) * (0.7 + 0.44 * n3);
    col = mix(sand, wild, smoothstep(1.5, 7.0, d + (n2 - 0.5) * 5.0));
  } else {
    // 서래섬
    float emb = 1.0 - smoothstep(2.6, 3.8, d);
    float ring = tBand(d, 4.2, 6.8, aa);
    col = mix(mix(cLawn, cGrassDry, smoothstep(0.4, 0.7, n2) * 0.7) * (0.82 + 0.3 * n3), pave, ring);
    col = mix(col, rock, emb);
    paved = ring * (1.0 - emb);
    rough = mix(rough, 0.84, paved);
  }
  col = mix(cMud, col, smoothstep(-0.6, 0.15, d));

  // 비에 젖은 노면과 물웅덩이
  float puddle = smoothstep(0.52, 0.66, n2 + (n1 - 0.5) * 0.5) * paved * uWet;
  col *= mix(1.0, 0.6, uWet * (0.45 + 0.55 * paved));
  rough = mix(rough, mix(0.42, 0.06, puddle), uWet * paved);
  rough = mix(rough, rough * 0.8, uWet * (1.0 - paved));
  diffuseColor.rgb = col;
  gRough = rough;
}
`;
