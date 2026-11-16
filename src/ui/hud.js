// 화면 UI: 시계·날씨·현재 위치, 미니맵, 메뉴. 풍경을 가리지 않도록 최소한으로 둔다.
import { sampleField, BRIDGE_AXES, PLAZA_POINTS, ZONE, bankOffset } from '../world/field.js';
import { toWorld } from '../world/geo.js';
import { WEATHER } from '../sky/weather.js';
import { QUALITY } from '../config.js';

const MAP = { x0: -1750, x1: 1950, z0: -1010, z1: 960, scale: 0.25 }; // px/유닛

const PLACES_N = [[126.9275, '망원·서강 강변'], [126.9500, '마포 강변'], [126.9610, '용산 강변'], [126.9940, '이촌한강공원'], [999, '서빙고 강변']];
const PLACES_S = [[126.9445, '여의도한강공원'], [126.9810, '노량진·흑석 강변'], [999, '반포한강공원']];
const lonToX = (lon) => toWorld(0, lon).x;

export function placeName(player) {
  const s = player.state;
  if (s.surface === 'strip' && player.lastStrip) {
    const tag = player.lastStrip.tag.split('-')[0];
    if (tag === 'jamsu') return '잠수교';
    const b = BRIDGE_AXES.find((a) => a.id === tag);
    if (b) return b.def.name;
  }
  const f = sampleField(s.x, s.z, {});
  if (f.zone === ZONE.NODEUL) return '노들섬';
  if (f.zone === ZONE.SEORAE) return '서래섬';
  const list = f.zone === ZONE.N ? PLACES_N : PLACES_S;
  for (const [lon, name] of list) if (lon > 900 || s.x < lonToX(lon)) return name;
  return '';
}

