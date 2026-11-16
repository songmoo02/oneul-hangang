// 나무(10월 중순 단풍). 지금은 정지 상태이고, 바람에 흔들리는 처리는 4단계에서 같은 재질에 덧붙인다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, vnoise, lerp } from '../core/math.js';
import { WIND_GLSL } from './wind.js';
import { sampleField, heightFromField, pathSDF, bankN, bankS, ISLANDS, NODEUL_FRAME, ZONE, LEVEE_W } from './field.js';

let DETAIL = 1;
function blob(rnd, r, x, y, z, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, DETAIL);
  const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    nor.setXYZ(i, px / r, py / r, pz / r); // 덩어리 중심에서 바깥으로 향하는 부드러운 법선
    const n = 0.78 + 0.3 * vnoise(px * 1.3 + x * 3.1 + 50, pz * 1.3 + py * 1.1 + z * 2.7 + 50) + 0.22 * vnoise(px * 4.1 + py * 2.3 + 9, pz * 4.1 - py * 1.9 + 4);
    px *= n * sx; py *= n * sy; pz *= n * sz;
    pos.setXYZ(i, px + x, py + y, pz + z);
    // 아래쪽·안쪽은 어둡게(자체 그림자 흉내)
    const shade = lerp(0.5, 1.05, (py / (r * sy) + 1) / 2) * (0.9 + 0.2 * rnd());
    col[i * 3] = shade; col[i * 3 + 1] = shade; col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

// 나무 한 그루 전체가 휘청이는 움직임 + 잎의 잔떨림 (줄기·잎이 같은 식을 써서 어긋나지 않는다)
const TREE_SWAY = /* glsl */ `
  #ifdef USE_INSTANCING
  {
    vec3 tBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 tc0 = instanceMatrix[0].xyz, tc1 = instanceMatrix[1].xyz, tc2 = instanceMatrix[2].xyz;
    float tH = max(transformed.y, 0.0) * length(tc1);
    float tWs = windAt(tBase.xz);
    float tPh = tBase.x * 0.37 + tBase.z * 0.23;
    float tSway = tWs * (0.55 + 0.45 * sin(uTime * (0.8 + 0.5 * fract(tPh)) + tPh));
    vec2 tDisp = uWindDir * tSway * tH * tH * 0.0052;
    #ifdef LEAF_FLUTTER
      float tF = sin(uTime * 4.6 + dot(transformed, vec3(1.7, 2.3, 1.3)) + tPh) + sin(uTime * 7.3 + dot(transformed, vec3(2.9, 1.1, 3.7)));
      transformed += objectNormal * tF * 0.028 * (0.25 + tWs);
    #endif
    vec3 tW = vec3(tDisp.x, -dot(tDisp, tDisp) * 0.12, tDisp.y);
    transformed += vec3(dot(tW, tc0) / dot(tc0, tc0), tW.y / length(tc1), dot(tW, tc2) / dot(tc2, tc2));
  }
  #endif
`;

function makeVariants(detail) {
  DETAIL = detail;
  const rnd = mulberry32(77);
  const round = mergeGeometries([
    blob(rnd, 2.5, 0, 5.3, 0), blob(rnd, 1.9, 1.7, 4.5, 0.4), blob(rnd, 1.8, -1.5, 4.7, -0.7),
    blob(rnd, 1.7, 0.2, 4.4, 1.7), blob(rnd, 1.6, -0.3, 6.6, -0.4),
  ]);
  const tall = mergeGeometries([
    blob(rnd, 2.0, 0, 4.6, 0, 0.85, 1.05, 0.85), blob(rnd, 1.8, 0.2, 6.6, -0.1, 0.8, 1.05, 0.8),
    blob(rnd, 1.3, -0.1, 8.5, 0.1, 0.75, 1.1, 0.75),
  ]);
  const pine = mergeGeometries([
    blob(rnd, 2.4, 0, 5.2, 0, 1, 0.42, 1), blob(rnd, 1.9, 0.3, 6.4, -0.2, 1, 0.42, 1),
    blob(rnd, 1.3, -0.2, 7.5, 0.1, 1, 0.5, 1), blob(rnd, 1.6, -1.1, 4.6, 0.8, 1, 0.4, 1),
  ]);
  const willow = mergeGeometries([
    blob(rnd, 2.6, 0, 3.4, 0, 1, 0.8, 1), blob(rnd, 2.0, 1.8, 2.8, 0.6, 1, 0.85, 1),
    blob(rnd, 2.0, -1.6, 2.9, -0.9, 1, 0.85, 1), blob(rnd, 1.7, 0.2, 2.6, -1.9, 1, 0.9, 1),
  ]);
  return [
    { geo: round, trunkH: 3.4, trunkR: 0.2, colors: [0xb5652a, 0xc9872e, 0x9a4a28, 0x7f8c36, 0xa8a03a, 0xb23a2a, 0xc47a2c] },
    { geo: tall, trunkH: 3.6, trunkR: 0.17, colors: [0xd9b62e, 0xceb233, 0xb9b040, 0x9aa83c, 0xdcae28] },
    { geo: pine, trunkH: 5.2, trunkR: 0.16, colors: [0x2f4a2c, 0x38512e, 0x2a4530] },
    { geo: willow, trunkH: 2.2, trunkR: 0.22, colors: [0x8f9a3e, 0x7a8f3a, 0xa39a44, 0x94893a] },
  ];
}

