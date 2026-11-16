// 하늘 돔: 그라데이션 + 해·달 + 별 + 절차적 구름.
import * as THREE from 'three';
import { SKY_COMMON, skyUniforms } from './skyglsl.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // 회전만 적용해 항상 카메라 중심에 있는 돔
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
${SKY_COMMON}
uniform sampler2D uNoise;
uniform float uTime, uCloudCover, uStars, uEnvPass, uSunDisc, uMoonGlow;
uniform vec3 uCloudLit, uCloudDark, uMoonColor;
uniform vec2 uWindDir;

float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float cloudNoise(vec2 p) {
  return 0.62 * texture2D(uNoise, p).r + 0.38 * texture2D(uNoise, p * 2.7 + vec2(0.37, 0.11)).g;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyGradient(d);
  float cs = max(dot(d, uSunDir), 0.0);
  float cm = max(dot(d, uMoonDir), 0.0);
  float cloudA = 0.0;

  if (uEnvPass < 0.5) {
    // 별
    if (uStars > 0.01 && d.y > 0.0) {
      vec3 sp = d * 190.0;
      vec3 ip = floor(sp), fp = fract(sp) - 0.5;
      float h = hash31(ip);
      float star = step(0.9935, h) * smoothstep(0.42, 0.0, length(fp));
      float tw = 0.65 + 0.35 * sin(uTime * 2.4 + h * 400.0);
      col += vec3(0.9, 0.95, 1.0) * star * tw * uStars * (0.4 + 1.6 * fract(h * 71.3)) * smoothstep(0.02, 0.35, d.y);
    }
  }

  // 구름 (하늘 평면에 투영)
  if (d.y > 0.004) {
    vec2 uv = d.xz / (d.y + 0.09);
    float far = length(uv);
    vec2 p = uv * 0.2 + uWindDir * uTime * 0.0028;
    float n = cloudNoise(p);
    float lo = mix(0.80, 0.16, uCloudCover);
    float dens = smoothstep(lo, lo + mix(0.20, 0.34, uCloudCover), n);
    if (dens > 0.001) {
      vec2 sd = normalize(uSunDir.xz + vec2(1e-4));
      float n2 = cloudNoise(p + sd * 0.035);
      float shade = clamp(0.5 + (n - n2) * 5.0, 0.0, 1.0);
      vec3 cc = mix(uCloudDark, uCloudLit, shade * (1.0 - dens * 0.45));
      cc += uSunTint * pow(cs, 9.0) * (1.0 - dens) * 0.55 * uHalo;
      cc += uMoonColor * pow(cm, 14.0) * (1.0 - dens) * 0.35 * uMoonGlow;
      float haze = exp(-far * 0.12);
      cc = mix(col, cc, mix(0.2, 1.0, haze));
      cloudA = dens * smoothstep(0.004, 0.11, d.y) * mix(0.6, 1.0, haze);
      col = mix(col, cc, cloudA);
    }
  }

  // 맑은 날에도 높이 떠 있는 옅은 새털구름
  if (d.y > 0.02) {
    vec2 uv2 = d.xz / (d.y + 0.25);
    float ci = texture2D(uNoise, uv2 * vec2(0.16, 0.05) + uWindDir * uTime * 0.0009 + 0.5).r;
    float ci2 = texture2D(uNoise, uv2 * vec2(0.5, 0.16) + 0.2).g;
    float cirrus = smoothstep(0.52, 0.8, ci * 0.7 + ci2 * 0.3) * smoothstep(0.02, 0.3, d.y) * (1.0 - cloudA) * 0.4;
    col = mix(col, uCloudLit * 0.9 + uSunTint * pow(cs, 6.0) * 0.3 * uHalo, cirrus);
  }

  if (uEnvPass < 0.5) {
    // 해
    float disc = smoothstep(0.99982, 0.99993, cs);
    col += uSunTint * disc * uSunDisc * (1.0 - cloudA * 0.96);
    col += uSunTint * pow(cs, 1200.0) * 0.8 * uHalo * (1.0 - cloudA * 0.8);
    // 달
    float md = smoothstep(0.99972, 0.99985, cm);
    vec3 mcol = uMoonColor * (0.75 + 0.25 * texture2D(uNoise, d.xy * 40.0).r);
    col = mix(col, mcol * 2.2, md * uMoonGlow * (1.0 - cloudA * 0.9));
    col += uMoonColor * pow(cm, 300.0) * 0.25 * uMoonGlow * (1.0 - cloudA * 0.6);
  }
  // 주변광으로 쓰일 때는 하늘의 파란 기를 조금 덜어 그늘이 과하게 파랗지 않게 한다
  if (uEnvPass > 0.5) col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), 0.38);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(ctx) {
    this.uniforms = {
      ...skyUniforms,
      uNoise: ctx.uniforms.uNoise,
      uTime: ctx.uniforms.uTime,
      uWindDir: ctx.uniforms.uWindDir,
      uCloudCover: { value: 0.2 },
      uStars: { value: 0 },
      uEnvPass: { value: 0 },
      uSunDisc: { value: 30 },
      uMoonGlow: { value: 0 },
      uCloudLit: { value: new THREE.Color(1, 1, 1) },
      uCloudDark: { value: new THREE.Color(0.5, 0.55, 0.65) },
      uMoonColor: { value: new THREE.Color(0.85, 0.9, 1.0) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    const geo = new THREE.SphereGeometry(1, 48, 32);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    ctx.scene.add(this.mesh);

    // 환경맵(IBL)용: 하늘만 있는 별도 장면
    this.envScene = new THREE.Scene();
    this.envMesh = new THREE.Mesh(geo, mat);
    this.envMesh.frustumCulled = false;
    this.envScene.add(this.envMesh);
    this.pmrem = new THREE.PMREMGenerator(ctx.renderer);
    this.envRT = null;
    this.envTimer = 1e9;
  }

  // 하늘을 주변광·반사광으로 쓰기 위해 주기적으로 환경맵을 다시 굽는다
  updateEnv(ctx, dt, interval) {
    this.envTimer += dt;
    if (this.envTimer < interval) return;
    this.envTimer = 0;
    this.uniforms.uEnvPass.value = 1;
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 10);
    this.uniforms.uEnvPass.value = 0;
    ctx.scene.environment = rt.texture;
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
  }
}
