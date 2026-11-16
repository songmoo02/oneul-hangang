// 소리: 전부 Web Audio API로 그 자리에서 만들어 낸다(녹음 파일 없음).
// 환경음(물결·바람·낙엽·비·차·열차·사람들), 발소리, 다리 밑 울림, 버스킹 기타, 잔잔한 배경음악.
import { clamp, lerp, smoothstep } from '../core/math.js';
import { sampleField } from '../world/field.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ok = false;
    this.vol = { master: 0.8, music: 0.6, amb: 0.8 };
    this.layers = {};
    this._f = {};
    this.musicT = 0; this.melT = 0; this.chord = 0;
    this.guitarT = 0; this.gStep = 0;
    this.showT = 0;
  }

  // 반드시 사용자 클릭 안에서 호출
  start() {
    if (this.ok) { if (this.ac.state === 'suspended') this.ac.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      this.ac = ac;
      this.master = ac.createGain(); this.master.connect(ac.destination);
      this.ambBus = ac.createGain(); this.ambBus.connect(this.master);
      this.musicBus = ac.createGain(); this.musicBus.connect(this.master);
      this.sfxBus = ac.createGain(); this.sfxBus.connect(this.ambBus);
      // 다리 밑 울림
      this.rev = ac.createConvolver();
      const len = Math.floor(ac.sampleRate * 1.7), ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      this.rev.buffer = ir;
      this.revGain = ac.createGain(); this.revGain.gain.value = 0;
      this.sfxBus.connect(this.rev); this.rev.connect(this.revGain); this.revGain.connect(this.ambBus);
      // 잡음 원본
      const nl = ac.sampleRate * 2, nb = ac.createBuffer(1, nl, ac.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
      this.noise = nb;
      const layer = (name, type, freq, q, bus = this.ambBus) => {
        const src = ac.createBufferSource(); src.buffer = nb; src.loop = true; src.playbackRate.value = 0.7 + Math.random() * 0.6;
        const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
        const g = ac.createGain(); g.gain.value = 0;
        src.connect(fl); fl.connect(g); g.connect(bus); src.start();
        this.layers[name] = { fl, g };
      };
      layer('water', 'bandpass', 520, 0.6);
      layer('wind', 'bandpass', 380, 0.5);
      layer('leaves', 'highpass', 2600, 0.3);
      layer('rain', 'highpass', 1500, 0.2);
      layer('traffic', 'lowpass', 170, 0.4);
      layer('crowd', 'bandpass', 720, 1.1);
      layer('train', 'bandpass', 130, 0.8);
      layer('fountain', 'highpass', 900, 0.3);
      this._guitarBuffers();
      this.ok = true;
      this.applyVolumes();
    } catch { this.ok = false; }
  }

  applyVolumes() {
    if (!this.ok) return;
    const t = this.ac.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.amb, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
  }

  _set(name, gain, freq) {
    const l = this.layers[name], t = this.ac.currentTime;
    l.g.gain.setTargetAtTime(Math.max(0, gain), t, 0.25);
    if (freq) l.fl.frequency.setTargetAtTime(freq, t, 0.3);
  }

  // 짧은 잡음 소리(발소리 등)
  _burst(type, freq, q, dur, gain, bus = this.sfxBus, when = 0) {
    const ac = this.ac, t = ac.currentTime + when;
    const src = ac.createBufferSource(); src.buffer = this.noise;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(fl); fl.connect(g); g.connect(bus);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  _tone(freq, dur, gain, type = 'sine', bus = this.sfxBus, when = 0, attack = 0.005) {
    const ac = this.ac, t = ac.currentTime + when;
    const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  // 음높이가 미끄러지는 소리(짖는 소리, 휘파람 등)
  _sweep(f0, f1, dur, gain, type = 'sine', when = 0, bus = this.sfxBus) {
    const ac = this.ac, t = ac.currentTime + when;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  step(surface, runK) {
    if (!this.ok) return;
    const v = 0.06 + runK * 0.07;
    if (surface === 'grass') this._burst('lowpass', 900, 0.5, 0.11, v * 1.4);
    else if (surface === 'wood') { this._burst('bandpass', 420, 2.5, 0.09, v * 2.2); this._tone(140, 0.09, v * 0.6); }
    else if (surface === 'leaves') { this._burst('highpass', 3200, 0.4, 0.16, v * 1.3); this._burst('lowpass', 900, 0.5, 0.1, v); }
    else { this._burst('bandpass', 1700, 1.2, 0.05, v * 1.2); this._tone(95, 0.06, v * 0.5); }
  }

  sfx(name, k = 1, w = 0) {
    if (!this.ok) return;
    const B = this.sfxBus, R = Math.random;
    switch (name) {
      case 'hello': this._sweep(520, 780, 0.16, 0.05 * k, 'triangle', w); this._sweep(780, 660, 0.22, 0.05 * k, 'triangle', w + 0.17); return;
      case 'moto': this._burst('lowpass', 240, 2, 0.09, 0.07 * k); this._tone(92, 0.09, 0.04 * k, 'sawtooth'); return;
      case 'coo': this._sweep(300, 360, 0.22, 0.035 * k, 'sine', w); this._sweep(360, 280, 0.3, 0.035 * k, 'sine', w + 0.24); return;
      case 'vroom': { const M = this.sfxBus; this._sweep(70, 210, 0.7, 0.09 * k, 'sawtooth', 0, M); this._sweep(210, 95, 1.1, 0.07 * k, 'sawtooth', 0.7, M); this._burst('lowpass', 400, 0.6, 1.6, 0.08 * k, M); return; }
      case 'kiss': this._burst('bandpass', 2600, 4, 0.07, 0.09); this._sweep(900, 1700, 0.09, 0.03, 'sine', 0.05); return;
      case 'beep': this._tone(2050, 0.09, 0.05, 'square'); return;
      case 'chime': this._tone(988, 0.7, 0.07); this._tone(784, 0.9, 0.07, 'sine', B, 0.3); return;
      case 'ding': this._tone(1568, 0.7, 0.05); this._tone(2349, 0.5, 0.02); return;
      case 'click': this._burst('bandpass', 2400, 3, 0.03, 0.06); return;
      case 'tick': this._burst('bandpass', 3800, 6, 0.015, 0.03 * k); return;
      case 'bark': for (const d of [0, 0.19]) { this._sweep(560 + R() * 80, 300, 0.11, 0.09, 'sawtooth', d); this._burst('bandpass', 900, 1.5, 0.1, 0.05, B, d); } return;
      case 'meow': this._sweep(520, 880, 0.18, 0.06, 'triangle'); this._sweep(880, 470, 0.38, 0.06, 'triangle', 0.17); return;
      case 'purr': for (let i = 0; i < 26; i++) this._burst('lowpass', 170, 1, 0.032, 0.11, B, i * 0.043); return;
      case 'slurp': for (let i = 0; i < 3; i++) this._burst('bandpass', 700 + i * 500, 2.5, 0.14, 0.05, B, i * 0.1); return;
      case 'crunch': for (let i = 0; i < 4; i++) this._burst('highpass', 1800 + R() * 1500, 0.8, 0.045, 0.07, B, i * 0.09 + R() * 0.03); return;
      case 'gulp': for (const d of [0, 0.32]) this._sweep(330, 170, 0.13, 0.09, 'sine', d); return;
      case 'sniff': for (const d of [0, 0.42]) this._burst('highpass', 2600, 0.4, 0.26, 0.035, B, d); return;
      case 'splash': this._burst('bandpass', 1100, 0.5, 0.55, 0.09 * k); this._tone(240, 0.16, 0.05 * k); return;
      case 'horn': this._tone(155, 1.5, 0.06 * k, 'sawtooth', B, 0, 0.15); this._tone(196, 1.5, 0.05 * k, 'sawtooth', B, 0, 0.15); return;
      case 'whistle': this._sweep(700, 2300, 1.45, 0.022 * k, 'sine', w); this._burst('highpass', 3000, 0.3, 1.3, 0.012 * k, B, w); return;
      case 'boom': { // 불꽃: 묵직한 쿵 소리 뒤에 타닥거림
        const M = this.master;
        this._sweep(95, 32, 1.1, 0.75 * k, 'sine', w, M);
        this._burst('lowpass', 260, 0.5, 1.5, 0.6 * k, M, w);
        this._burst('bandpass', 900, 0.4, 0.5, 0.16 * k, M, w);
        for (let i = 0; i < 22; i++) this._burst('highpass', 2500 + R() * 3000, 0.6, 0.035, 0.06 * k * (1 - i / 26), B, w + 0.25 + R() * 1.7);
        return;
      }
      case 'cheer': this._burst('bandpass', 950, 0.7, 1.9, 0.07 * k, B, w); this._burst('bandpass', 1700, 0.9, 1.5, 0.04 * k, B, w + 0.15); for (let i = 0; i < 5; i++) this._sweep(700 + R() * 500, 1100 + R() * 600, 0.35, 0.012 * k, 'triangle', w + R() * 1.2); return;
      case 'chirp': { const f = 2600 + R() * 2000, n = 2 + Math.floor(R() * 4); for (let i = 0; i < n; i++) this._sweep(f, f * (1.15 + R() * 0.3), 0.07, 0.016 * k, 'sine', i * 0.11); return; }
      case 'cricket': for (let i = 0; i < 4; i++) this._tone(4300, 0.035, 0.009 * k, 'sine', B, i * 0.06); return;
      default:
    }
    if (name === 'bell') { this._tone(2250, 0.9, 0.05, 'sine'); this._tone(3380, 0.6, 0.03, 'sine'); this._tone(2250, 0.8, 0.04, 'sine', this.sfxBus, 0.22); }
    else if (name === 'plop') { this._tone(lerp(300, 520, k), 0.12, 0.07 * k, 'sine'); this._burst('bandpass', 1400, 0.8, 0.12, 0.05 * k); }
    else if (name === 'boil') { for (let i = 0; i < 12; i++) this._burst('bandpass', 900 + Math.random() * 900, 4, 0.12, 0.02, this.sfxBus, i * 0.35 + Math.random() * 0.2); }
    else if (name === 'eat') { for (let i = 0; i < 4; i++) this._burst('highpass', 2400, 0.6, 0.18, 0.025, this.sfxBus, 0.6 + i * 2.6); }
    else if (name === 'flap') { for (let i = 0; i < 9; i++) this._burst('bandpass', 700 + Math.random() * 500, 1.2, 0.05, 0.05, this.sfxBus, i * 0.07 + Math.random() * 0.04); }
    else if (name === 'shutter') { this._burst('highpass', 3000, 0.5, 0.03, 0.12); this._burst('bandpass', 1800, 2, 0.05, 0.1, this.sfxBus, 0.07); }
    else if (name === 'whoosh') this._burst('bandpass', 600, 0.6, 0.5, 0.08);
  }

  // 기타 음(Karplus-Strong)을 미리 만들어 둔다
  _guitarBuffers() {
    const ac = this.ac, sr = ac.sampleRate;
    this.gbuf = {};
    for (const n of [45, 48, 52, 53, 55, 57, 60, 64, 65, 67, 69, 72]) {
      const N = Math.round(sr / NOTE(n)), len = Math.floor(sr * 1.5);
      const buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
      const ring = new Float32Array(N);
      for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      let k = 0;
      for (let i = 0; i < len; i++) { const a = ring[k], b = ring[(k + 1) % N]; d[i] = a; ring[k] = (a + b) * 0.497; k = (k + 1) % N; }
      this.gbuf[n] = buf;
    }
    this.guitarBus = ac.createGain(); this.guitarBus.gain.value = 0; this.guitarBus.connect(this.ambBus);
  }

  _pluck(n, when, gain) {
    const ac = this.ac, src = ac.createBufferSource(); src.buffer = this.gbuf[n];
    const g = ac.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this.guitarBus); src.start(ac.currentTime + when);
  }

  // 매 프레임: 상황에 맞춰 각 소리의 크기를 정한다
  update(dt, game) {
    if (!this.ok) return;
    const ps = game.player.state, env = game.env, w = env.weather, u = game.ctx.uniforms, t = u.uTime.value;
    const f = sampleField(ps.x, ps.z, this._f);
    const nearWater = ps.surface === 'boat' ? 1 : 1 - smoothstep(4, 45, Math.abs(f.d));
    const wind = w.cur.wind + w.gust * 0.9;
    this._set('water', (0.02 + 0.07 * nearWater) * (0.75 + 0.25 * Math.sin(t * 0.7) + 0.15 * Math.sin(t * 1.9)));
    this._set('wind', 0.012 + 0.07 * wind * wind + 0.05 * w.gust, 260 + 520 * wind);
    const canopy = game.grassMap ? game.grassMap.canopy(ps.x, ps.z) : 0;
    this._set('leaves', (0.006 + 0.05 * w.gust + 0.012 * w.cur.wind) * (0.35 + 0.65 * canopy));
    this._set('rain', 0.1 * w.cur.rain);
    // 차 소리: 다리·강변도로에 가까울수록
    let road = clamp(1 - (f.w + 20 - f.d) / 120, 0, 1);
    const br = game.ctx.nearBridge(ps.x, ps.z, 40);
    if (br && br.type !== 'truss') road = Math.max(road, 0.8);
    const under = !!(br && ps.surface === 'ground' && game.ctx.nearBridge(ps.x, ps.z, 0));
    const nightQuiet = lerp(1, 0.55, env.night);
    this._set('traffic', (0.05 + 0.16 * road) * nightQuiet);
    this._set('crowd', clamp(game.npcs.nearCount / 14, 0, 1) * 0.045 * (0.7 + 0.3 * Math.sin(t * 0.9 + Math.sin(t * 0.31) * 2)), 600 + 220 * Math.sin(t * 0.23));
    const tn = game.traffic.trainNear;
    const tk = clamp(1 - tn / 150, 0, 1);
    this._set('train', tk * tk * 0.5 * (0.8 + 0.2 * Math.sin(t * 19)), 110 + 60 * tk);
    const fd = Math.hypot(game.fountain.x - ps.x, game.fountain.z - ps.z);
    const fk = game.fountain.active * clamp(1 - fd / 260, 0, 1);
    this._set('fountain', 0.09 * fk);
    this.revGain.gain.setTargetAtTime(under ? 0.75 : 0.06, this.ac.currentTime, 0.3);

    // 사소한 소리들: 낮의 새소리, 밤의 풀벌레, 따릉이 체인, 오리배 페달, 한강버스 뱃고동
    const pl = game.player;
    this.chirpT = (this.chirpT ?? 2) - dt;
    if (this.chirpT <= 0) {
      this.chirpT = 1.2 + Math.random() * 5;
      if (env.night < 0.4 && w.cur.rain < 0.2) this.sfx('chirp', 0.5 + canopy);
    }
    this.cricketT = (this.cricketT ?? 1) - dt;
    if (this.cricketT <= 0) { this.cricketT = 0.55 + Math.random() * 0.5; if (env.night > 0.6 && w.cur.rain < 0.2 && nearWater < 0.9) this.sfx('cricket', 1); }
    if (pl.mode === 'bike' && ps.speed > 1) { this.tickT = (this.tickT ?? 0) - dt * ps.speed; if (this.tickT <= 0) { this.tickT = 1.1; this.sfx('tick', 1); } }
    if (pl.mode === 'duck' && ps.speed > 0.4) { this.pedalT = (this.pedalT ?? 0) - dt * (0.6 + ps.speed * 0.25); if (this.pedalT <= 0) { this.pedalT = 0.5; this.sfx('plop', 0.35); } }
    for (const b of game.boats.buses) {
      if (b._st !== undefined && b._st === 'dock' && b.state === 'sail') { const d = Math.hypot(b.x - ps.x, b.z - ps.z); if (d < 320) this.sfx('horn', clamp(1.2 - d / 320, 0.15, 1)); }
      b._st = b.state;
    }

    // 버스킹 기타: 가까이 갈수록 크게 들린다
    let bk = 0;
    if (game.npcs.busking) for (const b of game.npcs.buskSpots) bk = Math.max(bk, clamp(1 - Math.hypot(b.x - ps.x, b.z - ps.z) / 42, 0, 1));
    this.guitarBus.gain.setTargetAtTime(bk * bk * 0.9, this.ac.currentTime, 0.3);
    if (bk > 0.01) {
      this.guitarT -= dt;
      if (this.guitarT <= 0) {
        this.guitarT += 0.3;
        const prog = [[45, 52, 57, 60, 64], [41 + 12, 57, 60, 65, 69], [48, 55, 60, 64, 67], [43 + 12, 55, 59 + 1, 67, 72]];
        const ch = prog[Math.floor(this.gStep / 8) % 4], pat = [0, 2, 3, 4, 3, 2, 3, 1];
        let n = ch[pat[this.gStep % 8]];
        if (!this.gbuf[n]) n = [45, 48, 52, 53, 55, 57, 60, 64, 65, 67, 69, 72].reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
        this._pluck(n, 0.02, this.gStep % 8 === 0 ? 0.3 : 0.2);
        this.gStep++;
      }
    } else this.guitarT = 0;

    // 배경음악: 통통 튀는 시티팝풍(112BPM). 킥·박수·하이햇 위에 베이스와 화음, 5음계 선율이 얹힌다.
    // 버스킹·분수 쇼가 가까우면 줄인다.
    const duck = 1 - 0.8 * Math.max(bk, fk);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5 * duck, this.ac.currentTime, 0.5);
    const STEP = 60 / 112 / 2, MB = this.musicBus;
    this.musicT -= dt;
    while (this.musicT <= 0) {
      this.musicT += STEP;
      const st = this.mStep = (this.mStep ?? -1) + 1, i8 = st % 8, bar = Math.floor(st / 8);
      const roots = [48, 43, 45, 41], thirds = [4, 4, 3, 4], root = roots[bar % 4], third = thirds[bar % 4];
      const wn = 0.03;
      if (i8 === 0 || i8 === 4 || (i8 === 7 && bar % 2 === 1)) this._sweep(125, 46, 0.2, 0.24, 'sine', wn, MB); // 킥
      if (i8 === 2 || i8 === 6) { this._burst('bandpass', 1900, 0.8, 0.11, 0.07, MB, wn); this._burst('highpass', 4000, 0.5, 0.07, 0.03, MB, wn + 0.012); } // 박수
      this._burst('highpass', 7500, 0.5, i8 % 2 ? 0.05 : 0.025, i8 % 2 ? 0.022 : 0.012, MB, wn); // 하이햇
      if ([0, 3, 4, 6].includes(i8)) this._tone(NOTE(root - 12 + (i8 === 6 ? 7 : 0)), 0.24, 0.1, 'triangle', MB, wn, 0.008); // 베이스
      if (i8 === 1 || i8 === 5) for (const d of [0, third, 7]) this._tone(NOTE(root + 12 + d), 0.2, 0.022, 'triangle', MB, wn, 0.006); // 화음 찌르기
      if (i8 === 0) for (const d of [0, third, 7, 12]) { this._tone(NOTE(root + 12 + d), STEP * 8.2, 0.012, 'sine', MB, wn, 0.4); }
      // 선율: 4마디마다 새 악구를 만들고 두 번 되풀이한다
      if (st % 32 === 0 || !this.mel) {
        const sc = [60, 62, 64, 67, 69, 72, 74, 76];
        let k = 2 + Math.floor(Math.random() * 4);
        this.mel = Array.from({ length: 16 }, (_, j) => { if (Math.random() < (j % 2 ? 0.45 : 0.25)) return -1; k = clamp(k + Math.floor(Math.random() * 5) - 2, 0, sc.length - 1); return sc[k]; });
      }
      const n = this.mel[st % 16];
      if (n > 0) { this._tone(NOTE(n + 12), 0.26, 0.04, 'triangle', MB, wn, 0.008); this._tone(NOTE(n + 24), 0.14, 0.012, 'sine', MB, wn, 0.005); }
    }
    // 분수 쇼 음악: 밝은 아르페지오
    if (fk > 0.02) {
      this.showT -= dt;
      if (this.showT <= 0) {
        this.showT = 0.24;
        const sc = [60, 64, 67, 72, 76, 79, 84, 79, 76, 72, 67, 64];
        const n = sc[Math.floor(t / 0.24) % sc.length] + (Math.floor(t / 5.76) % 2 ? 5 : 0);
        this._tone(NOTE(n), 0.9, 0.06 * fk, 'triangle', this.ambBus, 0, 0.01);
      }
    }
  }
}
