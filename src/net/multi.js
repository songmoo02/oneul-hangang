// 함께 걷기: 같은 페이지를 지금 열고 있는 사람들이 서로의 캐릭터를 본다.
// Claude 아티팩트의 room 기능(presence)을 쓴다. 연결할 수 없는 환경(직접 배포한 사이트 등)에서는 혼자 걷는 게임으로 그대로 동작한다.
import * as THREE from 'three';
import { Player } from '../player/player.js';
import { dampAngle, damp } from '../core/math.js';

const r2 = (v) => Math.round(v * 100) / 100;

export class Multi {
  constructor(game) {
    this.g = game;
    this.room = null;
    this.remotes = new Map(); // peer → { pl, tx,ty,tz,tyaw, label, seen }
    this.sendT = 0;
    this.actN = 0; this.act = null;
    this.myPeer = null;
    this.count = 1;
  }

  async start() {
    const fail = () => { this.room = null; this.status = 'off'; this.g.hud.net('off', 1); };
    try {
      const c = window.claude;
      if (c && typeof c.use === 'function') { // Claude 아티팩트 안: room 기능
        const room = await c.use('room');
        if (!room) return fail();
        this.room = room; this.status = 'on';
        this.g.hud.net('on', 1);
        room.onPeers((ch) => this._peers(ch), () => { this._clear(); fail(); });
        room.onConnection((ok) => { this.status = ok ? 'on' : 'wait'; this.g.hud.net(this.status, this.count); }, () => {});
        return;
      }
      await this._startMqtt(fail); // 직접 배포한 사이트: 공개 MQTT 중계 서버(계정 없이 링크만으로 접속)
    } catch { fail(); }
  }

  // 공개 MQTT 브로커를 통한 함께 걷기. 같은 사이트를 연 모든 사람이 한 방에 모인다.
  async _startMqtt(fail) {
    const mqtt = (await import('mqtt')).default;
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    const base = `oneul-hangang/v1/${location.hostname.replace(/[^a-z0-9.-]/gi, '_')}`;
    const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
    const others = new Map(); // id → { presence, t }
    let bi = 0, client = null, dirty = false, gone = [];
    const connect = () => {
      client = mqtt.connect(BROKERS[bi], { clientId: `hg_${id}`, clean: true, keepalive: 20, reconnectPeriod: 3000, connectTimeout: 8000, will: { topic: `${base}/bye/${id}`, payload: '1', qos: 0 } });
      let ever = false;
      client.on('connect', () => { ever = true; this.status = 'on'; this.g.hud.net('on', this.count); client.subscribe([`${base}/p/+`, `${base}/bye/+`]); });
      client.on('close', () => { if (this.status === 'on') { this.status = 'wait'; this.g.hud.net('wait', this.count); } });
      client.on('error', () => { if (!ever && bi < BROKERS.length - 1) { bi++; try { client.end(true); } catch { /* 무시 */ } connect(); } else if (!ever) fail(); });
      client.on('message', (topic, payload) => {
        const who = topic.slice(topic.lastIndexOf('/') + 1);
        if (who === id) return;
        if (topic.includes('/bye/')) { if (others.delete(who)) { gone.push(who); dirty = true; } return; }
        try { const d = JSON.parse(payload.toString()); if (d && typeof d === 'object') { others.set(who, { presence: d, t: performance.now() }); dirty = true; } } catch { /* 무시 */ }
      });
    };
    connect();
    this.status = 'wait'; this.g.hud.net('wait', 1);
    this.room = { presence: (patch) => { if (client && client.connected) client.publish(`${base}/p/${id}`, JSON.stringify(patch), { qos: 0 }); return Promise.resolve(); } };
    window.addEventListener('pagehide', () => { try { client.publish(`${base}/bye/${id}`, '1'); client.end(); } catch { /* 무시 */ } });
    // 받은 상태를 0.1초마다 한 번에 반영하고, 5초 넘게 소식이 없는 사람은 나간 것으로 본다
    setInterval(() => {
      const now = performance.now();
      for (const [k, v] of others) if (now - v.t > 5000) { others.delete(k); gone.push(k); dirty = true; }
      if (!dirty) return;
      dirty = false;
      const peers = [{ peer: id, sameTab: true, isMe: true, kind: 'viewer', presence: {} }];
      for (const [k, v] of others) peers.push({ peer: k, sameTab: false, isMe: false, kind: 'viewer', presence: v.presence });
      this._peers({ left: gone.map((k) => ({ peer: k })), peers });
      gone = [];
    }, 100);
  }

  _clear() { for (const [, r] of this.remotes) { this.g.scene.remove(r.pl.mesh); this.g.scene.remove(r.label); } this.remotes.clear(); this.count = 1; }

