// 가로등(순차 점등)과 벤치.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';
import { mulberry32 } from '../core/math.js';
import { sampleField, heightFromField, pathSDF, bankN, bankS, ISLANDS, ZONE, isGroundWalkable } from './field.js';

const LAMP_GLSL = /* glsl */ `
// order(0~1)가 작은 가로등부터 차례로 켜진다. 켜지는 순간 잠깐 깜빡인다.
float lampOn(float order, float prog, float t) {
  float x = (prog - order * 0.92) * 16.0;
  float on = clamp(x, 0.0, 1.0);
  float igniting = step(0.001, x) * (1.0 - step(1.0, x));
  float flick = 0.45 + 0.55 * step(0.2, fract(sin(floor(t * 14.0) * 12.9898 + order * 311.7) * 43758.5453));
  return on * mix(1.0, flick, igniting);
}`;

export function buildProps(ctx) {
  const rnd = mulberry32(99);
  const lamps = ctx.lamps; // 다리에서 이미 추가된 것 포함
  const benches = [];
  const f = {};

  // 강변 산책로 가로등·벤치
  for (const bank of [bankN, bankS]) {
    const north = bank === bankN;
    const p = {};
    let k = 0;
    // 가로수(26유닛 간격)와 엇갈리도록 13유닛 어긋나게 세운다
    for (let u = 0; u < bank.total; u += 13) {
      k++;
      bank.at(u, p);
      if (p.x < -1560 || p.x > 1700) continue;
      const lx = north ? p.tz : -p.tz, lz = north ? -p.tx : p.tx;
      if (k % 2 === 0) {
        const d = p.w > 20 ? 10.7 : 9.9;
        const x = p.x + lx * d, z = p.z + lz * d;
        sampleField(x, z, f);
        if (f.zone <= 1 && isGroundWalkable(f) && !ctx.nearBridge(x, z, 1.5)) {
          lamps.push({ x, y: heightFromField(f, x, z), z, kind: 'park', dirx: -lx, dirz: -lz });
        }
      } else if (k % 6 === 3) {
        const x = p.x + lx * 9.75, z = p.z + lz * 9.75;
        sampleField(x, z, f);
        const nearTree = (ctx.trees || []).some((t) => Math.abs(t.x - x) < 3 && Math.abs(t.z - z) < 3);
        if (!nearTree && f.zone <= 1 && isGroundWalkable(f) && !ctx.nearBridge(x, z, 2) && pathSDF(x, z) > 1) {
          benches.push({ x, y: heightFromField(f, x, z), z, dirx: -lx, dirz: -lz });
        }
      }
    }
  }
  // 섬 순환 산책로
  for (const isl of ISLANDS) {
    if (isl.zone === ZONE.BAMSEOM) continue;
    const poly = isl.poly, p = {};
    const off = isl.zone === ZONE.NODEUL ? 10.3 : 7.4;
    let k = 0;
    for (let u = 0; u < poly.total; u += isl.zone === ZONE.NODEUL ? 11 : 16) {
      k++;
      poly.at(u, p);
      const nx = -p.tz * poly.orient, nz = p.tx * poly.orient; // 섬 안쪽
      const x = p.x + nx * off, z = p.z + nz * off;
      sampleField(x, z, f);
      if (f.zone !== isl.zone || f.d < off - 2.5) continue;
      if (ctx.nearBridge(x, z, 2)) continue;
      if (k % 2 === 1) lamps.push({ x, y: heightFromField(f, x, z), z, kind: 'park', dirx: -nx, dirz: -nz });
      else if (k % 4 === 0 && isl.zone === ZONE.NODEUL) {
        const bx = p.x + nx * 9.9, bz = p.z + nz * 9.9;
        sampleField(bx, bz, f);
        benches.push({ x: bx, y: heightFromField(f, bx, bz), z: bz, dirx: -nx, dirz: -nz });
      }
    }
  }

  // ── 가로등 기둥(한 메시로 합침)
  const gb = new GeoBuilder();
  const n = lamps.length;
  const headPos = new Float32Array(n * 3), order = new Float32Array(n), color = new Float32Array(n * 3), size = new Float32Array(n);
  const headMat4 = [];
  const SPEC = {
    park: { h: 4.6, arm: 0.55, r: 0.07, col: [1.0, 0.8, 0.55], glow: 1.0, pool: 6.5 },
    bridge: { h: 7.6, arm: 2.6, r: 0.1, col: [1.0, 0.86, 0.66], glow: 1.35, pool: 8.5 },
    low: { h: 3.4, arm: 0.35, r: 0.06, col: [1.0, 0.78, 0.5], glow: 0.8, pool: 5.0 },
  };
  lamps.forEach((l, i) => {
    const s = SPEC[l.kind];
    gb.color(0x3d4146);
    gb.cylinder(l.x, l.y - 0.2, l.z, s.r * 1.5, s.r, s.h + 0.2, 6, false);
    const hx = l.x + l.dirx * s.arm, hz = l.z + l.dirz * s.arm, hy = l.y + s.h;
    gb.beam([l.x, hy - 0.05, l.z], [hx, hy + 0.12, hz], 0.07, 0.07);
    headPos.set([hx, hy + 0.05, hz], i * 3);
    order[i] = Math.min(1, Math.max(0, (l.x + 1500) / 3200)) * 0.9 + rnd() * 0.1;
    color.set(s.col, i * 3);
    size[i] = s.glow;
    l.hx = hx; l.hy = hy; l.hz = hz; l.order = order[i]; l.spec = s;
    const m = new THREE.Matrix4();
    const yaw = Math.atan2(-l.dirz, l.dirx);
    m.compose(new THREE.Vector3(hx, hy + 0.1, hz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(l.kind === 'bridge' ? 0.85 : 0.5, 0.1, l.kind === 'bridge' ? 0.3 : 0.24));
    headMat4.push(m);
  });
  const poles = new THREE.Mesh(gb.build(), ctx.materials.steel);
  poles.castShadow = true;
  poles.name = 'lampPoles';
  ctx.scene.add(poles);

  const sharedU = { uLampOn: ctx.uniforms.uLampOn, uTime: ctx.uniforms.uTime };

  // ── 등기구(발광)
  const headGeo = new THREE.BoxGeometry(1, 1, 1);
  headGeo.setAttribute('aOrder', new THREE.InstancedBufferAttribute(order, 1));
  headGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
  const heads = new THREE.InstancedMesh(headGeo, new THREE.ShaderMaterial({
    uniforms: sharedU,
    vertexShader: /* glsl */ `
      attribute float aOrder; attribute vec3 aColor;
      uniform float uLampOn, uTime;
      varying vec3 vCol;
      ${LAMP_GLSL}
      void main() {
        float on = lampOn(aOrder, uLampOn, uTime);
        float under = step(position.y, -0.2);
        vCol = mix(vec3(0.05, 0.055, 0.06), aColor * mix(0.4, 9.0, under), on) + vec3(0.03) * (1.0 - on);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `varying vec3 vCol; void main() { gl_FragColor = vec4(vCol, 1.0); }`,
  }), n);
  headMat4.forEach((m, i) => heads.setMatrixAt(i, m));
  heads.frustumCulled = false;
  ctx.scene.add(heads);

  // ── 빛무리(점 스프라이트)
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(headPos, 3));
  pg.setAttribute('aOrder', new THREE.BufferAttribute(order, 1));
  pg.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  pg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const glow = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms: { ...sharedU, uPx: ctx.uniforms.uPixelScale },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aOrder, aSize; attribute vec3 aColor;
      uniform float uLampOn, uTime, uPx;
      varying vec3 vCol;
      ${LAMP_GLSL}
      void main() {
        float on = lampOn(aOrder, uLampOn, uTime);
        vec4 mv = viewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = clamp(uPx * 2.6 * aSize / dist, 3.0, 110.0) * step(0.01, on);
        // 멀리서도 불빛 점이 사라지지 않도록 밝기를 보정
        vCol = aColor * on * (0.55 + 0.45 * smoothstep(400.0, 30.0, dist));
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - r, 0.0), 2.6);
        float core = smoothstep(0.22, 0.0, r);
        gl_FragColor = vec4(vCol * (a * 0.9 + core * 3.0), 1.0);
      }`,
  }));
  glow.frustumCulled = false;
  glow.renderOrder = 5;
  ctx.scene.add(glow);

  // ── 바닥에 떨어지는 빛(가산 혼합 원판)
  const poolGeo = new THREE.PlaneGeometry(2, 2);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.setAttribute('aOrder', new THREE.InstancedBufferAttribute(order, 1));
  poolGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.ShaderMaterial({
    uniforms: sharedU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      attribute float aOrder; attribute vec3 aColor;
      uniform float uLampOn, uTime;
      varying vec3 vCol; varying vec2 vUv;
      ${LAMP_GLSL}
      void main() {
        vCol = aColor * lampOn(aOrder, uLampOn, uTime);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = pow(max(1.0 - r, 0.0), 1.8);
        gl_FragColor = vec4(vCol * a * 0.1, 1.0);
      }`,
  }), n);
  const pm = new THREE.Matrix4();
  lamps.forEach((l, i) => {
    const s = l.spec;
    const cx = l.x + l.dirx * (s.arm + 0.8), cz = l.z + l.dirz * (s.arm + 0.8);
    pm.makeScale(s.pool, 1, s.pool).setPosition(cx, l.y + 0.07, cz);
    pools.setMatrixAt(i, pm);
  });
  pools.frustumCulled = false;
  pools.renderOrder = 4;
  pools.layers.set(1); // 수면 반사에는 넣지 않는다
  ctx.scene.add(pools);

  // ── 벤치
  if (benches.length) {
    const bg = new GeoBuilder();
    bg.color(0x8a6a48);
    for (let i = 0; i < 4; i++) bg.box(0, 0.46, -0.2 + i * 0.13, 1.7, 0.035, 0.11);
    for (let i = 0; i < 3; i++) bg.box(0, 0.62 + i * 0.14, -0.3 - i * 0.03, 1.7, 0.11, 0.035);
    bg.color(0x35383c);
    for (const x of [-0.7, 0.7]) {
      bg.box(x, 0.23, 0.0, 0.06, 0.46, 0.5);
      bg.box(x, 0.68, -0.33, 0.06, 0.5, 0.05);
    }
    const mesh = new THREE.InstancedMesh(bg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), benches.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    benches.forEach((b, i) => {
      // 벤치의 +z가 앉는 방향(강 쪽)을 향하도록
      q.setFromAxisAngle(up, Math.atan2(b.dirx, b.dirz));
      m4.compose(new THREE.Vector3(b.x, b.y, b.z), q, one);
      mesh.setMatrixAt(i, m4);
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    ctx.scene.add(mesh);
  }
  ctx.benches = benches;

  // ── 플레이어 주변을 실제로 비추는 점광원 4개(가까운 가로등에 붙였다 뗐다 한다)
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.PointLight(0xffd9a8, 0, 26, 2);
    ctx.scene.add(pl);
    lights.push(pl);
  }
  const near = [];
  const update = (px, pz, lampProg) => {
    if (lampProg <= 0.001) { for (const pl of lights) pl.intensity = 0; return; }
    near.length = 0;
    for (let i = 0; i < n; i++) {
      const l = lamps[i];
      const d2 = (l.hx - px) * (l.hx - px) + (l.hz - pz) * (l.hz - pz);
      if (d2 < 1600) near.push([d2, l]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < lights.length; i++) {
      const pl = lights[i];
      if (i >= near.length) { pl.intensity = 0; continue; }
      const l = near[i][1];
      const on = Math.min(1, Math.max(0, (lampProg - l.order * 0.92) * 16));
      pl.position.set(l.hx, l.hy - 0.25, l.hz);
      pl.color.setRGB(l.spec.col[0], l.spec.col[1], l.spec.col[2]);
      pl.intensity = on * (l.kind === 'bridge' ? 30 : l.kind === 'low' ? 10 : 14);
    }
  };
  return { update, lampCount: n, benchCount: benches.length };
}
