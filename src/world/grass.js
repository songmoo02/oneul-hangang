// 풀(플레이어를 따라다니는 GPU 잔디)과 억새(강가·제방 아래에 고정 배치).
// 모두 정점 셰이더에서 바람에 흔들리고, 사람이 지나가면 눌렸다가 천천히 일어선다.
import * as THREE from 'three';
import { mulberry32, vnoise } from '../core/math.js';
import { WIND_GLSL, TRAIL_GLSL } from './wind.js';
import { GM_GLSL } from './grassmap.js';
import { sampleField, heightFromField, pathSDF, bankN, bankS, ISLANDS, ZONE, NODEUL_FRAME, LEVEE_W } from './field.js';

// 표준 재질(그림자·환경광 그대로)에 "정점 위치를 셰이더에서 직접 계산"하는 코드를 끼워 넣는다.
export function injectedMaterial(ctx, { uniforms, vertPre, vertMain, fragPre = '', fragColor, fragEmissive = '', roughness = 0.9, side = THREE.DoubleSide }) {
  const mat = new THREE.MeshStandardMaterial({ roughness, metalness: 0, side });
  const u = ctx.uniforms;
  // 셰이더 내용이 다르면 프로그램도 따로 만들게 한다(같은 캐시 키로 묶여 엉뚱한 셰이더가 재사용되는 것을 막는다)
  const key = `inj:${vertPre}|${vertMain}|${fragPre}|${fragColor}|${fragEmissive}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uNoise: u.uNoise, uWindDir: u.uWindDir, uWind: u.uWind, uGust: u.uGust, uTime: u.uTime,
      uTrail: u.uTrail, uKeyDir: u.uKeyDir, uKeyColor: u.uKeyColor,
    }, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}\n${TRAIL_GLSL}\n${vertPre}`)
      .replace('#include <beginnormal_vertex>', vertMain)
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uKeyDir, uKeyColor;\n${fragPre}`)
      // 양면 모두 같은 법선으로 밝힌다(풀잎 뒷면이 까맣게 되지 않도록)
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;')
      .replace('#include <color_fragment>', fragColor)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fragEmissive}`);
  };
  return mat;
}

// ───────────────────────── 잔디 ─────────────────────────
const GRASS_VERT_PRE = /* glsl */ `
attribute vec4 aOff; // xy: 타일 좌표, z: 밀도 순위, w: 난수
${GM_GLSL}
uniform vec2 uCenter;
uniform float uArea, uRadius;
uniform vec3 cGA, cGB, cGD;
varying vec3 vGCol;
`;

const GRASS_VERT_MAIN = /* glsl */ `
  // 월드에 고정된 위치(플레이어가 움직여도 풀이 따라 미끄러지지 않는다)
  vec2 gW = (fract(aOff.xy - uCenter / uArea) - 0.5) * uArea + uCenter;
  vec4 gM = gmSample(gW);
  float gDist = length(gW - uCenter);
  float gFar = smoothstep(7.0, uRadius, gDist);
  float gShow = step(aOff.z, mix(1.0, 0.22, gFar)) * step(0.05, gM.g) * (1.0 - smoothstep(uRadius * 0.82, uRadius, gDist));
  float gWild = smoothstep(0.42, 0.66, gM.g);
  float gH = mix(0.2, 0.7, gWild) * (0.65 + 0.7 * aOff.w) * mix(1.0, 1.7, gFar);
  float gWd = mix(0.05, 0.075, gWild) * mix(1.0, 2.8, gFar);
  float gT = position.y;
  float gYaw = aOff.w * 6.2831 + position.z;
  vec2 gSd = vec2(cos(gYaw), sin(gYaw));
  vec2 gFw = vec2(-gSd.y, gSd.x);
  float gWs = windAt(gW);
  vec2 gAway;
  float gPress = trailPress(gW, gAway);
  float gFlut = sin(uTime * (2.6 + 2.2 * aOff.w) + aOff.w * 43.0 + gW.x * 0.9 + gW.y * 0.6);
  vec2 gBend = gFw * (0.22 + 0.3 * fract(aOff.w * 7.31)) + uWindDir * gWs * (0.62 + 0.24 * gFlut);
  gBend = mix(gBend, gAway * 1.7, gPress);
  float gHk = mix(1.0, 0.22, gPress);
  vec3 gPos = vec3(gW.x, gM.r - 0.03, gW.y);
  gPos.xz += gSd * (position.x * gWd) + gFw * (position.z * 0.012);
  float gT2 = gT * gT;
  gPos.y += (gT * gHk - dot(gBend, gBend) * gT2 * 0.22) * gH;
  gPos.xz += gBend * gT2 * gH;
  if (gShow < 0.5) gPos = vec3(gW.x, -60.0, gW.y);
  vec3 objectNormal = normalize(vec3(gBend.x * 0.5 * gT, 1.0, gBend.y * 0.5 * gT));
  float gn1 = texture2D(uNoise, gW * 0.0037).r, gn2 = texture2D(uNoise, gW * 0.029).g;
  vec3 gc = mix(cGA, cGB, smoothstep(0.38, 0.62, gn1));
  gc = mix(gc, cGD, smoothstep(0.48, 0.78, gn2) * 0.5);
  gc = mix(gc, cGD, gWild * 0.5);
  vGCol = gc * mix(0.52, 1.28, gT) * (0.84 + 0.32 * fract(aOff.w * 13.7));
  vGCol = mix(vGCol, cGD * 1.25, gT * 0.38 * fract(aOff.w * 5.13));
  // 돌풍이 지나갈 때 잎 뒷면이 뒤집히며 살짝 밝아진다
  vGCol *= 1.0 + 0.22 * smoothstep(0.5, 1.6, gWs) * gT;
`;

