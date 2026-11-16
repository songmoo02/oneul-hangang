// 한강 수면: 잔물결 노멀 + 프레넬 + 평면 반사(다리·도시 불빛이 물에 비침) + 빗방울 동심원.
import * as THREE from 'three';
import { sampleField } from './field.js';
import { TERRAIN_BOUNDS } from './terrain.js';
import { SKY_COMMON, skyUniforms } from '../sky/skyglsl.js';

const VERT = /* glsl */ `
attribute float aShore;
uniform mat4 uTexMat;
varying vec3 vW;
varying float vShore;
varying vec4 vRefl;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vShore = aShore;
  vRefl = uTexMat * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vW;
varying float vShore;
varying vec4 vRefl;
${SKY_COMMON}
uniform sampler2D uNormalTex;
uniform sampler2D uReflTex;
uniform float uTime, uRain, uChop, uReflOn, uGlint;
uniform vec2 uWindDir;
uniform vec3 uCamRight, uKeyDir, uKeyColor, uAmbient, uDeep, uShallow;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// 빗방울이 만드는 동심원 기울기
vec2 rainRings(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 0.8 : 1.5;
    vec2 q = p * sc + float(k) * 17.3;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash21(cell), h2 = hash21(cell + 31.7);
    vec2 c = (vec2(h, h2) - 0.5) * 0.5;
    float tt = fract(t * (0.6 + 0.5 * h2) + h);
    vec2 dv = f - c;
    float r = length(dv);
    float ring = sin((r - tt * 0.42) * 55.0) * smoothstep(0.07, 0.0, abs(r - tt * 0.42)) * (1.0 - tt);
    acc += normalize(dv + 1e-4) * ring;
  }
  return acc;
}

void main() {
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vW.xz;
  vec2 wd = uWindDir, wn = vec2(-uWindDir.y, uWindDir.x);
  float nearK = 1.0 / (1.0 + dist * 0.012);

  vec2 s1 = texture2D(uNormalTex, p * 0.050 + wd * uTime * 0.045).xy * 2.0 - 1.0;
  vec2 s2 = texture2D(uNormalTex, p * 0.137 + wn * uTime * 0.03 + 0.37).xy * 2.0 - 1.0;
  vec2 s3 = texture2D(uNormalTex, p * 0.0117 - wd * uTime * 0.011 + 0.11).xy * 2.0 - 1.0;
  vec2 slope = (s1 * 0.5 + s2 * 0.3 * nearK + s3 * 0.5) * uChop;
  if (uRain > 0.01) slope += rainRings(p, uTime) * uRain * 0.28 * smoothstep(110.0, 15.0, dist);

  vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float F = clamp(0.02 + 0.98 * pow(1.0 - NdV, 5.0), 0.0, 1.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);

  vec3 refl;
  if (uReflOn > 0.5) {
    vec2 uv = vRefl.xy / vRefl.w;
    vec2 vf = normalize(V.xz + vec2(1e-5));
    float nr = dot(slope, uCamRight.xz), nf = dot(slope, vf);
    uv += vec2(nr * 0.03, nf * 0.11);
    // 멀수록 세로로 길게 번지는 반사 (야경 불빛 줄기)
    float spread = 0.007 + 0.03 * (1.0 - nearK) * (0.5 + uChop);
    refl = vec3(0.0);
    float wsum = 0.0;
    for (int i = -3; i <= 3; i++) {
      float fi = float(i);
      float wgt = exp(-fi * fi * 0.22);
      refl += texture2D(uReflTex, clamp(uv + vec2(0.0, fi * spread), 0.002, 0.998)).rgb * wgt;
      wsum += wgt;
    }
    refl /= wsum;
  } else {
    refl = skyGradient(normalize(R));
  }

  float shallow = smoothstep(-10.0, -0.3, vShore);
  vec3 body = mix(uDeep, uShallow, shallow * 0.45);
  vec3 lit = body * (uAmbient * 1.1 + uKeyColor * max(uKeyDir.y, 0.0) * 0.3);
  vec3 col = mix(lit, refl, F);

  float sp = max(dot(normalize(R), uKeyDir), 0.0);
  col += uKeyColor * (pow(sp, 800.0) * 5.0 + pow(sp, 80.0) * 0.22) * uGlint;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Water {
  constructor(ctx) {
    this.ctx = ctx;
    const geo = this._buildGeometry();
    this.uniforms = {
      ...skyUniforms,
      uTexMat: { value: new THREE.Matrix4() },
      uNormalTex: ctx.uniforms.uWaterNormal,
      uReflTex: { value: null },
      uTime: ctx.uniforms.uTime,
      uRain: ctx.uniforms.uRain,
      uChop: { value: 0.5 },
      uReflOn: { value: 1 },
      uGlint: { value: 1 },
      uWindDir: ctx.uniforms.uWindDir,
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uKeyDir: ctx.uniforms.uKeyDir,
      uKeyColor: ctx.uniforms.uKeyColor,
      uAmbient: { value: new THREE.Color(0.3, 0.4, 0.5) },
      uDeep: { value: new THREE.Color(0x2c4a40) },
      uShallow: { value: new THREE.Color(0x66704e) },
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'water';
    ctx.scene.add(this.mesh);

    this.mirror = new THREE.PerspectiveCamera();
    this.mirror.layers.set(0);
    this.target = null;
    this.scale = 0.5;
    this._v = new THREE.Vector3(); this._l = new THREE.Vector3(); this._t = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
    this._normal = new THREE.Vector3(0, 1, 0);
  }

  _buildGeometry() {
    const pos = [], shore = [], idx = [];
    const f = {};
    const addGrid = (x0, x1, z0, z1, step) => {
      const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
      const d = new Float32Array((nx + 1) * (nz + 1));
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) d[j * (nx + 1) + i] = sampleField(x0 + i * step, z0 + j * step, f).d;
      const map = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
      const vert = (i, j) => {
        const k = j * (nx + 1) + i;
        if (map[k] < 0) { map[k] = pos.length / 3; pos.push(x0 + i * step, 0, z0 + j * step); shore.push(d[k]); }
        return map[k];
      };
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * (nx + 1) + i;
          if (Math.min(d[k], d[k + 1], d[k + nx + 1], d[k + nx + 2]) > 2.5) continue;
          const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), e = vert(i + 1, j + 1);
          idx.push(a, c, b, b, c, e);
        }
      }
    };
    const B = TERRAIN_BOUNDS;
    addGrid(B.x0, B.x1, B.z0, B.z1, 12.5);
    addGrid(-3600, B.x0, -2000, 400, 50); // 하류(서쪽) 먼 구간
    addGrid(B.x1, 3300, -1400, 1100, 50); // 상류(동쪽) 먼 구간
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
    g.setIndex(idx);
    return g;
  }

  setQuality(q) {
    this.enabled = q.reflection;
    this.scale = q.reflScale;
    this.uniforms.uReflOn.value = q.reflection ? 1 : 0;
    if (this.target) { this.target.dispose(); this.target = null; }
  }

  // 메인 렌더 직전에 호출: 수면에 뒤집힌 카메라로 장면을 한 번 더 그린다
  renderReflection(renderer, scene, camera, width, height) {
    camera.getWorldDirection(this._l);
    this.uniforms.uCamRight.value.set(1, 0, 0).applyQuaternion(camera.quaternion);
    if (!this.enabled) return;
    const w = Math.max(64, Math.floor(width * this.scale)), h = Math.max(64, Math.floor(height * this.scale));
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      if (this.target) this.target.dispose();
      this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
      this.uniforms.uReflTex.value = this.target.texture;
    }
    const cam = this.mirror, normal = this._normal;
    const camPos = this._v.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= 0.05) return;
    // Reflector와 같은 방식: 수면(y=0)에 대해 카메라를 뒤집는다
    const view = this._t.set(camPos.x, -camPos.y, camPos.z);
    this._rot.extractRotation(camera.matrixWorld);
    const look = this._l.set(0, 0, -1).applyMatrix4(this._rot).add(camPos);
    look.y = -look.y;
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(this._rot);
    cam.up.y = -cam.up.y;
    cam.lookAt(look);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    const tm = this.uniforms.uTexMat.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(cam.projectionMatrix);
    tm.multiply(cam.matrixWorldInverse);

    // 수면 아래가 반사에 섞이지 않도록 비스듬한 근평면 클리핑
    this._plane.set(normal, 0.02);
    this._plane.applyMatrix4(cam.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = cam.projectionMatrix, e = pm.elements, q = this._q;
    q.x = (Math.sign(clip.x) + e[8]) / e[0];
    q.y = (Math.sign(clip.y) + e[9]) / e[5];
    q.z = -1.0;
    q.w = (1.0 + e[10]) / e[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1.0; e[14] = clip.w;

    this.mesh.visible = false;
    const oldTarget = renderer.getRenderTarget();
    const oldAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.shadowMap.autoUpdate = oldAuto;
    renderer.setRenderTarget(oldTarget);
    this.mesh.visible = true;
  }
}
