// 시간(하루 약 30분)·태양과 달·하늘색·조명·안개를 한곳에서 계산해 장면 전체에 전달한다.
import * as THREE from 'three';
import { skyUniforms } from './skyglsl.js';
import { Sky } from './sky.js';
import { Weather, WEATHER } from './weather.js';
import { clamp, lerp, smoothstep, damp } from '../core/math.js';

const DEG = Math.PI / 180;
const LAT = 37.52 * DEG;
const DECL = -9.0 * DEG; // 10월 중순 태양 적위
const NOON = 12.3; // 서울의 남중 시각(시)
export const DAY_SECONDS = 1800; // 게임 속 하루 = 현실 30분

const C = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
// 태양 고도(도)에 따른 하늘·빛 색 (위에서 아래로)
const KEYS = [
  { el: 45, zen: C(0x2f6fd0), hor: C(0xb4d3f2), hsun: C(0xfff2dc), glow: 0.2, sun: C(0xfff4e2), sunI: 6.0, cLit: C(0xffffff), cDark: C(0x93a0b5) },
  { el: 18, zen: C(0x3470cc), hor: C(0xbcd6ee), hsun: C(0xffe9c4), glow: 0.35, sun: C(0xffeccf), sunI: 5.6, cLit: C(0xfff6e8), cDark: C(0x8b97ae) },
  { el: 8, zen: C(0x3e6ab8), hor: C(0xd8cdb6), hsun: C(0xffc880), glow: 0.7, sun: C(0xffcf96), sunI: 4.8, cLit: C(0xffe2ba), cDark: C(0x7c7f9a) },
  { el: 3, zen: C(0x3b5797), hor: C(0xdba27e), hsun: C(0xff8a3a), glow: 0.95, sun: C(0xff9c55), sunI: 3.6, cLit: C(0xffab6a), cDark: C(0x62597a) },
  { el: 0, zen: C(0x33487f), hor: C(0xc98a7c), hsun: C(0xff6e30), glow: 1.0, sun: C(0xff7a3a), sunI: 2.0, cLit: C(0xff8a62), cDark: C(0x4a4468) },
  { el: -3, zen: C(0x25346b), hor: C(0x9a6c7c), hsun: C(0xf0603a), glow: 0.95, sun: C(0xff6a3a), sunI: 0.0, cLit: C(0xe07a72), cDark: C(0x343258) },
  { el: -7, zen: C(0x131d48), hor: C(0x453f6a), hsun: C(0xa8503f), glow: 0.7, sun: C(0xff6a3a), sunI: 0.0, cLit: C(0x5a4e72), cDark: C(0x1b1c36) },
  { el: -12, zen: C(0x0b1230), hor: C(0x2a2942), hsun: C(0x4a3448), glow: 0.35, sun: C(0x000000), sunI: 0.0, cLit: C(0x2a2b44), cDark: C(0x0e1020) },
  { el: -20, zen: C(0x0a1028), hor: C(0x3a3238), hsun: C(0x3a3238), glow: 0.0, sun: C(0x000000), sunI: 0.0, cLit: C(0x4a4038), cDark: C(0x1a181c) },
];

const MORNING_TINT = new THREE.Color(0xff9a8a);
const MORNING_COOL = new THREE.Color(0x8fa6cc);
const MORNING_ZEN = new THREE.Color(0x2a4a8a);

function sunPosition(hour, decl, out) {
  const h = (hour - NOON) * 15 * DEG;
  const sinEl = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(h);
  const el = Math.asin(clamp(sinEl, -1, 1));
  let cosAz = (Math.sin(decl) - sinEl * Math.sin(LAT)) / (Math.cos(el) * Math.cos(LAT) + 1e-9);
  let az = Math.acos(clamp(cosAz, -1, 1)); // 북에서 시계방향
  if (Math.sin(h) > 0) az = Math.PI * 2 - az;
  // 동 = +x, 북 = -z
  out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  return el / DEG;
}

