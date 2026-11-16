// 날씨: 맑음/구름/흐림/가랑비/비/안개가 자연스럽게 이어지는 상태 기계 + 빗줄기 파티클.
import * as THREE from 'three';
import { damp, mulberry32 } from '../core/math.js';

export const WEATHER = {
  clear: { label: '맑음', icon: '☀', cloud: 0.14, over: 0.0, fog: 0.00016, rain: 0, wind: 0.3 },
  cloudy: { label: '구름 조금', icon: '⛅', cloud: 0.46, over: 0.15, fog: 0.00022, rain: 0, wind: 0.45 },
  overcast: { label: '흐림', icon: '☁', cloud: 0.88, over: 0.78, fog: 0.0005, rain: 0, wind: 0.5 },
  drizzle: { label: '가랑비', icon: '🌦', cloud: 0.95, over: 0.9, fog: 0.0011, rain: 0.35, wind: 0.5 },
  rain: { label: '비', icon: '🌧', cloud: 1.0, over: 1.0, fog: 0.0019, rain: 1.0, wind: 0.75 },
  fog: { label: '안개', icon: '🌫', cloud: 0.55, over: 0.55, fog: 0.0075, rain: 0, wind: 0.12 },
};

const NEXT = {
  clear: [['clear', 0.62], ['cloudy', 0.38]],
  cloudy: [['clear', 0.7], ['cloudy', 0.3]],
  overcast: [['cloudy', 0.6], ['clear', 0.4]],
  drizzle: [['cloudy', 1]],
  rain: [['cloudy', 1]],
  fog: [['clear', 1]],
};

export class Weather {
  constructor(ctx, seed = Date.now() & 0xffff) {
    this.ctx = ctx;
    this.rnd = mulberry32(seed);
    this.state = 'clear';
    this.timer = 330 + this.rnd() * 120; // 첫 변화까지(초)
    this.cur = { cloud: 0.14, over: 0, fog: 0.00016, rain: 0, wind: 0.3 };
    this.wet = 0;
    this.windAngle = 2.3;
    this.gust = 0; this.gustTarget = 0; this.gustTimer = 9; this.gustHold = 0;
    this.locked = false;
    this._buildRain();
  }

  set(name, instant = false) {
    if (!WEATHER[name]) return;
    this.state = name;
    this.timer = 170 + this.rnd() * 160;
    if (instant) { Object.assign(this.cur, { ...WEATHER[name] }); this.wet = WEATHER[name].rain > 0 ? 1 : 0; }
  }

  update(dt, hour, camera) {
    if (!this.locked) {
      this.timer -= dt;
      if (this.timer <= 0) {
        let opts = NEXT[this.state];
        // 안개는 새벽~아침에만
        if (!(hour > 4.5 && hour < 9)) opts = opts.filter((o) => o[0] !== 'fog');
        const sum = opts.reduce((a, o) => a + o[1], 0);
        let r = this.rnd() * sum, pick = opts[0][0];
        for (const [name, w] of opts) { r -= w; if (r <= 0) { pick = name; break; } }
        this.set(pick);
      }
    }
    const t = WEATHER[this.state], c = this.cur;
    c.cloud = damp(c.cloud, t.cloud, 0.045, dt);
    c.over = damp(c.over, t.over, 0.045, dt);
    c.fog = damp(c.fog, t.fog, 0.05, dt);
    c.rain = damp(c.rain, t.rain, c.rain < t.rain ? 0.05 : 0.09, dt);
    c.wind = damp(c.wind, t.wind, 0.05, dt);
    // 노면 젖음: 비가 오면 빨리 젖고 천천히 마른다
    if (c.rain > 0.05) this.wet = Math.min(1, this.wet + dt * 0.03 * (0.4 + c.rain));
    else this.wet = Math.max(0, this.wet - dt * 0.006);
    this.windAngle += dt * 0.004 * Math.sin(hour * 0.7 + 1.3);

    // 돌풍: 바람이 셀수록 자주, 세게 분다. 몇 초 동안 불다가 잦아든다.
    this.gustTimer -= dt;
    if (this.gustTimer <= 0 && this.gustHold <= 0) {
      this.gustTarget = (0.45 + 0.55 * this.rnd()) * (0.5 + c.wind);
      this.gustHold = 2.5 + this.rnd() * 3.5;
      this.gustTimer = (12 + this.rnd() * 26) * (1.3 - c.wind);
    }
    if (this.gustHold > 0) { this.gustHold -= dt; if (this.gustHold <= 0) this.gustTarget = 0; }
    this.gust = damp(this.gust, this.gustTarget, this.gustTarget > this.gust ? 1.1 : 0.45, dt);

    const u = this.ctx.uniforms;
    u.uGust.value = this.gust;
    u.uRain.value = c.rain;
    u.uWet.value = this.wet;
    u.uWindDir.value.set(Math.cos(this.windAngle), Math.sin(this.windAngle));
    u.uWind.value = c.wind;

    // 빗줄기
    this.rain.visible = c.rain > 0.02;
    if (this.rain.visible) {
      const ru = this.rain.material.uniforms;
      ru.uCam.value.copy(camera.position);
      ru.uAmount.value = c.rain;
      ru.uWindVec.value.set(Math.cos(this.windAngle) * c.wind * 5, Math.sin(this.windAngle) * c.wind * 5);
    }
  }

  _buildRain() {
    const N = 9000;
    const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 4);
    const rnd = mulberry32(5);
    for (let i = 0; i < N; i++) {
      const sx = rnd(), sy = rnd(), sz = rnd(), sr = rnd();
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        pos[j * 3 + 1] = k; // 0: 아래 끝, 1: 위 끝
        seed.set([sx, sy, sz, sr], j * 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: this.ctx.uniforms.uTime, uCam: { value: new THREE.Vector3() },
        uAmount: { value: 0 }, uWindVec: { value: new THREE.Vector2() },
        uColor: this.ctx.uniforms.uRainColor,
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uAmount; uniform vec3 uCam; uniform vec2 uWindVec;
        varying float vA;
        void main() {
          vec3 box = vec3(46.0, 30.0, 46.0);
          float speed = 17.0 + aSeed.w * 7.0;
          vec3 vel = vec3(uWindVec.x, -speed, uWindVec.y);
          vec3 p = aSeed.xyz * box + vel * uTime;
          p = mod(p - uCam, box) - box * 0.5 + uCam;
          p += normalize(vel) * -position.y * (0.55 + 0.5 * aSeed.w);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // 가랑비일 때는 일부 빗줄기만 보인다
          float vis = step(aSeed.w, uAmount * 1.05);
          vA = vis * (0.08 + 0.2 * position.y) * smoothstep(1.0, 4.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() { gl_FragColor = vec4(uColor, vA); }`,
    });
    this.rain = new THREE.LineSegments(g, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 20;
    this.rain.layers.set(1);
    this.ctx.scene.add(this.rain);
  }
}
