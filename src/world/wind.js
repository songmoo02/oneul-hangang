// 통합 바람: 방향·세기·돌풍을 유니폼 한 벌로 두고, 풀·억새·나무·낙엽·깃발·수면이 모두 같은 함수를 쓴다.
// 돌풍은 바람 방향으로 흘러가는 노이즈 무늬라서, 풀밭 위로 "파도처럼" 번져 지나간다.

export const WIND_GLSL = /* glsl */ `
uniform sampler2D uNoise;
uniform vec2 uWindDir;
uniform float uWind, uGust, uTime;
// 위치 p(월드 xz)에서의 바람 세기 (잔잔할 때 0.1 안팎, 돌풍 때 1.5 이상)
float windAt(vec2 p) {
  float front = texture2D(uNoise, p * 0.006 - uWindDir * uTime * 0.035).r;
  float ripple = texture2D(uNoise, p * 0.021 - uWindDir * uTime * 0.09).g;
  float gust = smoothstep(0.38, 0.72, front);
  return uWind * (0.3 + 0.7 * ripple) + (uGust * 1.4 + uWind * 0.45) * gust;
}
`;

// 지나간 자리(풀이 눌리고 낙엽이 흩날리는 곳)를 셰이더에 전달하는 고리 버퍼
export const TRAIL_N = 12;
export const TRAIL_GLSL = /* glsl */ `
uniform vec4 uTrail[${TRAIL_N}]; // xy: 위치(xz), z: 지나간 시각, w: 세기
float trailPress(vec2 p, out vec2 away) {
  float m = 0.0;
  away = vec2(0.0);
  for (int i = 0; i < ${TRAIL_N}; i++) {
    vec2 dv = p - uTrail[i].xy;
    float d = length(dv);
    float a = (1.0 - smoothstep(0.25, 1.05, d)) * clamp(1.0 - (uTime - uTrail[i].z) / 3.5, 0.0, 1.0) * uTrail[i].w;
    if (a > m) { m = a; away = dv / max(d, 0.05); }
  }
  return m;
}
`;

export class Trail {
  constructor(uniform) {
    this.u = uniform.value;
    this.i = 0;
    this.lx = 1e9; this.lz = 1e9;
  }

  // 0.7유닛 이동할 때마다 한 점씩 기록
  mark(x, z, time, strength = 1) {
    if (Math.hypot(x - this.lx, z - this.lz) < 0.7) return;
    this.lx = x; this.lz = z;
    this.u[this.i].set(x, z, time, strength);
    this.i = (this.i + 1) % TRAIL_N;
  }
}