export class Environment {
  constructor(ctx) {
    this.ctx = ctx;
    this.hour = 16.35;
    this.day = 0; this.startDow = new Date().getDay(); // 시작 요일은 오늘 요일
    this.timeScale = 1;
    this.paused = false;
    this.sky = new Sky(ctx);
    this.weather = new Weather(ctx);
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.sunEl = 0;
    this.night = 0;

    this.key = new THREE.DirectionalLight(0xffffff, 3);
    this.key.castShadow = true;
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.06;
    ctx.scene.add(this.key, this.key.target);
    this.hemi = new THREE.HemisphereLight(0x8fb0ff, 0x4a4438, 0.2);
    ctx.scene.add(this.hemi);

    this._c = { zen: new THREE.Color(), hor: new THREE.Color(), hsun: new THREE.Color(), sun: new THREE.Color(), cLit: new THREE.Color(), cDark: new THREE.Color(), g: new THREE.Color() };
    this._right = new THREE.Vector3(); this._up = new THREE.Vector3(); this._f = new THREE.Vector3();
    this.shadowRange = 110;
    this.envInterval = 4;
  }

  setQuality(q) {
    this.shadowRange = q.shadowRange;
    this.envInterval = q.envEvery;
    const s = this.key.shadow;
    if (s.mapSize.x !== q.shadow) {
      s.mapSize.set(q.shadow, q.shadow);
      if (s.map) { s.map.dispose(); s.map = null; }
    }
    const cam = s.camera;
    cam.left = -q.shadowRange; cam.right = q.shadowRange; cam.top = q.shadowRange; cam.bottom = -q.shadowRange;
    cam.near = 1; cam.far = 620;
    cam.updateProjectionMatrix();
    this.sky.envTimer = 1e9;
  }

  // 요일(0 일요일). 일요일에는 무지개가 뜬다
  get dow() { return (this.startDow + this.day) % 7; }
  get dowText() { return '일월화수목금토'[this.dow] + '요일'; }

  clockText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  phaseText() {
    const h = this.hour;
    if (h < 5.3) return '깊은 밤';
    if (h < 6.9) return '새벽';
    if (h < 11) return '아침';
    if (h < 16.6) return '오후';
    if (h < 18.4) return '노을';
    if (h < 19.4) return '초저녁';
    return '밤';
  }