  _label(n) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(20,24,30,0.72)'; g.beginPath(); g.roundRect(8, 8, 240, 48, 24); g.fill();
    g.fillStyle = '#fff'; g.font = '600 28px "Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`친구 ${n}`, 128, 33);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    sp.scale.set(0.9, 0.225, 1); sp.layers.set(1);
    return sp;
  }

  _peers(ch) {
    const g = this.g;
    for (const p of ch.left) {
      const r = this.remotes.get(p.peer);
      if (r) { g.scene.remove(r.pl.mesh); g.scene.remove(r.label); this.remotes.delete(p.peer); this.left = (this.left || 0) + 1; }
    }
    let host = null;
    for (const p of ch.peers) {
      if (p.kind !== 'viewer') continue;
      if (p.sameTab) { this.myPeer = p.peer; if (!host || p.peer < host.peer) host = p; continue; }
      const d = p.presence || {};
      if (!Array.isArray(d.p) || d.p.length < 4 || !d.p.every((v) => Number.isFinite(v))) continue;
      if (!host || p.peer < host.peer) host = p;
      let r = this.remotes.get(p.peer);
      if (!r) {
        if (this.remotes.size >= 12) continue;
        const pl = new Player(g.ctx);
        r = { pl, label: this._label(this.remotes.size + 1), tx: d.p[0], ty: d.p[1], tz: d.p[2], tyaw: d.p[3], actN: d.act && d.act.n, peer: p.peer };
        pl.state.x = r.tx; pl.state.y = r.ty; pl.state.z = r.tz; pl.state.yaw = r.tyaw; pl.visY = r.ty;
        g.scene.add(r.label);
        this.remotes.set(p.peer, r);
        this.joined = (this.joined || 0) + 1;
      }
      r.tx = d.p[0]; r.ty = d.p[1]; r.tz = d.p[2]; r.tyaw = d.p[3];
      const pl = r.pl;
      if ((d.g === 'm' || d.g === 'f') && d.g !== pl.gender) pl.setGender(d.g);
      const md = ['walk', 'bike', 'sit', 'duck', 'bus', 'busy', 'tree'].includes(d.m) ? d.m : 'walk';
      pl.mode = md; pl.sitLow = !!d.lo; pl.busSit = !!d.bs;
      pl.state.speed = Number.isFinite(d.sp) ? Math.min(20, Math.max(0, d.sp)) : 0;
      const it = typeof d.it === 'string' && pl.items[d.it] ? d.it : null;
      if (it !== pl.item) pl.setItem(it);
      if (d.wv && pl.waveT < 0.3) pl.waveT = 1.2;
      if (d.ks && pl.kissT < 0.3) pl.kissT = 1.6;
      if (d.kn) pl.kneelT = 0.5;
      if (d.ea && pl.eatT <= 0) pl.eatT = 2;
      // 상대가 나에게 한 행동(뽀뽀·프로포즈·인사)
      const a = d.act;
      if (a && typeof a === 'object' && a.n !== r.actN) {
        r.actN = a.n;
        if (a.to === this.myPeer && this.onAct) this.onAct(a.k, r);
      }
    }
    // 시간은 방에서 가장 먼저 온 사람(peer 이름이 가장 앞선 사람)의 시계를 따른다
    this.hostHour = host && !host.sameTab && host.presence && Number.isFinite(host.presence.h) ? host.presence.h : null;
    this.count = this.remotes.size + 1;
    g.hud.net(this.status, this.count);
    // 들어오고 나간 사람 알림
    if (this.joined) {
      g.audio?.sfx('chime');
      g.hud.notice(this.first ? `친구가 서버에 들어왔어요! 지금 ${this.count}명이 함께 산책 중` : `서버에 접속했어요. 지금 ${this.count}명이 함께 산책 중이에요`);
      this.joined = 0;
    } else if (this.left) g.hud.notice(`친구가 서버에서 나갔어요. 지금 ${this.count}명`);
    this.left = 0; this.first = true;
  }

  // 가장 가까운 다른 플레이어
  nearest(x, z, y, r = 2.2) {
    let best = null, bd = r;
    for (const [, q] of this.remotes) { const s = q.pl.state, d = Math.hypot(s.x - x, s.z - z); if (d < bd && Math.abs(s.y - y) < 2) { bd = d; best = q; } }
    return best;
  }

  // 상대에게 행동을 알린다
  send(kind, remote) { this.act = { k: kind, to: remote ? remote.peer : null, n: ++this.actN }; this.sendT = 0; }

  update(dt) {
    const g = this.g;
    for (const [, r] of this.remotes) {
      const pl = r.pl, s = pl.state;
      const far = Math.hypot(r.tx - s.x, r.tz - s.z) > 25;
      s.x = far ? r.tx : damp(s.x, r.tx, 12, dt); s.z = far ? r.tz : damp(s.z, r.tz, 12, dt); s.y = far ? r.ty : damp(s.y, r.ty, 14, dt);
      s.yaw = dampAngle(s.yaw, r.tyaw, 12, dt);
      if (pl.eatT > 0) pl.eatT -= dt;
      pl.sync(dt);
      r.label.position.set(s.x, pl.visY + 1.95, s.z);
    }
    if (!this.room) return;
    if (this.hostHour != null) { // 호스트 시계에 천천히 맞춘다
      let dh = this.hostHour - g.env.hour; if (dh > 12) dh -= 24; if (dh < -12) dh += 24;
      if (Math.abs(dh) > 0.03) { g.env.hour = (g.env.hour + dh * Math.min(1, dt * 0.8) + 24) % 24; if (Math.abs(dh) > 1) g.env.sky.envTimer = 1e9; }
    }
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 0.11;
    const pl = g.player, s = pl.state;
    const patch = { p: [r2(s.x), r2(pl.visY || s.y), r2(s.z), r2(s.yaw)], sp: r2(s.speed), m: pl.mode, g: pl.gender, it: pl.item || null, lo: pl.sitLow ? 1 : 0, bs: pl.busSit ? 1 : 0,
      wv: pl.waveT > 0.2 ? 1 : 0, ks: pl.kissT > 0.2 ? 1 : 0, kn: pl.kneelT > 0.1 ? 1 : 0, ea: pl.eatT > 0 ? 1 : 0, h: r2(g.env.hour), act: this.act };
    this.room.presence(patch).catch(() => {});
  }
}
