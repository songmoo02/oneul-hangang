// 반포대교 달빛무지개분수: 다리 양옆에서 강으로 떨어지는 물줄기. 정해진 시간에 쇼가 열리고 밤에는 무지갯빛으로 물든다.
import * as THREE from 'three';

// 매시 30분부터 게임 시간 40분 동안 (12:30 ~ 21:30 시작)
export function fountainShow(hour) {
  const h = Math.floor(hour), m = hour - h;
  if (m >= 0.5 && h >= 12 && h <= 21) return 1;
  if (m < 1 / 6 && h >= 13 && h <= 22) return 1;
  return 0;
}

export function buildFountain(ctx) {
  const p = ctx.bridgePlans.find((b) => b.id === 'banpo');
  const PER = 14, step = 2.3;
  const data = [];
  for (const side of [1, -1]) {
    for (let s = p.sW0 + 12; s < p.sW1 - 12; s += step) {
      for (let k = 0; k < PER; k++) data.push(s, side, k / PER, Math.random());
    }
  }
  const n = data.length / 4;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aN', new THREE.InstancedBufferAttribute(new Float32Array(data), 4));
  g.instanceCount = n;
  const uShow = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: ctx.uniforms.uTime, uShow, uNightK: ctx.uniforms.uNightK, uAmb: ctx.uniforms.uFoamCol,
      uOrigin: { value: new THREE.Vector3(p.ax, p.H - 0.7, p.az) }, uDir: { value: new THREE.Vector2(p.dx, p.dz) }, uSide: { value: new THREE.Vector2(p.sx, p.sz) },
      uHalfW: { value: p.W / 2 + 0.25 }, uLen: { value: p.L },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aN; // 다리 방향 위치, 좌우, 위상, 난수
      uniform float uTime, uShow, uNightK, uHalfW, uLen;
      uniform vec3 uOrigin, uAmb;
      uniform vec2 uDir, uSide;
      varying vec3 vCol; varying float vA; varying vec2 vQ;
      vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float s = aN.x, sd = aN.y;
        // 물줄기가 춤추듯 세졌다 약해졌다 한다
        float dance = 0.55 + 0.45 * sin(s * 0.045 - uTime * 1.1) * sin(uTime * 0.37 + s * 0.011);
        float T = 1.75 + 0.5 * dance;
        float ph = fract(aN.z + uTime / T + aN.w * 0.05);
        float t = ph * T;
        vec3 p0 = uOrigin + vec3(uDir.x, 0.0, uDir.y) * s + vec3(uSide.x, 0.0, uSide.y) * (sd * uHalfW);
        vec3 v0 = vec3(uSide.x, 0.0, uSide.y) * sd * (5.5 + 5.0 * dance) + vec3(0.0, 3.0 + 4.5 * dance, 0.0) + vec3(uDir.x, 0.0, uDir.y) * (aN.w - 0.5) * 0.6;
        vec3 c = p0 + v0 * t + vec3(0.0, -4.9 * t * t, 0.0);
        vec3 vel = v0 + vec3(0.0, -9.8 * t, 0.0);
        vec3 along = normalize(vel);
        vec3 toCam = normalize(cameraPosition - c);
        vec3 right = normalize(cross(along, toCam));
        float show = uShow * step(0.0, c.y);
        vec3 pos = c + right * position.x * (0.16 + 0.22 * ph) * show + along * (position.y - 0.5) * (0.9 + 0.9 * ph) * show;
        vQ = position.xy;
        float night = clamp(uNightK, 0.0, 1.0);
        vec3 rainbow = hue(s / uLen * 1.6 + uTime * 0.03 + sd * 0.08);
        vCol = mix(uAmb * 1.15, rainbow * 2.4 + 0.25, night);
        vA = show * mix(0.5, 0.75, night) * (1.0 - ph * 0.45);
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying float vA; varying vec2 vQ;
      void main() {
        float a = (1.0 - abs(vQ.x) * 2.0) * smoothstep(0.0, 0.25, vQ.y) * smoothstep(1.0, 0.6, vQ.y);
        gl_FragColor = vec4(vCol, a * vA);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = 'fountain';
  ctx.scene.add(mesh);
  const center = p.at(p.mid);
  let was = 0;
  return {
    active: 0, x: center[0], z: center[1],
    update(dt, hour, onStart) {
      const target = fountainShow(hour);
      if (target && !was && onStart) onStart();
      was = target;
      uShow.value += (target - uShow.value) * Math.min(1, dt * 0.8);
      mesh.visible = uShow.value > 0.01;
      this.active = uShow.value;
    },
  };
}
