// 하늘·물·안개가 공유하는 하늘색 함수. 유니폼 객체도 한 벌을 공유해 항상 같은 색을 쓴다.
import * as THREE from 'three';

export const skyUniforms = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
  uZenith: { value: new THREE.Color(0.1, 0.3, 0.7) },
  uHorizon: { value: new THREE.Color(0.6, 0.75, 0.9) },
  uHorizonSun: { value: new THREE.Color(1, 0.9, 0.8) },
  uSunTint: { value: new THREE.Color(1, 0.95, 0.85) },
  uGroundCol: { value: new THREE.Color(0.3, 0.3, 0.3) },
  uGlow: { value: 0.3 },
  uHalo: { value: 1.0 },
};

export const SKY_COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHorizonSun;
uniform vec3 uSunTint;
uniform vec3 uGroundCol;
uniform float uGlow;
uniform float uHalo;

// 구름·해 원반을 뺀 하늘 바탕색
vec3 skyGradient(vec3 d) {
  float y = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uZenith, uHorizon, pow(1.0 - y, 4.0));
  vec2 sd = normalize(uSunDir.xz + vec2(1e-4));
  vec2 vd = normalize(d.xz + vec2(1e-4));
  float az = dot(sd, vd) * 0.5 + 0.5;
  float band = pow(1.0 - y, 9.0);
  col = mix(col, uHorizonSun, clamp(pow(az, 2.5) * band * uGlow, 0.0, 1.0));
  col += uHorizonSun * pow(az, 6.0) * pow(1.0 - y, 3.0) * uGlow * 0.22;
  float c = max(dot(d, uSunDir), 0.0);
  col += uSunTint * (pow(c, 8.0) * 0.035 + pow(c, 64.0) * 0.12) * uHalo;
  if (d.y < 0.0) col = mix(col, uGroundCol, smoothstep(0.0, -0.15, d.y));
  return col;
}
`;
