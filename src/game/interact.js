// 상호작용(E·F·Q): 한강라면·치킨·간식, 따릉이, 오리배, 한강버스, 벤치 앉기, 물수제비.
import * as THREE from 'three';
import { clamp, dampAngle, damp } from '../core/math.js';
import { sampleField, heightAt } from '../world/field.js';
import { WALK_X_MIN, WALK_X_MAX } from '../world/geo.js';

export class Interact {
  constructor(game) {
    this.g = game;
    this.points = [];
    this.cur = null;
    this.busy = null; // {t, done}
    this.duck = null; this.bus = null;
    this.chicken = { state: 'none', zone: null };
    this.stone = null;
    this._f = {};
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.8 }));
    m.visible = false;
    game.scene.add(m);
    this.stoneMesh = m;
    this._setup();
  }

  add(p) { this.points.push(p); return p; }

  _setup() {
    const g = this.g, pl = g.player, hud = g.hud;
    const { docks, duckDock } = g.boats;
    // 여의도 선착장 편의점(건물 안): 라면 → 즉석조리기, 음료, 동물 간식
    const yd = docks.yeouido, st = yd.store;
    const buy = (item, msg) => () => { pl.setItem(item); g.audio?.sfx('beep'); hud.caption(msg, 4.5); };
    const shop = (q, label, item, msg) => this.add({ x: q[0], z: q[1], y: yd.deckY, r: 1.5, label: () => (pl.item ? '손에 든 것을 먼저 먹거나 써 주세요' : label), can: () => pl.mode === 'walk' && !pl.item, act: buy(item, msg) });
    shop(st.ramen, 'E  봉지라면 사기', 'rawramen', '삑— 라면 한 봉지. 창가 즉석조리기에서 끓여 드세요');
    shop(st.drink, 'E  음료수 사기', 'drink', '삑— 시원한 음료수. E로 마셔요');
    shop(st.treat, 'E  동물 간식 사기', 'treat', '삑— 동물 간식. 강아지나 고양이 곁에서 E로 주세요');
    this.add({
      x: st.cooker[0], z: st.cooker[1], y: yd.deckY, r: 1.5,
      label: () => (pl.item === 'rawramen' ? 'E  한강라면 끓이기' : '즉석조리기 · 진열대에서 라면을 먼저 사 오세요'),
      can: () => pl.mode === 'walk' && pl.item === 'rawramen',
      act: () => {
        pl.mode = 'busy'; pl.setItem(null);
        hud.caption('즉석조리기에 물을 붓고 기다리는 중…', 4.6);
        g.audio?.sfx('boil');
        this.busy = { t: 4.6, done: () => { pl.mode = 'walk'; pl.setItem('ramen'); g.audio?.sfx('ding'); hud.caption('한강라면 완성! 자리를 잡고 F로 앉아서, E로 드세요', 5); } };
      },
    });
    this.add({ x: st.counter[0], z: st.counter[1], y: yd.deckY, r: 1.4, label: () => '점원: 필요한 건 진열대에서 골라 오시면 돼요', can: () => false, act: () => {} });
    // 한강버스 시간표
    for (const b of g.boats.boards) {
      this.add({ x: b.x - b.d.wx * 1.2, z: b.z - b.d.wz * 1.2, y: b.y, r: 2.4, can: () => false, act: () => {},
        label: () => { const e = g.boats.eta(b.key); return e.docked ? `한강버스 탑승 중 · ${g.boats.fmtSec(e.sec)} 뒤 출발` : `다음 한강버스 · 약 ${g.boats.fmtSec(e.sec)} 뒤 도착`; } });
    }
    // 푸드트럭
    const tr = g.facilities.truck;
    this.add({
      x: tr.counter[0], z: tr.counter[1], y: tr.y, r: 3, label: () => 'E  핫도그 사 먹기',
      can: () => pl.mode === 'walk' && !pl.item,
      act: () => { pl.setItem('snack'); g.audio?.sfx('beep'); hud.caption('사장님: 맛있게 드세요! (E로 먹기)', 4); },
    });
    // 치킨 배달존
    for (const z of g.facilities.zones) {
      this.add({
        x: z.x, z: z.z, y: z.y, r: 3.2,
        label: () => (this.chicken.state === 'ready' && this.chicken.zone === z ? 'E  치킨 받기' : this.chicken.state === 'none' ? 'E  치킨 주문하기' : '치킨 배달 오는 중…'),
        can: () => pl.mode === 'walk' && !pl.item,
        act: () => {
          const c = this.chicken;
          if (c.state === 'none') {
            c.state = 'coming'; c.zone = z;
            hud.caption('치킨을 주문했어요. 배달존에서 조금만 기다려 주세요', 4.5);
            g.npcs.deliver(z.x + 0.8, z.z + 0.8, () => { c.state = 'ready'; hud.caption('치킨이 도착했어요! 배달존에서 E로 받으세요', 5); g.audio?.sfx('bell'); });
          } else if (c.state === 'ready' && c.zone === z) {
            c.state = 'none';
            pl.setItem('chicken');
            hud.caption('바삭한 치킨! 잔디밭에서 F로 돗자리를 펴고 E로 드세요', 5);
          }
        },
      });
    }
    // 따릉이
    for (const r of g.facilities.racks) {
      this.add({ x: r.x, z: r.z, y: r.y, r: 3.4, label: () => 'E  따릉이 타기', can: () => pl.mode === 'walk', act: () => { pl.mode = 'bike'; g.audio?.sfx('beep'); hud.caption('따릉이를 빌렸어요. Shift로 더 빠르게, 반납은 대여소에서 E', 4.5); g.audio?.sfx('bell'); } });
    }
    // 오리배
    const dx = duckDock.g0[0] + duckDock.wx * 11.5, dz = duckDock.g0[1] + duckDock.wz * 11.5;
    this.add({ x: dx, z: dz, y: 0.75, r: 4.5, label: () => 'E  오리배 타기', can: () => pl.mode === 'walk', act: () => this._boardDuck() });
    // 한강버스(선착장마다)
    for (const [key, d] of Object.entries(docks)) {
      const bx = d.x + d.wx * (d.wid / 2 - 1.2), bz = d.z + d.wz * (d.wid / 2 - 1.2);
      this.add({
        x: bx, z: bz, y: d.deckY, r: 7,
        label: () => (g.boats.buses.some((b) => b.dock === key) ? 'E  한강버스 타기' : `한강버스 · 약 ${g.boats.fmtSec(g.boats.eta(key).sec)} 뒤 도착`),
        can: () => pl.mode === 'walk',
        act: () => { const b = g.boats.buses.find((q) => q.dock === key); if (b) this._boardBus(b); },
      });
    }
  }

  _boardDuck() {
    const g = this.g, pl = g.player;
    const d = g.boats.ducks.find((q) => q.moored && !q.ridden);
    if (!d) return;
    d.ridden = true; d.v = 0;
    this.duck = d;
    pl.mode = 'duck'; pl.sitLow = false;
    g.audio?.sfx('splash', 0.6);
    g.hud.caption('오리배 출발! W·S 페달, A·D 방향, Shift 힘껏. 내릴 때는 선착장으로 돌아와 E', 6);
  }

  _leaveDuck() {
    const g = this.g, pl = g.player, d = this.duck, dk = g.boats.duckDock;
    if (!this._nearDuckDock()) { g.hud.toast('오리배 선착장으로 돌아가야 내릴 수 있어요'); return; }
    d.ridden = false; d.x = d.home.x; d.z = d.home.z; d.yaw = d.home.yaw; d.v = 0;
    this.duck = null;
    pl.mode = 'walk';
    pl.place(dk.g0[0] + dk.wx * 10, dk.g0[1] + dk.wz * 10, Math.atan2(-dk.wx, -dk.wz), 0.75);
  }

  _nearDuckDock() {
    const d = this.duck, dk = this.g.boats.duckDock;
    return !!d && Math.hypot(d.x - (dk.g0[0] + dk.wx * 14), d.z - (dk.g0[1] + dk.wz * 14)) < 11;
  }

  _returnBike() {
    const g = this.g, pl = g.player, s = pl.state;
    const r = g.facilities.racks.find((q) => Math.hypot(q.x - s.x, q.z - s.z) < 6 && Math.abs(q.y - s.y) < 2);
    if (!r) { g.hud.toast('따릉이는 대여소에서만 반납할 수 있어요 (지도의 초록 점)'); return; }
    pl.mode = 'walk'; s.speed = 0;
    g.audio?.sfx('beep');
    g.hud.caption('따릉이를 반납했어요', 2.5);
  }

  // 동물 쓰다듬기·간식 주기
  _pet(p) {
    const g = this.g, pl = g.player, s = pl.state;
    s.yaw = Math.atan2(p.x - s.x, p.z - s.z); s.speed = 0;
    pl.petT = 1.6;
    const dog = p.type === 'dog';
    if (pl.item === 'treat' || (dog && pl.item === 'snack')) {
      pl.setItem(null);
      p.happy = 2.2; p.follow = 40;
      g.audio?.sfx(dog ? 'bark' : 'meow'); g.audio?.sfx('crunch');
      g.hud.caption(dog ? '강아지가 간식을 받아먹고 신이 났어요. 한동안 따라다녀요' : '고양이가 간식을 받아먹었어요. 한동안 졸졸 따라와요', 4.5);
      g.hearts.burst(p.x, p.y + 0.8, p.z, 8);
    } else {
      p.happy = 2.6;
      g.audio?.sfx(dog ? 'bark' : 'purr');
      g.hud.caption(dog ? '강아지가 꼬리를 흔들어요' : '고양이가 가르랑거려요', 3);
      g.hearts.burst(p.x, p.y + 0.8, p.z, 4);
    }
  }

  _boardBus(b) {
    const pl = this.g.player;
    this.bus = b;
    pl.mode = 'bus'; pl.busSit = false;
    this.busL = { x: 0, z: -9.2, yaw: 0 }; // 배 기준 위치(뒤쪽 갑판에서 시작)
    if (pl.item) this.g.hud.toast('들고 있던 것은 가방에 넣었어요');
    pl.eatT = 0;
    pl.setItem('welcome');
    this.g.audio?.sfx('beep'); this.g.audio?.sfx('ding');
    this.g.hud.caption(`한강버스에 탔어요. 웰컴드링크 한 잔 받으세요! ${b.dock === 'yeouido' ? '반포' : '여의도'} 선착장으로 갑니다`, 6);
  }

  _leaveBus() {
    const g = this.g, pl = g.player, b = this.bus;
    if (!b.dock) { this._sip(); return; }
    const d = g.boats.docks[b.dock];
    this.bus = null;
    pl.mode = 'walk'; pl.busSit = false; pl.busSpeed = 0; pl.eatT = 0;
    pl.setItem(null); // 잔은 내릴 때 반납
    pl.place(d.x + d.wx * (d.wid / 2 - 1.6), d.z + d.wz * (d.wid / 2 - 1.6), Math.atan2(-d.wx, -d.wz), d.deckY);
    g.hud.caption(`${d.name}에 내렸어요. 잔은 승무원이 받아 갔어요`, 3.5);
  }

  // 웰컴드링크 한 모금
  _sip() {
    const pl = this.g.player;
    if (pl.item !== 'welcome' || pl.eatT > 0) return;
    pl.eatT = 2.4; this.eatTotal = 1e9; this.biteT = 0.7; this.biteSfx = 'gulp'; this.sipping = true;
    this.g.hud.caption('웰컴드링크 한 모금— 강바람이랑 잘 어울려요', 3);
  }

  // 버스 좌석 앉기/일어나기
  _busSeat() {
    const pl = this.g.player, L = this.busL;
    if (pl.busSit) { pl.busSit = false; L.x = Math.sign(L.x) * 0.6; return; }
    let best = null, bd = 2.2;
    for (const sz of [-5.6, -4.3, -3.0, -1.7, -0.4, 0.9, 2.2, 3.5]) for (const sx of [-1.75, -1.15, 1.15, 1.75]) {
      const d = Math.hypot(sx * 1.5 - L.x, sz * 1.5 - L.z);
      if (d < bd) { bd = d; best = [sx * 1.5, sz * 1.5]; }
    }
    if (!best) { this.g.hud.toast('좌석 가까이에서 F로 앉을 수 있어요'); return; }
    L.x = best[0]; L.z = best[1]; L.yaw = 0; pl.busSit = true;
  }

  // 순간이동 전에: 타고 있던 것에서 내린다
  dismount() {
    const g = this.g, pl = g.player;
    if (pl.mode === 'duck' && this.duck) { const d = this.duck; d.ridden = false; d.v = 0; d.x = d.home.x; d.z = d.home.z; d.yaw = d.home.yaw ?? d.yaw; this.duck = null; }
    if (pl.mode === 'bus') { this.bus = null; pl.busSit = false; pl.busSpeed = 0; pl.eatT = 0; this.sipping = false; if (pl.item === 'welcome') pl.setItem(null); }
    if (pl.mode === 'tree') this.tree = null;
    if (pl.mode !== 'busy') pl.mode = 'walk';
    pl.sitLow = false;
  }

  // 뽀뽀(K): 곁에 있는 친구(다른 플레이어)에게
  _kiss() {
    const g = this.g, pl = g.player, s = pl.state;
    if (pl.kissT > 0 || !['walk', 'sit', 'bus'].includes(pl.mode)) return;
    const r = g.multi.nearest(s.x, s.z, s.y, 1.8);
    if (!r) { g.hud.toast(g.multi.count > 1 ? '친구 가까이 다가가서 K를 눌러요' : '함께 접속한 친구가 있을 때 쓸 수 있어요'); return; }
    const o = r.pl.state;
    if (pl.mode === 'walk') s.yaw = Math.atan2(o.x - s.x, o.z - s.z);
    pl.kissT = 1.6;
    g.multi.send('kiss', r);
    g.audio?.sfx('kiss');
    g.hearts.burst((s.x + o.x) / 2, s.y + 1.25, (s.z + o.z) / 2, 7);
    g.hud.caption('쪽— 뽀뽀했어요', 2.5);
  }

  // 다른 플레이어가 나에게 한 행동
  onPeerAct(kind, r) {
    const g = this.g, pl = g.player, s = pl.state, o = r.pl.state;
    const face = () => { if (pl.mode === 'walk') s.yaw = Math.atan2(o.x - s.x, o.z - s.z); };
    if (kind === 'kiss') { face(); pl.kissT = 1.6; g.audio?.sfx('kiss'); g.hearts.burst((s.x + o.x) / 2, s.y + 1.25, (s.z + o.z) / 2, 7); g.hud.caption('친구가 뽀뽀했어요 쪽—', 3); }
    else if (kind === 'propose') { face(); g.audio?.sfx('ding'); g.audio?.sfx('chime'); g.hearts.burst(s.x, s.y + 1.4, s.z, 10); g.hearts.burst(o.x, o.y + 1.2, o.z, 6, true); if (!pl.item && pl.mode === 'walk') pl.setItem('flower'); g.hud.caption('친구가 한쪽 무릎을 꿇고 꽃을 건넸어요. 받아 주실래요?', 6); }
    else if (kind === 'wave') { pl.waveT = Math.max(pl.waveT, 0.01); g.hud.caption('친구가 손을 흔들어요', 2.5); }
  }

  // (숨은 기능) 나무 타기
  _climb() {
    const g = this.g, pl = g.player, s = pl.state;
    if (pl.mode === 'tree') { const t = this.tree; this.tree = null; pl.mode = 'walk'; pl.place(t.bx, t.bz, s.yaw) || pl.place(t.tr.x + 1.2, t.tr.z, s.yaw); return; }
    if (pl.mode !== 'walk' || pl.item) return;
    let best = null, bd = 2.4;
    for (const t of g.ctx.trees || []) { const d = Math.hypot(t.x - s.x, t.z - s.z); if (d < bd && Math.abs(t.y - s.y) < 2) { bd = d; best = t; } }
    if (!best) return;
    const a = Math.atan2(s.x - best.x, s.z - best.z);
    const TOP = [7.9, 9.7, 8.0, 5.3][best.v] ?? 7.9; // 나무 종류별 꼭대기 높이
    this.tree = { tr: best, bx: s.x, bz: s.z, by: s.y, k: 0, a, top: best.y + TOP * (best.s || 1) - 0.3 };
    pl.mode = 'tree'; s.speed = 0;
    g.audio?.sfx('flap', 0.4);
    g.hud.caption('영차— 나무 위로 올라왔어요. 강이 한눈에 보여요', 4);
  }

  // (숨은 기능) 꽃을 꺾어 곁의 친구에게 프로포즈
  _propose() {
    const g = this.g, pl = g.player, s = pl.state;
    if (pl.mode !== 'walk' || pl.kneelT > 0) return;
    const fp = g.flowers.near(s.x, s.z);
    if (!fp && pl.item !== 'flower') return;
    if (pl.item && pl.item !== 'flower') { g.hud.toast('손이 비어 있어야 꽃을 꺾을 수 있어요'); return; }
    pl.setItem('flower'); s.speed = 0;
    const r = g.multi.nearest(s.x, s.z, s.y, 4);
    pl.kneelT = 4.5;
    g.audio?.sfx('sniff'); g.audio?.sfx('ding');
    if (r) {
      s.yaw = Math.atan2(r.pl.state.x - s.x, r.pl.state.z - s.z);
      g.multi.send('propose', r);
      g.hearts.burst(s.x + Math.sin(s.yaw) * 0.5, s.y + 0.9, s.z + Math.cos(s.yaw) * 0.5, 8);
      g.hud.caption('한쪽 무릎을 꿇고 꽃을 건넸어요', 4.5);
      this.giveT = 4.3;
    } else g.hud.caption('꽃 한 송이를 꺾었어요. 건넬 사람이 곁에 있으면 좋겠네요', 4);
  }

  // 인사(G): 손을 흔들면 주변 사람들과 맞은편 한강버스 승객이 답한다
  _greet() {
    const g = this.g, pl = g.player, s = pl.state;
    if (pl.waveT > 0.6 || pl.mode === 'busy' || pl.mode === 'duck' && false) return;
    pl.waveT = 1.8;
    g.audio?.sfx('hello');
    const fr = g.multi.nearest(s.x, s.z, s.y, 12); if (fr) g.multi.send('wave', fr);
    const n = g.npcs.greet(s.x, s.z, s.y, pl.mode === 'bus' ? 14 : 8);
    g.hud.caption(n === 0 ? '안녕하세요! (근처에 아무도 없네요)' : pl.mode === 'bus' && n > 6 ? `안녕하세요! 맞은편 한강버스까지 ${n}명이 손을 흔들어 줘요` : `안녕하세요! ${n}명이 반갑게 손을 흔들어 줘요`, 3.2);
    if (n > 0) g.audio?.sfx('hello', 0.6, 0.5);
  }

  _sit() {
    const g = this.g, pl = g.player, s = pl.state;
    if (pl.mode === 'sit') { pl.mode = 'walk'; pl.sitLow = false; return; }
    if (pl.mode !== 'walk' || s.speed > 3) return;
    // 가까운 벤치가 있으면 벤치에, 없으면 바닥에(돗자리)
    let best = null, bd = 2.2;
    for (const b of g.ctx.benches || []) { const d = Math.hypot(b.x - s.x, b.z - s.z); if (d < bd && Math.abs(b.y - s.y) < 1) { bd = d; best = b; } }
    if (best) { s.x = best.x + best.dirx * 0.05; s.z = best.z + best.dirz * 0.05; s.yaw = Math.atan2(best.dirx, best.dirz); pl.sitLow = false; }
    else if (s.surface === 'ground') pl.sitLow = true;
    else return;
    pl.mode = 'sit';
  }

  _eat() {
    const g = this.g, pl = g.player;
    if (!pl.item || pl.eatT > 0) return;
    if (pl.item === 'rawramen') { g.hud.toast('편의점 창가 즉석조리기에서 끓여야 먹을 수 있어요'); return; }
    if (pl.item === 'treat') { g.hud.toast('동물 친구에게 주는 간식이에요. 강아지나 고양이 곁에서 E'); return; }
    if (pl.item === 'flower' || pl.item === 'welcome') return;
    const info = { ramen: [13, '후루룩— 강바람 맞으며 먹는 라면', 'slurp'], chicken: [13, '바삭— 한강에서는 역시 치킨', 'crunch'], snack: [8, '핫도그 한 입', 'crunch'], drink: [6, '꿀꺽— 시원하다', 'gulp'] }[pl.item];
    pl.eatT = info[0]; this.eatTotal = info[0]; this.biteT = 0.5; this.biteSfx = info[2];
    g.hud.caption(info[1], 4);
  }

  // 물수제비: 물가에서 Q
  _throw() {
    const g = this.g, pl = g.player, s = pl.state;
    if (pl.mode !== 'walk' || this.stone || pl.throwT > 0) return;
    const f = sampleField(s.x, s.z, this._f);
    if (s.surface !== 'ground' || f.d > 9) { g.hud.toast('물가로 가까이 가면 물수제비를 뜰 수 있어요'); return; }
    const yaw = g.rig.yaw, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    s.yaw = Math.atan2(dx, dz);
    pl.throwT = 0.55;
    const v = 12 + Math.random() * 5;
    this.stone = { delay: 0.3, x: s.x + dx * 0.4, y: s.y + 1.0, z: s.z + dz * 0.4, vx: dx * v, vz: dz * v, vy: 0.6 + Math.random() * 0.8, n: 0, life: 6 };
  }

  // 비둘기 길들이기(성공 확률 5%)
  _tame(b) {
    const g = this.g, pl = g.player;
    pl.petT = 1.4; pl.state.speed = 0;
    g.audio?.sfx('coo');
    if (g.pigeons.tame(b)) { g.audio?.sfx('ding'); g.hearts.burst(b.x, b.y + 0.4, b.z, 8); g.hud.caption(`비둘기가 어깨에 올라앉았어요! (길들인 비둘기 ${g.pigeons.tamed}마리)`, 5); }
    else g.hud.caption(['비둘기가 고개를 갸웃하고 총총 물러나요', '구구— 아직은 낯을 가리네요', '모른 척 딴 데를 봐요. 다시 해 봐요 (성공 확률 5%)'][Math.floor(Math.random() * 3)], 3);
  }

  _grandpa() {
    const g = this.g, pl = g.player;
    pl.waveT = 1.6;
    g.audio?.sfx('hello');
    g.pigeons.show();
    g.hud.caption('비둘기 할아버지: "허허, 뛰어가면 다 날아가 버려. 천천히 다가가서 E를 눌러 봐. 스무 번에 한 번은 따라온다네." (휘파람) 휘익—', 7);
  }

  _smell() {
    const g = this.g, pl = g.player;
    pl.petT = 1.8; pl.state.speed = 0;
    g.audio?.sfx('sniff');
    g.hud.caption(`${this.flower.name} 향기가 은은해요`, 3);
    g.hearts.burst(pl.state.x + Math.sin(pl.state.yaw) * 0.6, pl.state.y + 0.9, pl.state.z + Math.cos(pl.state.yaw) * 0.6, 3, true);
  }

  key(code) {
    const pl = this.g.player;
    if (this.busy) return;
    if (code === 'KeyE') {
      if (pl.mode === 'bike') this._returnBike();
      else if (pl.mode === 'duck') this._leaveDuck();
      else if (pl.mode === 'bus') this._leaveBus();
      else if (pl.mode === 'walk' && this.pet) this._pet(this.pet);
      else if (pl.mode === 'walk' && this.gpa) this._grandpa();
      else if (pl.mode === 'walk' && this.pigeon && !(this.cur && this.cur.can())) this._tame(this.pigeon);
      else if (this.cur && this.cur.can()) this.cur.act();
      else if (pl.mode === 'walk' && this.flower) this._smell();
      else if (pl.item) this._eat();
    } else if (code === 'KeyG') this._greet();
    else if (code === 'KeyK') this._kiss();
    else if (code === 'Digit0' || code === 'Numpad0') this._climb();
    else if (code === 'Digit9' || code === 'Numpad9') this._propose();
    else if (code === 'KeyF') { if (pl.mode === 'bus') this._busSeat(); else this._sit(); }
    else if (code === 'KeyQ') this._throw();
  }

  update(dt, input) {
    const g = this.g, pl = g.player, s = pl.state, hud = g.hud;
    if (this.busy) { this.busy.t -= dt; if (this.busy.t <= 0) { const d = this.busy.done; this.busy = null; d(); } }
    if (pl.eatT > 0) {
      pl.eatT -= dt; this.biteT -= dt;
      if (this.biteT <= 0) { this.biteT = 2.42; g.audio?.sfx(this.biteSfx); } // 한 입마다 소리
      // 먹을수록 음식이 줄어든다
      const it = pl.items[pl.item]; if (it) it.scale.setScalar(0.45 + 0.55 * clamp(pl.eatT / this.eatTotal, 0, 1));
      if (pl.eatT <= 0 && this.sipping) { this.sipping = false; }
      else if (pl.eatT <= 0) { if (it) it.scale.setScalar(1); const was = pl.item; pl.setItem(null); g.audio?.sfx('ding'); hud.caption(was === 'drink' ? '캬— 잘 마셨습니다' : '잘 먹었습니다. 배가 든든해요', 3); }
    }
    // 편의점 출입: 들어서면 종이 울리고, 안에서는 카메라가 벽 밖으로 나가지 않는다
    {
      const room = g.boats.docks.yeouido.room, rx = s.x - room.cx, rz = s.z - room.cz;
      const inside = pl.mode === 'walk' || pl.mode === 'busy' ? Math.abs(rx * room.ux + rz * room.uz) < room.hl && Math.abs(-rx * room.uz + rz * room.ux) < room.hw && Math.abs(s.y - (room.yTop - 3.25)) < 1 : false;
      if (inside !== !!this.inStore) {
        this.inStore = inside;
        g.rig.room = inside ? room : null;
        g.audio?.sfx('chime');
        if (inside) hud.caption('딩동— 어서 오세요, 한강 편의점입니다', 3.5);
      }
    }
    if (pl.mode === 'sit' && input && (input.down('KeyW') || input.down('KeyA') || input.down('KeyS') || input.down('KeyD'))) { pl.mode = 'walk'; pl.sitLow = false; }
    if (pl.blockedStair > 1.4) hud.toast('자전거로는 계단을 오를 수 없어요. E로 반납하고 걸어가요');

    // 오리배 조종
    if (pl.mode === 'duck' && this.duck) {
      const d = this.duck;
      const fw = input ? (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 0.5 : 0) : 0;
      const tn = input ? (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0) : 0;
      const fast = input && (input.down('ShiftLeft') || input.down('ShiftRight')) ? 2.1 : 1;
      d.v = damp(d.v, fw * 3.4 * fast, fw ? 1.2 : 0.7, dt);
      d.yaw += tn * dt * (0.5 + 0.35 * Math.min(1, Math.abs(d.v)));
      const nx = d.x + Math.sin(d.yaw) * d.v * dt, nz = d.z + Math.cos(d.yaw) * d.v * dt;
      const ahead = Math.sign(d.v || 1) * 2.4;
      if (g.boats.navigable(nx + Math.sin(d.yaw) * ahead, nz + Math.cos(d.yaw) * ahead) && nx > WALK_X_MIN && nx < WALK_X_MAX && !this._pier(nx, nz)) { d.x = nx; d.z = nz; } else d.v *= 0.5;
      g.boats.placeRidden(d, g.ctx.uniforms.uTime.value);
      s.x = d.x - Math.sin(d.yaw) * 0.25; s.z = d.z - Math.cos(d.yaw) * 0.25; s.y = d.mesh.position.y + 0.95; s.yaw = d.yaw; s.surface = 'boat'; s.speed = Math.abs(d.v);
      pl.visY = s.y;
    }
    // 나무 위: 줄기를 타고 올라가 가지에 앉는다. 움직이려 하면 내려온다
    if (pl.mode === 'tree' && this.tree) {
      const t = this.tree;
      t.k = Math.min(1, t.k + dt / 1.5);
      const e = t.k * t.k * (3 - 2 * t.k);
      const off = 0.42 * (1 - e) + 0.12; // 줄기를 타고 올라 꼭대기에 앉는다
      s.x = t.tr.x + Math.sin(t.a) * off; s.z = t.tr.z + Math.cos(t.a) * off; s.y = t.by + (t.top - t.by) * e; s.yaw = t.a; s.surface = 'tree';
      pl.visY = s.y;
      if (t.k >= 1 && input && (input.down('KeyW') || input.down('KeyA') || input.down('KeyS') || input.down('KeyD'))) this._climb();
    }
    // 꽃을 건넨 뒤에는 손이 빈다
    if (this.giveT > 0) { this.giveT -= dt; if (this.giveT <= 0 && pl.item === 'flower') pl.setItem(null); }

    // 한강버스 승선 중: 지붕 갑판 위를 걸어 다닐 수 있다(좌석 줄과 바는 막혀 있다)
    if (pl.mode === 'bus' && this.bus) {
      const b = this.bus, L = this.busL, sn = Math.sin(b.yaw), cs = Math.cos(b.yaw);
      let ix = 0, iz = 0;
      if (input) { iz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0); ix = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0); }
      pl.busSpeed = 0;
      if (ix || iz) {
        if (pl.busSit) { pl.busSit = false; L.x = Math.sign(L.x) * 0.6; }
        const cy = g.rig.yaw, wx = -Math.sin(cy) * iz + Math.cos(cy) * ix, wz = -Math.cos(cy) * iz - Math.sin(cy) * ix, wl = Math.hypot(wx, wz);
        const sp = input.down('ShiftLeft') || input.down('ShiftRight') ? 4.2 : 2.2;
        const lx = (cs * wx - sn * wz) / wl, lz = (sn * wx + cs * wz) / wl;
        const ok = (x, z) => Math.abs(x) < 2.95 && z > -9.9 && z < 8.7 && !(Math.abs(x) > 1.05 && z > -9.05 && z < 5.95) && !(Math.abs(x) < 1.5 && z > 7.2 && z < 8.4);
        const nx = L.x + lx * sp * dt, nz = L.z + lz * sp * dt;
        if (ok(nx, nz)) { L.x = nx; L.z = nz; } else if (ok(nx, L.z)) L.x = nx; else if (ok(L.x, nz)) L.z = nz;
        L.yaw = Math.atan2(lx, lz);
        pl.busSpeed = sp;
      }
      s.x = b.x + cs * L.x + sn * L.z; s.z = b.z - sn * L.x + cs * L.z;
      s.y = b.mesh.position.y + (pl.busSit ? 3.17 * 1.5 - 0.33 : 2.93 * 1.5); s.surface = 'boat';
      s.yaw = b.yaw + L.yaw;
      pl.visY = s.y;
    }

    // 물수제비 돌
    const st = this.stone;
    if (st) {
      if (st.delay > 0) { st.delay -= dt; }
      else {
        this.stoneMesh.visible = true;
        st.life -= dt;
        st.vy -= 9.8 * dt;
        st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
        const f = sampleField(st.x, st.z, this._f);
        let end = st.life <= 0;
        if (f.d >= 0) { if (st.y <= heightAt(st.x, st.z) + 0.05) end = true; }
        else if (st.y <= 0.02 && st.vy < 0) {
          const vh = Math.hypot(st.vx, st.vz);
          g.ripples.add(st.x, st.z, 0.5 + vh * 0.05);
          g.audio?.sfx('plop', clamp(vh / 14, 0.2, 1));
          if (vh > 3.6 && st.n < 14) {
            st.n++;
            const k = 0.78 + Math.random() * 0.1;
            st.vx *= k; st.vz *= k; st.vy = vh * (0.14 + Math.random() * 0.07); st.y = 0.03;
          } else end = true;
        }
        this.stoneMesh.position.set(st.x, st.y, st.z);
        if (end) {
          this.stoneMesh.visible = false;
          this.stone = null;
          if (st.n > 0) hud.caption(st.n >= 7 ? `물수제비 ${st.n}번! 대단해요` : `물수제비 ${st.n}번`, 3);
        }
      }
    }

    // 가까운 상호작용 대상 찾기
    let best = null, bd = 1e9;
    if (pl.mode === 'walk') {
      for (const p of this.points) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < p.r && d < bd && Math.abs(p.y - s.y) < 2.6) { bd = d; best = p; }
      }
    }
    this.cur = best;
    // 가까운 동물, 꽃밭
    this.pet = null; this.flower = null; this.pigeon = null; this.gpa = false;
    if (pl.mode === 'walk' && pl.petT <= 0) {
      let pd = 1.7;
      for (const p of g.npcs.pets) { if (p.vis < 0.9) continue; const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < pd && Math.abs(p.y - s.y) < 1.2) { pd = d; this.pet = p; } }
      if (!this.pet && g.flowers) this.flower = g.flowers.near(s.x, s.z);
      this.pigeon = !this.pet && s.speed < 3 ? g.pigeons.near(s.x, s.z, s.y) : null;
      const gp = g.pigeons.grandpa; this.gpa = Math.hypot(gp.x - s.x, gp.z - s.z) < 2.4 && Math.abs(gp.y - s.y) < 1.5;
    }
    let text = '';
    if (pl.mode === 'bike') text = g.facilities.racks.some((q) => Math.hypot(q.x - s.x, q.z - s.z) < 6) ? 'E  따릉이 반납' : 'Shift 빠르게 · 반납은 대여소에서';
    else if (pl.mode === 'duck') text = this._nearDuckDock() ? 'E  내리기 · W S 페달 · A D 방향' : 'W S 페달 · A D 방향 · Shift 힘껏 · 내릴 때는 선착장으로';
    else if (pl.mode === 'bus') text = (this.bus && this.bus.dock ? 'E  내리기' : 'E  웰컴드링크 마시기') + ' · W A S D 갑판 걷기 · F ' + (pl.busSit ? '일어나기' : '좌석 앉기') + ' · G 인사';
    else if (pl.mode === 'sit') text = pl.item && pl.eatT <= 0 && pl.item !== 'rawramen' && pl.item !== 'treat' && pl.item !== 'flower' ? 'E  먹기 · F 일어나기' : 'F  일어나기';
    else if (pl.mode === 'busy') text = '';
    else if (this.pet) text = pl.item === 'treat' || (this.pet.type === 'dog' && pl.item === 'snack') ? 'E  간식 주기' : this.pet.type === 'dog' ? 'E  강아지 쓰다듬기' : 'E  고양이 쓰다듬기';
    else if (this.gpa) text = 'E  비둘기 할아버지께 인사하기';
    else if (best) text = best.label();
    else if (this.pigeon) text = 'E  비둘기 길들이기 (5%)';
    else if (this.flower && !pl.item) text = `E  ${this.flower.name} 향기 맡기`;
    else if (pl.item && pl.eatT <= 0) text = pl.item === 'rawramen' ? '봉지라면 · 편의점 즉석조리기에서 끓여요' : pl.item === 'treat' ? '동물 간식 · 강아지나 고양이 곁에서 E' : pl.item === 'flower' ? '' : pl.item === 'drink' ? 'E  마시기 · F 앉기' : 'E  먹기 · F 앉기';
    else {
      let nb = false;
      for (const b of g.ctx.benches || []) if (Math.abs(b.x - s.x) < 1.9 && Math.abs(b.z - s.z) < 1.9 && Math.abs(b.y - s.y) < 1) { nb = true; break; }
      if (nb) text = 'F  벤치에 앉기';
    }
    hud.prompt(text);
  }

  // 오리배가 교각에 부딪히는지
  _pier(x, z) {
    for (const p of this.g.ctx.bridgePlans) {
      const rx = x - p.ax, rz = z - p.az;
      const sv = rx * p.dx + rz * p.dz, a = rx * p.sx + rz * p.sz;
      if (sv < 0 || sv > p.L || Math.abs(a) > p.W / 2 + 1) continue;
      if (p.jamsu && sv > p.jamsu.s0 && sv < p.jamsu.s1 && Math.abs(sv - p.jamsu.sH) > 14) return true; // 잠수교 아래는 낮다
      for (const pr of p.piers) if (Math.abs(pr.s - sv) < 3) return true;
    }
    return false;
  }
}