  update(dt, focus, camera) {
    // ── 시간 진행 (한밤은 조금 빨리 지나간다)
    if (!this.paused) {
      const nightFast = 1 + 1.4 * (smoothstep(23.2, 24, this.hour) + (1 - smoothstep(4.2, 5.0, this.hour)));
      const nh = this.hour + (dt * 24 / DAY_SECONDS) * this.timeScale * nightFast;
      if (nh >= 24) this.day++; // 자정을 넘기면 다음 날(요일이 바뀐다)
      this.hour = nh % 24;
    }
    const w = this.weather;
    w.update(dt, this.hour, camera);
    const wc = w.cur;

    // ── 해와 달
    const el = sunPosition(this.hour, DECL, this.sunDir);
    const mEl = sunPosition((this.hour + 12 + 2.2) % 24, 13 * DEG, this.moonDir);
    this.sunEl = el;
    const night = smoothstep(3, -5, el);
    this.night = night;

    // ── 팔레트 보간
    const c = this._c;
    let a = KEYS[0], b = KEYS[0], t = 0;
    if (el <= KEYS[KEYS.length - 1].el) a = b = KEYS[KEYS.length - 1];
    else if (el < KEYS[0].el) {
      for (let i = 0; i < KEYS.length - 1; i++) {
        if (el <= KEYS[i].el && el >= KEYS[i + 1].el) { a = KEYS[i]; b = KEYS[i + 1]; t = (KEYS[i].el - el) / (KEYS[i].el - KEYS[i + 1].el); break; }
      }
    }
    c.zen.lerpColors(a.zen, b.zen, t); c.hor.lerpColors(a.hor, b.hor, t); c.hsun.lerpColors(a.hsun, b.hsun, t);
    c.sun.lerpColors(a.sun, b.sun, t); c.cLit.lerpColors(a.cLit, b.cLit, t); c.cDark.lerpColors(a.cDark, b.cDark, t);
    let glow = lerp(a.glow, b.glow, t), sunI = lerp(a.sunI, b.sunI, t);
    // 아침 노을은 저녁보다 살짝 분홍빛
    if (this.hour < 12 && el < 12) {
      const k = smoothstep(12, 2, el);
      c.hsun.lerp(MORNING_TINT, 0.25 * k);
      c.hor.lerp(MORNING_COOL, 0.38 * k);
      c.zen.lerp(MORNING_ZEN, 0.3 * k);
    }

    // ── 날씨 반영: 흐릴수록 회색, 해는 약하게
    const o = wc.over;
    const lum = (col) => 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
    const grey = (col, k) => { const l = lum(col); c.g.setRGB(l * 0.86, l * 0.9, l * 0.97).multiplyScalar(k); return c.g; };
    const dim = 1 - 0.28 * wc.rain;
    c.zen.lerp(grey(c.hor, 0.62 * dim), o * 0.92);
    c.hor.lerp(grey(c.hor, 0.9 * dim), o * 0.85);
    c.hsun.lerp(grey(c.hor, 1.0), o * 0.9);
    c.cLit.lerp(grey(c.cLit, 0.78 * dim), o * 0.85);
    c.cDark.lerp(grey(c.cDark, 0.8 * dim), o * 0.7);
    glow *= 1 - o * 0.85;
    const sunThrough = (1 - o * 0.93) * (1 - wc.fog * 60 > 0 ? Math.max(0.25, 1 - wc.fog * 90) : 0.25);
    sunI *= sunThrough;

    // ── 하늘 유니폼
    const SKY_GAIN = 0.62;
    const su = skyUniforms, sk = this.sky.uniforms;
    su.uSunDir.value.copy(this.sunDir);
    su.uMoonDir.value.copy(this.moonDir);
    su.uZenith.value.copy(c.zen).multiplyScalar(SKY_GAIN);
    su.uHorizon.value.copy(c.hor).multiplyScalar(SKY_GAIN);
    su.uHorizonSun.value.copy(c.hsun).multiplyScalar(SKY_GAIN * 1.15);
    su.uSunTint.value.copy(c.sun);
    su.uGlow.value = glow;
    su.uHalo.value = smoothstep(-6, 2, el) * (1 - o * 0.8) * 1.2;

    sk.uCloudCover.value = wc.cloud;
    sk.uCloudLit.value.copy(c.cLit).multiplyScalar(SKY_GAIN * 1.1);
    sk.uCloudDark.value.copy(c.cDark).multiplyScalar(SKY_GAIN * 0.9);
    sk.uStars.value = smoothstep(-5, -13, el) * (1 - wc.cloud * 0.85) * 0.5;
    sk.uSunDisc.value = 42 * smoothstep(-1.2, 1.0, el) * (1 - o * 0.9);
    const moonUp = smoothstep(-2, 6, mEl);
    sk.uMoonGlow.value = night * moonUp * (1 - o * 0.7);

    // ── 주광(해 또는 달) 하나로 그림자를 만든다
    const u = this.ctx.uniforms;
    const useMoon = el < -4;
    const dir = useMoon ? this.moonDir : this.sunDir;
    let keyI, shadowI;
    if (!useMoon) {
      keyI = sunI * smoothstep(-2.5, 1.5, el);
      this.key.color.copy(c.sun);
      shadowI = smoothstep(0.5, 7, el);
    } else {
      keyI = 0.16 * smoothstep(-4, -9, el) * moonUp * (1 - o * 0.8);
      this.key.color.setRGB(0.62, 0.72, 1.0);
      shadowI = 0.7;
    }
    this.key.intensity = keyI;
    this.key.shadow.intensity = shadowI;
    this.key.castShadow = keyI > 0.02 && dir.y > 0.03;
    this._placeShadow(focus, dir);
    u.uKeyDir.value.copy(dir);
    u.uKeyColor.value.copy(this.key.color).multiplyScalar(keyI);

    // 땅에서 튀어 오르는 빛(환경맵 아래쪽): 햇빛을 받은 지면색 + 하늘빛
    const bounce = (keyI * Math.max(dir.y, 0)) / Math.PI;
    su.uGroundCol.value.setRGB(0.26, 0.24, 0.19).multiply(this.key.color).multiplyScalar(bounce)
      .add(c.g.copy(c.hor).multiplyScalar(SKY_GAIN * 0.22));
    // 하늘이 어두운 밤에는 도시 불빛이 만드는 은은한 주변광을 더한다
    this.hemi.color.setRGB(0.36, 0.42, 0.66);
    this.hemi.groundColor.setRGB(0.3, 0.25, 0.2);
    this.hemi.intensity = lerp(0.03, 0.3, night);
    this.ctx.scene.environmentIntensity = lerp(1.0, 1.5, night);

    // ── 물·안개·조명 관련 공용 유니폼
    const water = this.ctx.water;
    if (water) {
      water.uniforms.uAmbient.value.copy(c.zen).lerp(c.hor, 0.55).multiplyScalar(SKY_GAIN * 0.85 + night * 0.6);
      water.uniforms.uChop.value = 0.3 + 0.55 * wc.wind + 0.22 * w.gust;
      water.uniforms.uGlint.value = (useMoon ? 3.0 : 1.0) * (1 - o * 0.7);
    }
    u.uNightK.value = night * 1.1;
    u.uAmbientCol.value.copy(c.zen).lerp(c.hor, 0.6).multiplyScalar(SKY_GAIN * 0.75).addScalar(0.012 + 0.02 * night);
    u.uFoamCol.value.copy(u.uAmbientCol.value).multiplyScalar(2.0).add(c.g.copy(this.key.color).multiplyScalar(keyI * 0.16));
    u.uLampOn.value = clamp((3.6 - el) / 4.2, 0, 1) * 1.12;
    u.uWinLit.value = windowLit(this.hour);
    u.uFogDensity.value = wc.fog;
    // 아침 물안개: 해 뜨기 전후, 비가 없을 때 수면 가까이에 낮게 깔린다
    const mistTime = smoothstep(4.6, 6.2, this.hour) * (1 - smoothstep(8.2, 9.6, this.hour));
    u.uMist.value = mistTime * (1 - wc.rain) * (0.55 + 0.45 * (1 - wc.wind));
    // 해가 낮아질수록 노출을 올려 사진처럼 밝기를 맞춘다
    u.uExposure.value = lerp(1.0 + 0.75 * smoothstep(22, 0, el), 1.3, night) * (1 + 0.25 * o * (1 - night));
    u.uGodRays.value = smoothstep(-3, 2, el) * (1 - smoothstep(14, 30, el)) * (1 - o * 0.9) * (0.55 + 0.6 * wc.cloud);
    u.uRainColor.value.copy(c.hor).multiplyScalar(1.3).addScalar(0.08 + night * 0.1);
    for (const nm of this.ctx.nightMaterials) nm.mat.emissiveIntensity = (nm.min || 0) + (nm.max - (nm.min || 0)) * night;
    for (const m of this.ctx.wetMaterials) m.roughness = lerp(0.92, 0.35, w.wet);

    this.sky.updateEnv(this.ctx, dt, this.envInterval);
  }