export class HUD {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = { clock: $('clock'), phase: $('phase'), weather: $('weather'), place: $('place'), toast: $('toast'), hint: $('hint'), menu: $('menu'), mini: $('minimap'), map: $('bigmap'), fps: $('fps'), prompt: $('prompt'), caption: $('caption'), places: $('places') };
    this.capT = 0;
    this.pois = [];
    this.mini = this.el.mini.getContext('2d');
    this.base = null;
    this.lastPlace = '';
    this.toastT = 0;
    this.acc = 0;
    this.bigOpen = false;
    this._buildMenu();
    setTimeout(() => this.el.hint.classList.add('fade'), 14000);
  }

  buildMap() {
    const w = Math.round((MAP.x1 - MAP.x0) * MAP.scale), h = Math.round((MAP.z1 - MAP.z0) * MAP.scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data, f = {};
    const cell = 2;
    for (let j = 0; j < h; j += cell) {
      for (let i = 0; i < w; i += cell) {
        const x = MAP.x0 + (i + 1) / MAP.scale, z = MAP.z0 + (j + 1) / MAP.scale;
        sampleField(x, z, f);
        let r, gg, b;
        if (f.d < 0) { r = 150; gg = 190; b = 214; }
        else if (f.zone > 1) { r = 176; gg = 208; b = 150; if (f.zone === ZONE.NODEUL && f.d > 5 && f.d < 9.6) { r = 236; gg = 228; b = 210; } }
        else if (f.d < f.w) { r = 190; gg = 214; b = 160; if (f.d > 5 && f.d < 10) { r = 240; gg = 233; b = 216; } }
        else if (f.d < f.w + 38) { r = 214; gg = 208; b = 196; }
        else { r = 232; gg = 228; b = 220; }
        for (let jj = 0; jj < cell; jj++) for (let ii = 0; ii < cell; ii++) {
          const k = ((j + jj) * w + (i + ii)) * 4;
          if (k < d.length) { d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255; }
        }
      }
    }
    g.putImageData(img, 0, 0);
    const P = (x, z) => [(x - MAP.x0) * MAP.scale, (z - MAP.z0) * MAP.scale];
    // 대교
    g.lineCap = 'round';
    for (const b of BRIDGE_AXES) {
      const a = P(b.ax, b.az), e = P(b.ax + b.dx * b.L, b.az + b.dz * b.L);
      g.strokeStyle = '#8d877b'; g.lineWidth = b.def.W * MAP.scale * 0.9;
      g.beginPath(); g.moveTo(...a); g.lineTo(...e); g.stroke();
      g.strokeStyle = '#f6f3ec'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(...a); g.lineTo(...e); g.stroke();
    }
    g.font = '600 11px "Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const label = (text, x, z, color = '#57524a') => {
      const p = P(x, z);
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText(text, p[0], p[1]);
      g.fillStyle = color; g.fillText(text, p[0], p[1]);
    };
    for (const b of BRIDGE_AXES) {
      const m = (b.sW0 + b.sW1) / 2 + (b.id === 'hangang' ? -70 : b.id === 'rail' ? 70 : 0);
      label(b.def.name, b.ax + b.dx * m - b.sx * 6, b.az + b.dz * m - b.sz * 6);
    }
    g.font = '600 10px "Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    const park = (bank, lon, dd, text) => { const p = bankOffset(bank, lonToX(lon), dd); label(text, p.x, p.z, '#4f7a3a'); };
    park('S', 126.9300, 70, '여의도한강공원');
    park('N', 126.9720, 40, '이촌한강공원');
    park('S', 126.9905, 62, '반포한강공원');
    const nd = toWorld(37.5176, 126.95845);
    label('노들섬', nd.x + 46, nd.z + 34, '#4f7a3a');
    for (const pl of PLAZA_POINTS) { const p = P(pl.x, pl.z); g.fillStyle = '#e9b44c'; g.beginPath(); g.arc(p[0], p[1], 2.2, 0, 7); g.fill(); }
    // 시설 표시
    const dot = (x, z, color, text) => {
      const p = P(x, z);
      g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(p[0], p[1], 3.4, 0, 7); g.fill(); g.stroke();
      if (text) { g.font = '600 9px "Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText(text, p[0], p[1] - 9); g.fillStyle = '#3d3a35'; g.fillText(text, p[0], p[1] - 9); }
    };
    for (const po of this.pois) dot(po.x, po.z, po.color, po.text);
    this.base = c;
  }

  // 큰 지도에서 클릭한 곳의 월드 좌표
  mapToWorld(ev) {
    const cv = this.el.map, r = cv.getBoundingClientRect();
    const k = Math.min(r.width / this.base.width, r.height / this.base.height);
    const ox = (r.width - this.base.width * k) / 2, oz = (r.height - this.base.height * k) / 2;
    const mx = (ev.clientX - r.left - ox) / k, mz = (ev.clientY - r.top - oz) / k;
    if (mx < 0 || mz < 0 || mx > this.base.width || mz > this.base.height) return null;
    return { x: MAP.x0 + mx / MAP.scale, z: MAP.z0 + mz / MAP.scale };
  }

  // 바로가기 버튼
  setPlaces(list) {
    this.el.places.innerHTML = '';
    for (const pl of list) {
      const b = document.createElement('button');
      b.textContent = pl.name;
      b.addEventListener('click', () => this.game.teleport(pl.x, pl.z, true));
      this.el.places.appendChild(b);
    }
    this.el.map.addEventListener('click', (ev) => { const w = this.mapToWorld(ev); if (w) this.game.teleport(w.x, w.z, true); });
  }

  toast(text, sec = 3) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = sec;
  }

  // 서버 연결 상태와 함께 접속한 사람 수
  net(status, n) {
    const el = this.el.peers || (this.el.peers = document.getElementById('peers'));
    el.textContent = status === 'on' ? (n > 1 ? `● 온라인 · 함께 산책 중 ${n}명` : '● 온라인 · 아직 혼자예요') : status === 'wait' ? '○ 서버에 다시 연결하는 중…' : '○ 오프라인 · 혼자 걷기';
    el.className = `peers show ${status === 'on' ? (n > 1 ? 'many' : 'solo') : 'off'}`;
  }

  // 화면 위쪽에 크게 뜨는 알림(누가 들어오거나 나갔을 때)
  notice(text) {
    const el = this.el.notice || (this.el.notice = document.getElementById('notice'));
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // 화면 아래 안내(E 키 등)
  prompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    this.el.prompt.textContent = text;
    this.el.prompt.classList.toggle('show', !!text);
  }

  // 잠깐 떠 있는 자막
  caption(text, sec = 3.5) {
    this.el.caption.textContent = text;
    this.el.caption.classList.add('show');
    this.capT = sec;
  }

  update(dt, player, env, fps) {
    if (this.capT > 0) { this.capT -= dt; if (this.capT <= 0) this.el.caption.classList.remove('show'); }
    this.acc += dt;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    this._drawMini(player);
    if (this.acc < 0.25) return;
    this.acc = 0;
    this.el.clock.textContent = env.clockText();
    this.el.phase.textContent = env.phaseText();
    const w = WEATHER[env.weather.state];
    this.el.weather.textContent = `${w.icon} ${w.label} · ${env.dowText}`;
    const name = placeName(player);
    player.state.place = name;
    if (name && name !== this.lastPlace) {
      this.lastPlace = name;
      this.el.place.textContent = name;
      this.el.place.classList.remove('pop');
      void this.el.place.offsetWidth;
      this.el.place.classList.add('pop');
    }
    if (this.el.fps && fps) this.el.fps.textContent = `${Math.round(fps)} fps`;
    if (player.edgeHint > 1.2 && this.toastT <= 0 && player.mode === 'walk') this.toast('산책로는 여기까지예요');
  }

  _drawMini(player) {
    if (!this.base) return;
    const cv = this.bigOpen ? this.el.map : this.el.mini;
    const g = this.bigOpen ? cv.getContext('2d') : this.mini;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const s = player.state;
    const px = (s.x - MAP.x0) * MAP.scale, pz = (s.z - MAP.z0) * MAP.scale;
    let k, ox, oz;
    if (this.bigOpen) { k = Math.min(cw / this.base.width, ch / this.base.height); ox = (cw - this.base.width * k) / 2; oz = (ch - this.base.height * k) / 2; }
    else { k = 1; ox = cw / 2 - px; oz = ch / 2 - pz; }
    g.fillStyle = '#e8e4dc';
    g.fillRect(0, 0, cw, ch);
    g.drawImage(this.base, ox, oz, this.base.width * k, this.base.height * k);
    // 플레이어
    g.save();
    g.translate(ox + px * k, oz + pz * k);
    g.rotate(Math.PI - s.yaw);
    g.fillStyle = '#e4572e'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  toggleBigMap(force) {
    this.bigOpen = force ?? !this.bigOpen;
    this.el.map.parentElement.classList.toggle('open', this.bigOpen);
    document.body.classList.toggle('mapopen', this.bigOpen);
  }

  _buildMenu() {
    const game = this.game, m = this.el.menu;
    const on = (sel, fn) => m.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => fn(b, e)));
    on('[data-act="resume"]', () => game.resume(true));
    on('[data-act="reset"]', () => { game.resetPosition(); game.resume(true); });
    on('[data-q]', (b) => { game.setQuality(b.dataset.q, true); this.refreshMenu(); });
    on('[data-time]', (b) => { game.env.hour = parseFloat(b.dataset.time); game.env.sky.envTimer = 1e9; });
    on('[data-weather]', (b) => {
      const w = b.dataset.weather;
      if (w === 'auto') game.env.weather.locked = false;
      else { game.env.weather.locked = true; game.env.weather.set(w, true); }
      game.env.sky.envTimer = 1e9;
      this.refreshMenu();
    });
    m.querySelectorAll('[data-vol]').forEach((r) => r.addEventListener('input', () => { game.audio.vol[r.dataset.vol] = parseFloat(r.value); game.audio.applyVolumes(); }));
    on('[data-speed]', (b) => { const v = parseFloat(b.dataset.speed); game.env.paused = v === 0; game.env.timeScale = v || 1; this.refreshMenu(); });
  }

  refreshMenu() {
    const game = this.game, m = this.el.menu;
    m.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === game.qualityName));
    const ws = game.env.weather;
    m.querySelectorAll('[data-weather]').forEach((b) => b.classList.toggle('on', ws.locked ? b.dataset.weather === ws.state : b.dataset.weather === 'auto'));
    const sp = game.env.paused ? 0 : game.env.timeScale;
    m.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.speed) === sp));
    const qn = m.querySelector('#qnote');
    if (qn) qn.textContent = QUALITY[game.qualityName].reflection ? '물 반사·빛줄기 켜짐' : '물 반사·빛줄기 꺼짐 (가벼움)';
  }

  showMenu(show) {
    this.el.menu.classList.toggle('open', show);
    document.body.classList.toggle('menuopen', show);
    if (show) this.refreshMenu();
  }
}
