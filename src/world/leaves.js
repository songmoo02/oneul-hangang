// 낙엽: 나무 아래에서 회전하며 떨어지고(돌풍 때 한꺼번에), 바닥에 쌓이고, 걸으면 발밑에서 흩날린다. + 바람에 날리는 깃발.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';
import { mulberry32 } from '../core/math.js';
import { WIND_GLSL } from './wind.js';
import { GM_GLSL } from './grassmap.js';
import { injectedMaterial } from './grass.js';
import { heightAt, PLAZA_POINTS, NODEUL_FRAME } from './field.js';

const LEAF_COL = /* glsl */ `
vec3 leafCol(float r) {
  return r < 0.3 ? vec3(0.66, 0.44, 0.03) : r < 0.55 ? vec3(0.56, 0.19, 0.02) : r < 0.75 ? vec3(0.42, 0.045, 0.02) : vec3(0.24, 0.1, 0.03);
}`;

function instancedQuads(count, seed, cols = 4) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const rnd = mulberry32(seed);
  const off = new Float32Array(count * 4), rn = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) { off[i] = rnd(); rn[i] = rnd(); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  if (cols > 4) g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rn, 4));
  g.instanceCount = count;
  return g;
}

export function buildLeaves(ctx, grassMap) {
  const u = ctx.uniforms;
  const center = { value: new THREE.Vector2() };

  // ── 떨어지는 낙엽
  const FALL_N = 2600;
  const fallMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uNoise: u.uNoise, uWindDir: u.uWindDir, uWind: u.uWind, uGust: u.uGust, uTime: u.uTime,
      uGrassMap: { value: grassMap.tex }, uCenter: center,
      uAmbientCol: u.uAmbientCol, uKeyColor: u.uKeyColor, uKeyDir: u.uKeyDir,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aOff; // xy: 타일 좌표, z: 낙하 위상, w: 밀도 순위
      attribute vec4 aRnd;
      ${GM_GLSL}
      uniform vec2 uCenter;
      uniform vec3 uAmbientCol, uKeyColor, uKeyDir;
      ${WIND_GLSL}
      ${LEAF_COL}
      varying vec3 vCol;
      void main() {
        const float A = 64.0;
        vec2 w0 = (fract(aOff.xy - uCenter / A) - 0.5) * A + uCenter;
        vec4 m = gmSample(w0);
        float ws = windAt(w0);
        float gustK = smoothstep(0.45, 1.5, ws);
        // 잔잔할 땐 드문드문, 돌풍이 지나가면 한꺼번에
        float amount = m.a * (0.1 + 0.9 * gustK);
        float show = smoothstep(aOff.w, aOff.w + 0.1, amount) * (1.0 - smoothstep(A * 0.4, A * 0.5, length(w0 - uCenter)));
        float ft = fract(aOff.z + uTime * (0.085 + 0.07 * aRnd.x));
        float startH = 3.2 + 5.2 * aRnd.y;
        vec3 c = vec3(w0.x, m.r + 0.06 + startH * (1.0 - ft), w0.y);
        c.xz += uWindDir * (ws * 3.2 + 0.35) * ft * startH * 0.38;
        c.xz += vec2(sin(uTime * 1.3 + aRnd.z * 40.0), cos(uTime * 1.1 + aRnd.w * 40.0)) * 0.4 * ft;
        // 팔랑팔랑 회전
        float ang = uTime * (2.2 + 3.4 * aRnd.z) + aRnd.w * 6.2831;
        vec3 ax = normalize(vec3(cos(aRnd.x * 6.2831), 0.45, sin(aRnd.x * 6.2831)));
        vec3 b1 = normalize(cross(ax, vec3(0.0, 1.0, 0.0)));
        vec3 b2 = cross(ax, b1);
        vec3 u2 = b1 * cos(ang) + b2 * sin(ang);
        float sz = (0.1 + 0.07 * aRnd.y) * show * smoothstep(0.0, 0.04, ft) * (1.0 - smoothstep(0.96, 1.0, ft));
        vec3 p = c + (ax * position.x * 1.25 + u2 * position.y) * sz;
        vec3 n = normalize(cross(ax, u2));
        vCol = leafCol(aRnd.w) * (uAmbientCol + uKeyColor * (0.1 + 0.22 * abs(dot(n, uKeyDir))));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `varying vec3 vCol; void main() { gl_FragColor = vec4(vCol, 1.0); }`,
  });
  const falling = new THREE.Mesh(instancedQuads(FALL_N, 77, 8), fallMat);
  falling.frustumCulled = false;
  falling.layers.set(1);
  falling.name = 'fallingLeaves';
  ctx.scene.add(falling);

  // ── 바닥에 쌓인 낙엽 (그림자를 받도록 표준 재질)
  const GROUND_N = 12000;
  const groundMat = injectedMaterial(ctx, {
    uniforms: { uGrassMap: { value: grassMap.tex }, uCenter: center },
    vertPre: /* glsl */ `
      attribute vec4 aOff;
      ${GM_GLSL}
      uniform vec2 uCenter;
      varying vec3 vGCol;
      ${LEAF_COL}`,
    vertMain: /* glsl */ `
      const float LA = 52.0;
      vec2 gW = (fract(aOff.xy - uCenter / LA) - 0.5) * LA + uCenter;
      vec4 gM = gmSample(gW);
      float lShow = smoothstep(aOff.z, aOff.z + 0.06, pow(gM.a, 0.55) * 0.92) * step(0.4, gM.r)
        * (1.0 - smoothstep(LA * 0.42, LA * 0.5, length(gW - uCenter)));
      vec2 lAway;
      float lPress = trailPress(gW, lAway);
      // 방금 지나간 자리의 낙엽은 살짝 떠올랐다가 내려앉는다
      float lQ = clamp((1.0 - lPress) / 0.3, 0.0, 1.0) * step(0.001, lPress);
      float lUp = sin(3.14159 * lQ) * step(lQ, 0.999);
      float lWs = windAt(gW);
      float lRot = aOff.w * 6.2831 + lUp * 4.0 * (aOff.z - 0.5) + lWs * 0.25 * sin(uTime * 3.0 + aOff.w * 50.0);
      vec2 lA = vec2(cos(lRot), sin(lRot)), lB = vec2(-lA.y, lA.x);
      float lSz = (0.11 + 0.07 * fract(aOff.w * 9.7)) * lShow;
      vec3 gPos = vec3(gW.x, gM.r + 0.025 + aOff.z * 0.02, gW.y);
      gPos.xz += (lA * position.x * 1.25 + lB * position.y) * lSz;
      gPos.xz += lAway * lUp * 0.45 + uWindDir * smoothstep(1.0, 1.8, lWs) * 0.12 * sin(uTime * 2.0 + aOff.w * 31.0);
      gPos.y += lUp * (0.22 + 0.3 * fract(aOff.w * 3.3)) + position.x * lUp * 0.08;
      vec3 objectNormal = vec3(0.0, 1.0, 0.0);
      vGCol = leafCol(fract(aOff.w * 17.3)) * (0.75 + 0.4 * fract(aOff.w * 5.9));`,
    fragPre: 'varying vec3 vGCol;', fragColor: 'diffuseColor.rgb = vGCol;', roughness: 0.85,
  });
  const ground = new THREE.Mesh(instancedQuads(GROUND_N, 177), groundMat);
  ground.frustumCulled = false;
  ground.receiveShadow = true;
  ground.layers.set(1);
  ground.name = 'groundLeaves';
  ctx.scene.add(ground);

  // ── 깃발
  const spots = [];
  for (const pl of PLAZA_POINTS) spots.push([pl.x + pl.r * 0.72, pl.z + pl.r * 0.3], [pl.x - pl.r * 0.72, pl.z + pl.r * 0.3]);
  const F = NODEUL_FRAME;
  for (const [s, t] of [[-20, 16], [-20, -16], [20, 16]]) spots.push([F.cx + F.ax * s + F.bx * t, F.cz + F.az * s + F.bz * t]);
  const POLE_H = 7.2;
  const gb = new GeoBuilder();
  gb.color(0xb9bcc0);
  const anchors = [], cols = [];
  const palette = [[0.75, 0.16, 0.1], [0.1, 0.25, 0.55], [0.85, 0.5, 0.08], [0.1, 0.42, 0.3]];
  spots.forEach(([x, z], i) => {
    const y = heightAt(x, z);
    gb.cylinder(x, y - 0.2, z, 0.075, 0.05, POLE_H + 0.2, 8, true);
    anchors.push(x, y + POLE_H - 0.05, z);
    cols.push(...palette[i % palette.length]);
  });
  const poles = new THREE.Mesh(gb.build(), ctx.materials.steel);
  poles.castShadow = true;
  ctx.scene.add(poles);

  const fg = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1, 14, 6);
  plane.translate(0.5, 0, 0);
  fg.setAttribute('position', plane.getAttribute('position'));
  fg.setIndex(plane.getIndex());
  fg.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(new Float32Array(anchors), 3));
  fg.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(cols), 3));
  fg.instanceCount = spots.length;
  const flagMat = injectedMaterial(ctx, {
    uniforms: {},
    vertPre: /* glsl */ `
      attribute vec3 aAnchor, aCol;
      varying vec3 vGCol;`,
    vertMain: /* glsl */ `
      float fWs = windAt(aAnchor.xz);
      float fS = clamp(fWs * 1.25, 0.0, 1.0);
      vec3 fWd = vec3(uWindDir.x, 0.0, uWindDir.y);
      // 바람이 약하면 깃대 쪽으로 늘어지고, 세면 바람 방향으로 펴진다
      vec3 fDir = normalize(mix(vec3(0.0, -1.0, 0.0) + fWd * 0.2, fWd + vec3(0.0, -0.1, 0.0), fS));
      vec3 fSide = normalize(cross(fWd, vec3(0.0, 1.0, 0.0)));
      vec3 fUp = normalize(cross(fSide, fDir));
      float fu = position.x;
      float fPh = fu * 7.5 - uTime * (3.5 + 6.5 * fWs) + aAnchor.x * 0.7;
      float fWave = sin(fPh) * 0.17 * fu * (0.25 + fS) + sin(fu * 17.0 - uTime * 9.0 + position.y * 3.0) * 0.035 * fu * fS;
      vec3 gPos = aAnchor + fDir * (fu * 2.5) + fUp * ((position.y - 0.5) * 1.55) + fSide * fWave;
      vec3 objectNormal = normalize(fSide - fDir * cos(fPh) * 0.5 * (0.25 + fS));
      vGCol = mix(aCol, vec3(0.9, 0.88, 0.82), step(0.0, position.y) * step(position.y, 0.22) + step(position.y, -0.3));`,
    fragPre: 'varying vec3 vGCol;', fragColor: 'diffuseColor.rgb = vGCol;', roughness: 0.7,
  });
  const flags = new THREE.Mesh(fg, flagMat);
  flags.frustumCulled = false;
  flags.name = 'flags';
  ctx.scene.add(flags);

  return {
    flagCount: spots.length,
    update(px, pz) { center.value.set(px, pz); },
    setQuality(q) {
      falling.geometry.instanceCount = Math.round(FALL_N * q.leaves);
      ground.geometry.instanceCount = Math.round(GROUND_N * q.leaves);
    },
  };
}