const BACKLIT = (k) => /* glsl */ `
  {
    vec3 Lv = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
    float back = pow(max(dot(-normalize(vViewPosition), Lv), 0.0), 2.0);
    totalEmissiveRadiance += diffuseColor.rgb * uKeyColor * back * ${k.toFixed(3)};
  }`;

function tuftGeometry(count, seed) {
  // 한 포기 = 풀잎 3장. position: x=좌우(-0.5~0.5), y=높이(0~1), z=잎 방향 각도
  const pos = [], idx = [];
  for (let b = 0; b < 3; b++) {
    const ang = b * 2.094 + 0.4;
    const base = pos.length / 3;
    pos.push(-0.5, 0, ang, 0.5, 0, ang, -0.36, 0.5, ang, 0.36, 0.5, ang, 0, 1, ang);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const rnd = mulberry32(seed), off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) off.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  g.instanceCount = count;
  return g;
}

// ───────────────────────── 억새 ─────────────────────────
const REED_VERT_PRE = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aRnd;
uniform vec3 cStraw, cReedLeaf, cPlume;
uniform vec2 uCenter;
varying vec3 vGCol;
varying float vPlume;
`;

const REED_VERT_MAIN = /* glsl */ `
  float rT = position.y;
  float rK = uv.y; // 줄기 번호(0~1)
  float rYaw = aRnd.x * 6.2831 + rK * 6.2831;
  vec2 rSd = vec2(cos(rYaw), sin(rYaw));
  vec2 rFw = vec2(-rSd.y, rSd.x);
  float rDist = length(aPos.xz - uCenter);
  float rShow = 1.0 - smoothstep(150.0, 175.0, rDist);
  float rH = (1.45 + 0.9 * aRnd.y) * aRnd.w * (0.75 + 0.5 * fract(rK * 7.7 + aRnd.z)) * rShow;
  float rWs = windAt(aPos.xz);
  vec2 rAway;
  float rPress = trailPress(aPos.xz, rAway);
  float rFl = sin(uTime * (1.7 + aRnd.z) + aRnd.x * 31.0 + rK * 9.0);
  vec2 rBend = rFw * (0.1 + 0.22 * fract(rK * 3.3 + aRnd.y)) + uWindDir * rWs * (0.42 + 0.14 * rFl);
  rBend = mix(rBend, rAway * 1.1, rPress * 0.85);
  float rT2 = rT * rT;
  float rWdt = mix(0.035, 0.02, rT) + uv.x * 0.15 * (0.7 + 0.6 * aRnd.z); // uv.x>0: 이삭
  vec3 gPos = aPos + vec3(rFw.x, 0.0, rFw.y) * (0.05 + 0.16 * rK);
  gPos.xz += rSd * (position.x * rWdt * mix(1.0, 2.2, smoothstep(40.0, 150.0, rDist)));
  gPos.y += (rT * mix(1.0, 0.45, rPress) - dot(rBend, rBend) * rT2 * 0.2) * rH - 0.05;
  gPos.xz += rBend * rT2 * rH;
  vec3 objectNormal = normalize(vec3(rBend.x * 0.5 * rT, 1.0, rBend.y * 0.5 * rT));
  vPlume = step(0.5, uv.x * 4.0);
  vec3 stalk = mix(cReedLeaf, cStraw, smoothstep(0.1, 0.75, rT)) * mix(0.6, 1.1, rT);
  vGCol = mix(stalk, cPlume * (0.9 + 0.25 * aRnd.z), vPlume) * (0.88 + 0.24 * aRnd.x);