  // 그림자 카메라를 플레이어 주변에 놓고, 텍셀 단위로 맞춰 떨림을 줄인다
  _placeShadow(focus, dir) {
    const s = this.key.shadow;
    const right = this._right.set(0, 1, 0).cross(dir).normalize();
    const up = this._up.copy(dir).cross(right).normalize();
    const texel = (this.shadowRange * 2) / s.mapSize.x;
    const fx = Math.round(focus.dot(right) / texel) * texel;
    const fy = Math.round(focus.dot(up) / texel) * texel;
    const fz = focus.dot(dir);
    const f = this._f.set(0, 0, 0).addScaledVector(right, fx).addScaledVector(up, fy).addScaledVector(dir, fz);
    this.key.target.position.copy(f);
    this.key.position.copy(f).addScaledVector(dir, 300);
    this.key.target.updateMatrixWorld();
  }
}

// 시간대별 건물 창문 점등 비율
function windowLit(h) {
  if (h >= 17.3 && h < 19) return lerp(0.05, 0.62, (h - 17.3) / 1.7);
  if (h >= 19 && h < 22.5) return 0.62;
  if (h >= 22.5) return lerp(0.62, 0.3, (h - 22.5) / 1.5);
  if (h < 1.5) return lerp(0.3, 0.1, h / 1.5);
  if (h < 5) return 0.1;
  if (h < 7.6) return lerp(0.1, 0.24, (h - 5) / 2.6) * (1 - smoothstep(6.8, 7.6, h));
  return 0.04;
}

export { WEATHER };
