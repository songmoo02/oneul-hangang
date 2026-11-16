// 후처리: 대기 원근(안개·물안개) → 빛줄기 → 블룸 → 톤매핑·색보정 → (필요 시) FXAA
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SKY_COMMON, skyUniforms } from '../sky/skyglsl.js';

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 해 방향으로 하늘 밝기를 끌어와 빛줄기를 만든다 (1/4 해상도)
const RAYS_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tDepth;
uniform vec2 uSunUV;
void main() {
  const int N = 36;
  vec2 delta = uSunUV - vUv;
  float dl = length(delta);
  vec2 stp = delta / float(N) * min(1.0, 0.85 / max(dl, 1e-3));
  vec2 uv = vUv;
  vec3 acc = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < N; i++) {
    uv += stp;
    vec2 c = clamp(uv, 0.001, 0.999);
    float inside = step(abs(uv.x - 0.5), 0.5) * step(abs(uv.y - 0.5), 0.5);
    float sky = step(0.999995, texture2D(tDepth, c).x);
    vec3 s = texture2D(tColor, c).rgb;
    float lum = dot(s, vec3(0.3, 0.5, 0.2));
    acc += min(s, vec3(4.0)) * sky * inside * smoothstep(1.2, 3.5, lum) * w;
    w *= 0.955;
  }
  acc *= (1.0 / float(N)) * (1.0 - smoothstep(0.15, 1.1, dl));
  gl_FragColor = vec4(acc, 1.0);
}`;

const COMP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tDepth, tRays;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos;
uniform float uFogDensity, uMist, uGodRays;
${SKY_COMMON}
float fogIntegral(float density, float b, float y0, float ry, float t) {
  float k = ry * b;
  float f = abs(k) > 1e-5 ? (1.0 - exp(-k * t)) / k : t;
  return density * exp(-b * max(y0, 0.0)) * f;
}
void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  float depth = texture2D(tDepth, vUv).x;
  vec4 view = uInvProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  view /= view.w;
  vec3 rd = (uCamWorld * view).xyz - uCamPos;
  float dist = length(rd);
  rd /= dist;
  vec3 fogCol = skyGradient(normalize(vec3(rd.x, 0.02 + max(rd.y, 0.0) * 0.35, rd.z)));
  if (depth < 0.999995) {
    float od = fogIntegral(uFogDensity, 0.009, uCamPos.y, rd.y, dist);
    od += fogIntegral(uMist * 0.02, 0.24, uCamPos.y - 0.4, rd.y, dist);
    col = mix(col, fogCol, clamp(1.0 - exp(-od), 0.0, 1.0));
  } else {
    // 짙은 안개에서는 하늘 아래쪽도 뿌옇게
    float low = 1.0 - smoothstep(0.0, 0.25, rd.y);
    col = mix(col, fogCol, clamp(uFogDensity * 110.0, 0.0, 0.85) * low);
  }
  col += texture2D(tRays, vUv).rgb * uGodRays;
  gl_FragColor = vec4(col, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform float uExposure, uFilter;
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = inM * (color / 0.6);
  color = RRTAndODTFit(color);
  return clamp(outM * color, 0.0, 1.0);
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 c = texture2D(tColor, vUv).rgb * uExposure;
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.07);
  // 사진 모드 필터
  if (uFilter > 0.5 && uFilter < 1.5) { c *= vec3(1.08, 1.0, 0.86); c = mix(c, c * c * (3.0 - 2.0 * c), 0.25); }
  else if (uFilter > 1.5 && uFilter < 2.5) { c = mix(c, vec3(l), 0.28); c = c * 0.86 + vec3(0.07, 0.065, 0.06); c += (hash12(gl_FragCoord.xy * 1.7) - 0.5) * 0.05; }
  else if (uFilter > 2.5 && uFilter < 3.5) { c = vec3(dot(c, vec3(0.3, 0.59, 0.11))); c = mix(c, c * c * (3.0 - 2.0 * c), 0.5); }
  else if (uFilter > 3.5) { c = mix(vec3(l), c, 1.35); c = mix(c, c * c * (3.0 - 2.0 * c), 0.3); }
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.32;
  c = mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export class PostFX {
  constructor(ctx) {
    this.ctx = ctx;
    const u = ctx.uniforms;
    this.raysMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: RAYS_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) } },
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: COMP_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        ...skyUniforms,
        tColor: { value: null }, tDepth: { value: null }, tRays: { value: null },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uFogDensity: u.uFogDensity, uMist: u.uMist, uGodRays: { value: 0 },
      },
    });
    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, uExposure: u.uExposure, uFilter: { value: 0 } },
    });
    this.fxaaMat = new THREE.ShaderMaterial({
      vertexShader: FXAAShader.vertexShader, fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2() } },
    });
    this.quad = new FullScreenQuad(this.raysMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.55, 1.6);
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this._v = new THREE.Vector4();
    this.w = 0; this.h = 0;
    this.q = null;
  }

  setQuality(q) { this.q = q; this._alloc(); }

  setSize(w, h) { this.w = w; this.h = h; this._alloc(); }

  _alloc() {
    if (!this.q || !this.w) return;
    const { w, h, q } = this;
    for (const k of ['rtMain', 'rtRays', 'rtComp', 'rtLDR']) if (this[k]) { this[k].dispose(); this[k] = null; }
    this.rtMain = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa, depthBuffer: true });
    this.rtMain.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.rtComp = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    if (q.rays) this.rtRays = new THREE.WebGLRenderTarget(Math.ceil(w / 4), Math.ceil(h / 4), { type: THREE.HalfFloatType, depthBuffer: false });
    if (q.fxaa) this.rtLDR = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
    this.bloom.setSize(w, h);
    this.fxaaMat.uniforms.resolution.value.set(1 / w, 1 / h);
  }

  _pass(mat, target) {
    const r = this.ctx.renderer;
    this.quad.material = mat;
    r.setRenderTarget(target);
    this.quad.render(r);
  }

  render(scene, camera) {
    const r = this.ctx.renderer, q = this.q, u = this.ctx.uniforms;
    r.setRenderTarget(this.rtMain);
    r.clear();
    r.render(scene, camera);

    // 빛줄기
    let rays = this.black;
    const g = u.uGodRays.value;
    if (q.rays && g > 0.01) {
      const v = this._v.set(u.uSunDirRef.x * 1000 + camera.position.x, u.uSunDirRef.y * 1000 + camera.position.y, u.uSunDirRef.z * 1000 + camera.position.z, 1)
        .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      if (v.w > 0) {
        const sx = v.x / v.w * 0.5 + 0.5, sy = v.y / v.w * 0.5 + 0.5;
        if (sx > -0.6 && sx < 1.6 && sy > -0.6 && sy < 1.6) {
          this.raysMat.uniforms.tColor.value = this.rtMain.texture;
          this.raysMat.uniforms.tDepth.value = this.rtMain.depthTexture;
          this.raysMat.uniforms.uSunUV.value.set(sx, sy);
          this._pass(this.raysMat, this.rtRays);
          rays = this.rtRays.texture;
        }
      }
    }

    // 대기·합성
    const cu = this.compMat.uniforms;
    cu.tColor.value = this.rtMain.texture;
    cu.tDepth.value = this.rtMain.depthTexture;
    cu.tRays.value = rays;
    cu.uGodRays.value = rays === this.black ? 0 : g * 0.38;
    cu.uInvProj.value.copy(camera.projectionMatrixInverse);
    cu.uCamWorld.value.copy(camera.matrixWorld);
    cu.uCamPos.value.copy(camera.position);
    this._pass(this.compMat, this.rtComp);

    if (q.bloom) this.bloom.render(r, null, this.rtComp, 0, false);

    this.finalMat.uniforms.tColor.value = this.rtComp.texture;
    if (q.fxaa) {
      this._pass(this.finalMat, this.rtLDR);
      this.fxaaMat.uniforms.tDiffuse.value = this.rtLDR.texture;
      this._pass(this.fxaaMat, null);
    } else {
      this._pass(this.finalMat, null);
    }
  }
}