`;

function reedGeometry() {
  // 한 포기 = 줄기 5대, 줄기 끝에 은빛 이삭. uv.x: 이삭 폭 계수, uv.y: 줄기 번호
  const pos = [], uv = [], idx = [];
  for (let k = 0; k < 5; k++) {
    const kk = k / 5;
    const base = pos.length / 3;
    const ts = [0, 0.38, 0.72];
    for (const t of ts) { pos.push(-0.5, t, 0, 0.5, t, 0); uv.push(0, kk, 0, kk); }
    for (let s = 0; s < ts.length - 1; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    // 이삭(마름모)
    const pb = pos.length / 3;
    pos.push(0, 0.7, 0, -0.5, 0.86, 0, 0.5, 0.86, 0, 0, 1.0, 0);
    uv.push(0.26, kk, 1, kk, 1, kk, 0.26, kk);
    idx.push(pb, pb + 2, pb + 1, pb + 1, pb + 2, pb + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function placeReeds(ctx) {
  const rnd = mulberry32(1357);
  const list = [];
  const f = {};
  const add = (x, z, scale) => {
    sampleField(x, z, f);
    if (f.d < 1.6) return;
    if (ctx.nearBridge(x, z, 1.5)) return;
    list.push(x, heightFromField(f, x, z), z, scale);
  };
  for (const bank of [bankN, bankS]) {
    const north = bank === bankN, p = {};
    for (let u = 0; u < bank.total; u += 0.9) {
      bank.at(u, p);
      if (p.x < -1560 || p.x > 1700) continue;
      const lx = north ? p.tz : -p.tz, lz = north ? -p.tx : p.tx;
      // 물가의 억새 무리 (군데군데)
      const m1 = vnoise(p.x * 0.021 + 11, p.z * 0.021 + 3);
      if (m1 > 0.56) {
        const n = 1 + Math.floor((m1 - 0.56) * 14);
        for (let i = 0; i < n; i++) { const d = 2.3 + rnd() * 3.1; add(p.x + lx * d + (rnd() - 0.5), p.z + lz * d + (rnd() - 0.5), 0.8 + rnd() * 0.5); }
      }
      // 제방 아래 억새밭 (넓은 공원)
      if (p.w > 36) {
        const m2 = vnoise(p.x * 0.013 + 40, p.z * 0.013 + 70);
        if (m2 > 0.52) {
          const n = 2 + Math.floor((m2 - 0.52) * 22);
          for (let i = 0; i < n; i++) {
            const d = p.w - 1.5 - rnd() * Math.min(13, p.w * 0.2);
            const x = p.x + lx * d + (rnd() - 0.5), z = p.z + lz * d + (rnd() - 0.5);
            if (pathSDF(x, z) > 1.5) add(x, z, 0.9 + rnd() * 0.5);
          }
        }
      }
      // 제방 사면 아래쪽
      if (rnd() < 0.5 && vnoise(p.x * 0.03 + 5, p.z * 0.03 + 90) > 0.5) add(p.x + lx * (p.w + rnd() * LEVEE_W * 0.5), p.z + lz * (p.w + rnd() * LEVEE_W * 0.5), 0.8 + rnd() * 0.4);
    }
  }
  for (const isl of ISLANDS) {
    const poly = isl.poly, p = {};
    for (let u = 0; u < poly.total; u += 0.6) {
      poly.at(u, p);
      const nx = -p.tz * poly.orient, nz = p.tx * poly.orient;
      const m = vnoise(p.x * 0.04 + 7, p.z * 0.04 + 9);
      let prob, dMax, dMin = 2.0;
      if (isl.zone === ZONE.BAMSEOM) { prob = 0.9; dMax = 9; } else if (isl.zone === ZONE.SEORAE) { prob = m > 0.4 ? 0.8 : 0; dMax = 3.6; } else {
        const s = (p.x - NODEUL_FRAME.cx) * NODEUL_FRAME.ax + (p.z - NODEUL_FRAME.cz) * NODEUL_FRAME.az;
        prob = Math.abs(s) > 95 ? 0.9 : m > 0.5 ? 0.7 : 0; dMax = 4.4;
      }
      if (rnd() > prob) continue;
      const n = isl.zone === ZONE.BAMSEOM ? 3 : 2;
      for (let i = 0; i < n; i++) { const d = dMin + rnd() * (dMax - dMin); add(p.x + nx * d + (rnd() - 0.5), p.z + nz * d + (rnd() - 0.5), 0.8 + rnd() * 0.6); }
    }
  }
  return list;
}

export function buildGrass(ctx, grassMap) {
  const u = ctx.uniforms;
  const C = (h) => ({ value: new THREE.Color(h) });
  const center = { value: new THREE.Vector2() };
  const grassColors = { cGA: C(0x4f7a2c), cGB: C(0x6f8c38), cGD: C(0xa39a4e) };

  // 잔디
  const MAX = 64000;
  const grassU = { uGrassMap: { value: grassMap.tex }, uCenter: center, uArea: { value: 84 }, uRadius: { value: 42 }, ...grassColors };
  const grassMat = injectedMaterial(ctx, {
    uniforms: grassU, vertPre: GRASS_VERT_PRE, vertMain: GRASS_VERT_MAIN,
    fragPre: 'varying vec3 vGCol;', fragColor: 'diffuseColor.rgb = vGCol;', fragEmissive: BACKLIT(0.1), roughness: 0.82,
  });
  const grassGeo = tuftGeometry(MAX, 31);
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.frustumCulled = false;
  grass.receiveShadow = true;
  grass.layers.set(1);
  grass.name = 'grass';
  ctx.scene.add(grass);

  // 억새: 구역별 인스턴스 버퍼
  const data = placeReeds(ctx);
  const SECT = 180;
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = Math.floor((data[i] + 2000) / SECT) + ':' + Math.floor((data[i + 2] + 2000) / SECT);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }
  const reedMat = injectedMaterial(ctx, {
    uniforms: { uCenter: center, cStraw: C(0xb8a460), cReedLeaf: C(0x7c8a3c), cPlume: C(0xd6c7a2) },
    vertPre: REED_VERT_PRE, vertMain: REED_VERT_MAIN,
    fragPre: 'varying vec3 vGCol; varying float vPlume;', fragColor: 'diffuseColor.rgb = vGCol;',
    // 역광에서 이삭이 은빛으로 빛난다
    fragEmissive: /* glsl */ `
      {
        vec3 Lv = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
        float back = pow(max(dot(-normalize(vViewPosition), Lv), 0.0), 1.6);
        totalEmissiveRadiance += diffuseColor.rgb * uKeyColor * back * mix(0.1, 0.42, vPlume);
      }`,
    roughness: 0.75,
  });
  const base = reedGeometry();
  const rnd = mulberry32(8642);
  const sectors = [];
  const group = new THREE.Group();
  group.name = 'reeds';
  for (const [, arr] of buckets) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    g.setIndex(base.getIndex());
    const pos = new Float32Array(arr.length * 3), rn = new Float32Array(arr.length * 4);
    let cx = 0, cz = 0;
    arr.forEach((i, k) => {
      pos.set([data[i], data[i + 1], data[i + 2]], k * 3);
      rn.set([rnd(), rnd(), rnd(), data[i + 3]], k * 4);
      cx += data[i]; cz += data[i + 2];
    });
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rn, 4));
    g.instanceCount = arr.length;
    const m = new THREE.Mesh(g, reedMat);
    m.frustumCulled = false;
    m.receiveShadow = true;
    group.add(m);
    sectors.push({ m, x: cx / arr.length, z: cz / arr.length });
  }
  ctx.scene.add(group);

  return {
    reedCount: data.length / 4,
    setQuality(q) { grassGeo.instanceCount = Math.min(MAX, q.grass); grass.visible = q.grass > 0; },
    update(px, pz) {
      center.value.set(px, pz);
      for (const s of sectors) s.m.visible = Math.hypot(s.x - px, s.z - pz) < 300;
    },
  };
}
