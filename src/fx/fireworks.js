// 여의도 불꽃놀이: 매일 밤 20:00~21:00(게임 시간, 실제 약 75초) 강 한가운데 바지선에서 쏘아 올린다.
// 불꽃 하나하나는 GPU에서 계산하는 점이라 수천 개가 터져도 가볍고, 강 건너 멀리서도 보인다.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';

const SHELLS = 18, PER = 150, TRAIL = 5, RISE = 14, RISE_T = 1.6;
export const fireworksOn = (hour) => hour >= 20 && hour < 21;

const PALETTE = [
  [[1.0, 0.25, 0.2], [1.0, 0.7, 0.3]], [[1.0, 0.75, 0.25], [1.0, 0.95, 0.7]], [[0.3, 0.7, 1.0], [0.8, 0.9, 1.0]],
  [[0.5, 1.0, 0.45], [0.9, 1.0, 0.6]], [[1.0, 0.4, 0.8], [1.0, 0.8, 0.95]], [[0.75, 0.45, 1.0], [0.5, 0.8, 1.0]],
  [[1.0, 0.85, 0.5], [1.0, 0.5, 0.15]], [[1.0, 1.0, 1.0], [1.0, 0.8, 0.5]],
];

export function buildFireworks(ctx) {
  const site = ctx.fwSite, u = ctx.uniforms;
  // 바지선 3척
  const gb = new GeoBuilder();
  const barges = [-70, 0, 70].map((o) => ({ x: site.x + o, z: site.z + (o === 0 ? 0 : 6) }));
  for (const b of barges) { gb.color(0x3a3d42); gb.box(b.x, 0.35, b.z, 16, 0.9, 7); gb.color(0x6a5a3a); for (let i = -2; i <= 2; i++) gb.box(b.x + i * 2.4, 1.1, b.z, 0.6, 0.7, 0.6); }
  const barge = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  ctx.scene.add(barge);

  const n = SHELLS * (PER * TRAIL + RISE);
  const aDir = new Float32Array(n * 3), aInfo = new Float32Array(n * 4);
  let k = 0;
  for (let s = 0; s < SHELLS; s++) {
    for (let p = 0; p < PER; p++) {
      const z = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - z * z), sp = 0.82 + Math.random() * 0.18, rn = Math.random();
      for (let t = 0; t < TRAIL; t++) {
        aDir.set([Math.cos(a) * r * sp, z * sp, Math.sin(a) * r * sp], k * 3);
        aInfo.set([s, t, rn, 0], k * 4); k++;
      }
    }
    for (let t = 0; t < RISE; t++) { aInfo.set([s, t, Math.random(), 1], k * 4); k++; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(aDir, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(aInfo, 4));
  const uShell = [], uColA = [], uColB = [];
  for (let i = 0; i < SHELLS; i++) { uShell.push(new THREE.Vector4(0, -500, 0, -100)); uColA.push(new THREE.Vector4(1, 1, 1, 0)); uColB.push(new THREE.Vector4(1, 1, 1, 60)); }
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: u.uTime, uShell: { value: uShell }, uColA: { value: uColA }, uColB: { value: uColB }, uPx: { value: 900 } },
    vertexShader: /* glsl */ `
      attribute vec3 aDir; attribute vec4 aInfo;
      uniform float uTime, uPx;
      uniform vec4 uShell[${SHELLS}], uColA[${SHELLS}], uColB[${SHELLS}];
      varying vec3 vCol; varying float vA;
      void main() {
        int i = int(aInfo.x + 0.5);
        vec4 sh = uShell[i]; vec4 ca = uColA[i]; vec4 cb = uColB[i];
        float type = ca.a, R = cb.a, rn = aInfo.z;
        vec3 pos; float size; vA = 0.0; vCol = vec3(0.0);
        if (aInfo.w > 0.5) { // 올라가는 불씨
          float t = uTime - (sh.w - ${RISE_T.toFixed(1)}) - aInfo.y * 0.035;
          float q = clamp(t / ${RISE_T.toFixed(1)}, 0.0, 1.0);
          pos = vec3(sh.x + sin(q * 9.0 + rn * 6.0) * 0.8, mix(1.5, sh.y, 1.0 - (1.0 - q) * (1.0 - q)), sh.z);
          vA = step(0.0, t) * step(t, ${RISE_T.toFixed(1)}) * (1.0 - aInfo.y / ${RISE}.0) * 0.8;
          vCol = vec3(1.0, 0.8, 0.5) * 1.5; size = 1.3;
        } else {
          float age = uTime - sh.w - aInfo.y * 0.055;
          float life = (type > 0.5 && type < 1.5 ? 4.6 : 3.2) * (0.7 + 0.5 * rn);
          vec3 d = aDir;
          if (type > 1.5 && type < 2.5) d = normalize(vec3(d.x, d.y * 0.1, d.z)) * 0.95; // 고리
          if (type > 3.5) d *= (rn < 0.5 ? 0.5 : 1.0); // 이중
          float k = 1.0 - exp(-max(age, 0.0) * 1.7);
          float grav = type > 0.5 && type < 1.5 ? 5.5 : 2.6;
          pos = sh.xyz + d * R * k - vec3(0.0, grav * age * age, 0.0);
          float f = clamp(age / life, 0.0, 1.0);
          float tw = type > 2.5 && type < 3.5 ? step(0.45, fract(sin(rn * 91.7 + floor(uTime * 22.0) * 3.1) * 43758.5)) : 1.0; // 반짝이
          vA = step(0.0, age) * step(age, life) * pow(1.0 - f, 1.4) * (1.0 - aInfo.y / ${TRAIL}.0 * 0.75) * tw;
          vCol = mix(vec3(1.6), mix(ca.rgb, cb.rgb, smoothstep(0.25, 0.9, f)) * 2.6, smoothstep(0.0, 0.18, age));
          size = (2.6 - aInfo.y * 0.3) * (R / 70.0);
        }
        vec4 mv = viewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.001 ? max(size * uPx / max(-mv.z, 1.0), 2.4) : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - r, 0.0), 1.5) * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vCol * a, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  ctx.scene.add(pts);

  let next = 0, idx = 0, wasOn = false, showT = 0;
  const pending = [];
  const api = {
    active: false, flash: 0, site, onStart: null, onLaunch: null, onBurst: null,
    // 한 발 쏘기
    launch(big = 1) {
      const t = u.uTime.value, i = idx++ % SHELLS, b = barges[Math.floor(Math.random() * 3)];
      const x = b.x + (Math.random() - 0.5) * 60, z = b.z + (Math.random() - 0.5) * 24, y = 150 + Math.random() * 150 * big;
      const R = (70 + Math.random() * 70) * big, pal = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const r = Math.random(), type = r < 0.42 ? 0 : r < 0.6 ? 1 : r < 0.72 ? 2 : r < 0.87 ? 3 : 4;
      uShell[i].set(x, y, z, t + RISE_T);
      uColA[i].set(pal[0][0], pal[0][1], pal[0][2], type);
      uColB[i].set(pal[1][0], pal[1][1], pal[1][2], R);
      pending.push({ t: t + RISE_T, x, y, z, R });
      if (api.onLaunch) api.onLaunch(x, z);
    },
    update(dt, hour, camera, renderer) {
      const on = fireworksOn(hour), t = u.uTime.value;
      api.active = on;
      mat.uniforms.uPx.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      if (on && !wasOn) { showT = 0; next = 0.5; if (api.onStart) api.onStart(); }
      wasOn = on;
      if (on) {
        showT += dt; next -= dt;
        const left = (21 - hour) * 75; // 남은 실제 시간(초)
        const finale = left < 13;
        if (next <= 0 && left > 2.5) {
          const burst = finale ? 2 : Math.random() < 0.25 ? 2 : 1;
          for (let b = 0; b < burst; b++) api.launch(finale ? 1.15 : 1);
          next = finale ? 0.22 + Math.random() * 0.2 : 0.7 + Math.random() * 1.3;
        }
      }
      api.flash = Math.max(0, api.flash - dt * 1.6);
      for (let i = pending.length - 1; i >= 0; i--) {
        if (t >= pending[i].t) { const p = pending[i]; pending.splice(i, 1); api.flash = 1; if (api.onBurst) api.onBurst(p); }
      }
    },
  };
  return api;
}