export function buildVegetation(ctx) {
  const rnd = mulberry32(4242);
  const variants = makeVariants(1);
  const variantsLo = makeVariants(0);
  const density = ctx.quality.treeDensity;
  const trees = []; // {x,y,z,s,rot,v,color}
  const f = {};
  const KEEP = 0.34; // 나무 수를 이전의 약 1/3로
  const tryAdd = (x, z, v, s, opts = {}) => {
    if (rnd() > KEEP) return false;
    sampleField(x, z, f);
    if (f.d < (opts.minD ?? 3)) return false;
    if (f.zone <= 1) {
      if (!opts.levee && f.d > f.w - 1.5) return false;
      if (f.d > 4.5 && f.d < 9.9) return false; // 보행로
      if (f.w > 20 && f.d > 11.4 && f.d < 17.0) return false; // 자전거도로
      if (pathSDF(x, z) < 2.6) return false;
    }
    if (ctx.nearBridge(x, z, 4.5)) return false;
    const vr = variants[v];
    trees.push({ x, y: heightFromField(f, x, z) - 0.1, z, s, rot: rnd() * 6.28, v, color: vr.colors[Math.floor(rnd() * vr.colors.length)] });
    return true;
  };
  const pickPark = () => { const r = rnd(); return r < 0.5 ? 0 : r < 0.8 ? 1 : 2; };

  // 강변 공원
  for (const bank of [bankN, bankS]) {
    const north = bank === bankN;
    const p = {};
    for (let u = 0; u < bank.total; u += 6.5) {
      bank.at(u, p);
      if (p.x < -1750 || p.x > 1950) continue;
      const lx = north ? p.tz : -p.tz, lz = north ? -p.tx : p.tx;
      const put = (d, v, s, opts) => tryAdd(p.x + lx * d + (rnd() - 0.5) * 1.5, p.z + lz * d + (rnd() - 0.5) * 1.5, v, s, opts);
      const k = Math.round(u / 6.5);
      // 보행로와 자전거길 사이 가로수
      if (k % 4 === 0 && p.w > 20) put(10.7, k % 12 === 0 ? 0 : 1, 0.75 + rnd() * 0.25);
      // 제방 아래·사면 위 수림대
      if (rnd() < 0.8 * density) put(p.w - 2.6 - rnd() * 2, pickPark(), 0.9 + rnd() * 0.5);
      if (rnd() < 0.55 * density) put(p.w + LEVEE_W - 2 - rnd() * 6, rnd() < 0.4 ? 2 : 0, 0.9 + rnd() * 0.4, { levee: true });
      // 넓은 잔디밭의 나무 무리
      if (p.w > 40) {
        const n = Math.floor((p.w - 22) / 11);
        for (let i = 0; i < n; i++) {
          const d = 19 + rnd() * (p.w - 24);
          const x = p.x + lx * d, z = p.z + lz * d;
          const cl = vnoise(x * 0.018 + 3, z * 0.018 + 7);
          if (cl > 0.5 && rnd() < (cl - 0.42) * 2.6 * density) put(d, pickPark(), 0.85 + rnd() * 0.6);
        }
      }
    }
  }

  // 섬: 섬의 긴 축·짧은 축 좌표로 고르게 뿌린다
  for (const isl of ISLANDS) {
    const poly = isl.poly;
    const count = isl.zone === ZONE.BAMSEOM ? 520 : isl.zone === ZONE.NODEUL ? 1500 : 60;
    for (let i = 0; i < count * density; i++) {
      const x = poly.cx + (rnd() - 0.5) * 2 * poly.radius, z = poly.cz + (rnd() - 0.5) * 2 * poly.radius;
      sampleField(x, z, f);
      if (f.zone !== isl.zone || f.d < 2.5) continue;
      if (isl.zone === ZONE.BAMSEOM) tryAdd(x, z, 3, 0.8 + rnd() * 0.8, { minD: 2.5 });
      else if (isl.zone === ZONE.SEORAE) { if (f.d < 3.6 || f.d > 7.4) tryAdd(x, z, 3, 0.7 + rnd() * 0.4, { minD: 2.2 }); }
      else {
        const F = NODEUL_FRAME;
        const s = (x - F.cx) * F.ax + (z - F.cz) * F.az;
        if (f.d > 4.6 && f.d < 10.4) continue; // 순환 산책로
        if (s > 40 && f.d > 10.6) tryAdd(x, z, rnd() < 0.3 ? 2 : rnd() < 0.6 ? 0 : 1, 0.85 + rnd() * 0.55, { minD: 3 }); // 동쪽 숲
        else if (s < -34 && f.d > 10.6 && f.d < 20 && rnd() < 0.22) tryAdd(x, z, pickPark(), 0.8 + rnd() * 0.4, { minD: 3 }); // 잔디마당 둘레
        else if (f.d < 4.4 && rnd() < 0.2) tryAdd(x, z, 3, 0.6 + rnd() * 0.3, { minD: 2.4 }); // 물가 버드나무
      }
    }
  }

  // 인스턴스 메시 구성: 수종 × 동서 구역(시야 밖 구역은 통째로 컬링)
  const group = new THREE.Group();
  group.name = 'vegetation';
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  leafMat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = ctx.uniforms.uNoise;
    shader.uniforms.uKeyDir = ctx.uniforms.uKeyDir;
    shader.uniforms.uKeyColor = ctx.uniforms.uKeyColor;
    Object.assign(shader.uniforms, { uWindDir: ctx.uniforms.uWindDir, uWind: ctx.uniforms.uWind, uGust: ctx.uniforms.uGust, uTime: ctx.uniforms.uTime });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n#define LEAF_FLUTTER\n${WIND_GLSL}\nvarying vec3 vLeafPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${TREE_SWAY}
        #ifdef USE_INSTANCING
          vLeafPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vLeafPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise; uniform vec3 uKeyDir, uKeyColor; varying vec3 vLeafPos;
        vec3 gLeafN = vec3(0.0);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 lp = vLeafPos.xz + vLeafPos.y * vec2(0.37, 0.61);
          float l1 = texture2D(uNoise, lp * 1.7).b;
          float l2 = texture2D(uNoise, lp * 0.21).g;
          float l3 = texture2D(uNoise, lp * 2.6 + 0.3).b;
          // 잎 뭉치의 밝고 어두운 얼룩
          float clump = smoothstep(0.3, 0.7, l1);
          diffuseColor.rgb *= mix(0.74, 1.08, clump) * (0.88 + 0.24 * l2) * (0.9 + 0.2 * l3);
          gLeafN = vec3(l1, l3, texture2D(uNoise, lp.yx * 1.1).b) - 0.5;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + gLeafN * 0.8);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // 역광일 때 잎이 빛을 머금는 효과
          vec3 Lv = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
          float back = pow(max(dot(-normalize(vViewPosition), Lv), 0.0), 2.5);
          totalEmissiveRadiance += diffuseColor.rgb * uKeyColor * back * 0.09;
        }`);
  };
  ctx.materials.leaf = leafMat;
  const SECT = 440, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const buckets = new Map();
  for (const t of trees) {
    const key = t.v + ':' + Math.floor((t.x + 2200) / SECT);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const lods = [];
  for (const [key, arr] of buckets) {
    const vi = +key.split(':')[0];
    const pair = [variants[vi], variantsLo[vi]].map((v) => {
      const mesh = new THREE.InstancedMesh(v.geo, leafMat, arr.length);
      arr.forEach((t, i) => {
        q.setFromAxisAngle(up, t.rot);
        m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + 0.2 * ((i * 7) % 5) / 5), t.s));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.setHex(t.color).multiplyScalar(0.85 + 0.3 * ((i * 13) % 7) / 7));
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      return mesh;
    });
    pair[1].visible = false;
    lods.push({ hi: pair[0], lo: pair[1], c: pair[0].boundingSphere.center, r: pair[0].boundingSphere.radius });
  }
  // 줄기
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 7, 1, true);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5644, roughness: 1 });
  trunkMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uNoise: ctx.uniforms.uNoise, uWindDir: ctx.uniforms.uWindDir, uWind: ctx.uniforms.uWind, uGust: ctx.uniforms.uGust, uTime: ctx.uniforms.uTime });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TREE_SWAY}`);
  };
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  trees.forEach((t, i) => {
    const v = variants[t.v];
    m4.compose(new THREE.Vector3(t.x, t.y - 0.2, t.z), q.identity(), new THREE.Vector3(v.trunkR * t.s * 1.2, (v.trunkH + 0.4) * t.s, v.trunkR * t.s * 1.2));
    trunks.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  trunks.frustumCulled = false;
  group.add(trunks);
  ctx.scene.add(group);
  ctx.trees = trees;
  // 먼 구역의 나무는 단순한 모양으로 바꿔 그린다
  const update = (cam) => {
    for (const l of lods) {
      const far = Math.hypot(cam.x - l.c.x, cam.z - l.c.z) - l.r > 260;
      l.hi.visible = !far; l.lo.visible = far;
    }
  };
  return { count: trees.length, update };
}
