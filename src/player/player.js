// 플레이어: 절차적으로 만든 캐릭터 + 걷기/달리기 + 지형·다리 보행 판정.
import * as THREE from 'three';
import { damp, dampAngle, clamp, lerp } from '../core/math.js';
import { PlayerState } from '../core/state.js';
import { sampleField, heightAt } from '../world/field.js';
import { WALK_X_MIN, WALK_X_MAX } from '../world/geo.js';

const WALK_SPEED = 2.35, RUN_SPEED = 14.5, BIKE_SPEED = 8.5, BIKE_FAST = 15;

// 치비풍 캐릭터(머리가 크고 팔다리가 짧다). gender: 'f' | 'm'
function buildCharacter(gender = 'f') {
  const M = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const fem = gender === 'f';
  const jacket = M(fem ? 0xf2d9c4 : 0x8fb0c8), pants = M(fem ? 0x3a4466 : 0x2b3142), shoe = M(0xfaf6ee, 0.6), skin = M(0xf0c8a8, 0.7);
  const hair = M(fem ? 0x4a2e22 : 0x2a2520, 0.6), scarf = M(fem ? 0xd9584a : 0xe9b23a), dark = M(0x1c1a1a, 0.4), blush = M(0xf29a9a, 0.9);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  const HIP = 0.56;
  const upper = new THREE.Group();
  upper.position.y = HIP;
  body.add(upper);
  add(upper, new THREE.CapsuleGeometry(0.185, 0.16, 6, 14), jacket, 0, 0.21, 0).scale.set(1.08, 1, 0.86);
  if (fem) add(upper, new THREE.CylinderGeometry(0.19, 0.3, 0.24, 16), pants, 0, -0.02, 0).scale.set(1, 1, 0.9); // 치마
  const sc = add(upper, new THREE.TorusGeometry(0.13, 0.05, 8, 16), scarf, 0, 0.43, 0.01);
  sc.rotation.x = Math.PI / 2;
  add(upper, new THREE.BoxGeometry(0.1, 0.2, 0.04), scarf, 0.09, 0.33, 0.17).rotation.z = -0.15;
  const head = new THREE.Group();
  head.position.y = 0.7;
  upper.add(head);
  add(head, new THREE.SphereGeometry(0.265, 22, 16), skin, 0, 0, 0).scale.set(1, 0.94, 0.97);
  add(head, new THREE.SphereGeometry(0.283, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.012, -0.025);
  for (const sx of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.034, 10, 8), dark, sx * 0.1, -0.01, 0.238).scale.set(1, 1.35, 0.5);
    add(head, new THREE.SphereGeometry(0.012, 6, 5), M(0xffffff, 0.3), sx * 0.1 + 0.012, 0.012, 0.255);
    add(head, new THREE.SphereGeometry(0.045, 10, 8), blush, sx * 0.165, -0.075, 0.2).scale.set(1, 0.55, 0.4);
  }
  add(head, new THREE.SphereGeometry(0.022, 8, 6), M(0xc86a5a, 0.6), 0, -0.085, 0.25).scale.set(1.3, 0.6, 0.5); // 입
  if (fem) {
    add(head, new THREE.SphereGeometry(0.25, 16, 12), hair, 0, -0.08, -0.09).scale.set(1.08, 1.12, 0.72); // 단발
    for (const sx of [-1, 1]) add(head, new THREE.SphereGeometry(0.1, 12, 10), hair, sx * 0.27, 0.2, -0.04); // 양갈래 번
    add(head, new THREE.SphereGeometry(0.035, 8, 6), scarf, 0.2, 0.19, 0.13); // 머리핀
    add(head, new THREE.BoxGeometry(0.4, 0.07, 0.05), hair, 0, 0.11, 0.235).rotation.x = -0.25; // 앞머리
  } else {
    add(head, new THREE.SphereGeometry(0.293, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), scarf, 0, 0.03, -0.01); // 모자
    add(head, new THREE.BoxGeometry(0.32, 0.03, 0.18), scarf, 0, 0.115, 0.3).rotation.x = 0.12; // 챙
    add(head, new THREE.SphereGeometry(0.24, 14, 10), hair, 0, -0.06, -0.07).scale.set(1.04, 0.9, 0.7);
  }

  const limb = (parent, x, y, mat, r1, l1, r2, l2, isLeg) => {
    const a = new THREE.Group();
    a.position.set(x, y, 0);
    parent.add(a);
    add(a, new THREE.CapsuleGeometry(r1, l1, 4, 10), mat, 0, -(l1 / 2 + r1 * 0.6), 0);
    const b = new THREE.Group();
    b.position.y = -(l1 + r1 * 1.2);
    a.add(b);
    add(b, new THREE.CapsuleGeometry(r2, l2, 4, 10), mat, 0, -(l2 / 2 + r2 * 0.5), 0);
    if (isLeg) add(b, new THREE.BoxGeometry(0.13, 0.085, 0.24), shoe, 0, -(l2 + r2 * 1.5 + 0.02), 0.04);
    else add(b, new THREE.SphereGeometry(0.058, 10, 8), skin, 0, -(l2 + r2 * 1.6), 0);
    return { a, b };
  };
  const legMat = fem ? M(0xf0c8a8, 0.7) : pants;
  const armL = limb(upper, 0.255, 0.36, jacket, 0.058, 0.1, 0.052, 0.09, false);
  const armR = limb(upper, -0.255, 0.36, jacket, 0.058, 0.1, 0.052, 0.09, false);
  const legL = limb(body, 0.095, HIP, legMat, 0.085, 0.13, 0.075, 0.14, true);
  const legR = limb(body, -0.095, HIP, legMat, 0.085, 0.13, 0.075, 0.14, true);
  return { root, body, upper, head, armL, armR, legL, legR };
}

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = new PlayerState();
    this.gender = 'f';
    this.rig = buildCharacter(this.gender);
    this.mesh = this.rig.root;
    ctx.scene.add(this.mesh);
    this.phase = 0;
    this.visY = 0;
    this.edgeHint = 0;
    this.mode = 'walk'; // walk | bike | sit | duck | bus | busy
    this.sitLow = false; // 바닥에 앉았는지(벤치가 아니라)
    this.item = null; // 손에 든 음식
    this.eatT = 0; this.throwT = 0;
    this.onStep = null; // 발을 디딜 때(소리용)
    this._r = {}; this._f = {};
    this._pos = { x: 0, z: 0 };
    this.petT = 0; // 쓰다듬는 중
    this.waveT = 0; this.busSit = false; this.busSpeed = 0;
    this.kissT = 0; this.kneelT = 0;
    this._buildProps();
  }

  // 캐릭터 성별 바꾸기(모델을 새로 만든다)
  setGender(g) {
    if (g === this.gender) return;
    this.gender = g;
    const vis = this.mesh.visible;
    this.ctx.scene.remove(this.mesh);
    this.rig = buildCharacter(g);
    this.mesh = this.rig.root;
    this.mesh.visible = vis;
    this.ctx.scene.add(this.mesh);
    const it = this.item;
    this._buildProps();
    this.setItem(it);
    this.sync(0);
  }

  // 손에 드는 음식, 자전거, 돗자리
  _buildProps() {
    const M = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const hand = this.rig.armR.b;
    const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
    const ramen = new THREE.Group();
    ramen.add(mk(new THREE.CylinderGeometry(0.085, 0.06, 0.09, 12), M(0xf2efe6), 0, 0, 0));
    ramen.add(mk(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 12), M(0xd9642a), 0, 0.04, 0));
    const chicken = new THREE.Group();
    chicken.add(mk(new THREE.BoxGeometry(0.26, 0.09, 0.26), M(0xc9a15a), 0, 0, 0));
    chicken.add(mk(new THREE.BoxGeometry(0.2, 0.02, 0.2), M(0xb5442a), 0, 0.05, 0));
    const snack = new THREE.Group();
    snack.add(mk(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6), M(0xd8c090), 0, 0, 0));
    snack.add(mk(new THREE.CapsuleGeometry(0.035, 0.11, 4, 8), M(0xb9772e), 0, 0.09, 0));
    const rawramen = new THREE.Group();
    rawramen.add(mk(new THREE.BoxGeometry(0.2, 0.24, 0.05), M(0xd9412a), 0, 0.02, 0));
    rawramen.add(mk(new THREE.BoxGeometry(0.14, 0.08, 0.054), M(0xf2e9c8), 0, 0.04, 0));
    const drink = new THREE.Group();
    drink.add(mk(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 10), M(0x3a8ad9, 0.3), 0, 0.02, 0));
    drink.add(mk(new THREE.CylinderGeometry(0.041, 0.041, 0.05, 10), M(0xf2f2f2, 0.3), 0, 0.03, 0));
    const treat = new THREE.Group();
    treat.add(mk(new THREE.CapsuleGeometry(0.022, 0.16, 4, 8), M(0xf2c84a), 0, 0.04, 0));
    treat.add(mk(new THREE.SphereGeometry(0.026, 8, 6), M(0xd9642a), 0, 0.14, 0));
    const flower = new THREE.Group();
    flower.add(mk(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 5), M(0x5a8a3a), 0, 0.08, 0));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; const pt = mk(new THREE.SphereGeometry(0.04, 8, 6), M(0xf29ac2), Math.cos(a) * 0.05, 0.24, Math.sin(a) * 0.05); pt.scale.set(1, 0.3, 1); flower.add(pt); }
    flower.add(mk(new THREE.SphereGeometry(0.025, 8, 6), M(0xf2d23a), 0, 0.245, 0));
    const welcome = new THREE.Group(); // 웰컴드링크 잔
    welcome.add(mk(new THREE.CylinderGeometry(0.05, 0.03, 0.1, 10), M(0xf2a23a, 0.2), 0, 0.09, 0));
    welcome.add(mk(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), M(0xe8f0f2, 0.2), 0, 0.0, 0));
    welcome.add(mk(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 10), M(0xe8f0f2, 0.2), 0, -0.045, 0));
    welcome.add(mk(new THREE.SphereGeometry(0.018, 6, 5), M(0xd9412a), 0.04, 0.15, 0));
    this.items = { ramen, chicken, snack, rawramen, drink, treat, flower, welcome };
    for (const g of Object.values(this.items)) { g.position.set(0, -0.2, 0.08); g.visible = false; hand.add(g); }
    // 자전거
    this.bike = new THREE.Mesh(this.ctx.bikeGeo || new THREE.BoxGeometry(0.1, 0.1, 0.1), this.ctx.materials.bike || M(0x3a9a5a));
    this.bike.castShadow = true;
    this.bike.visible = false;
    this.mesh.add(this.bike);
    // 돗자리
    this.mat = mk(new THREE.BoxGeometry(1.7, 0.02, 1.3), M(0xd9584a, 0.9), 0, 0.02, 0.25);
    this.mat.castShadow = false; this.mat.receiveShadow = true;
    this.mat.visible = false;
    this.mesh.add(this.mat);
  }

  setItem(name) {
    this.item = name;
    for (const [k, g] of Object.entries(this.items)) g.visible = k === name;
  }

  // yHint가 있으면(다리 위 등) 그 높이 근처의 면을, 없으면 지면을 찾는다
  place(x, z, yaw = 0, yHint = null) {
    const s = this.state;
    let r = yHint !== null ? this.ctx.walk.resolve(x, z, yHint + 0.3, this._r) : { ok: false };
    if (!r.ok) r = this.ctx.walk.resolve(x, z, heightAt(x, z) + 0.3, this._r);
    if (!r.ok) return false;
    s.x = x; s.z = z; s.yaw = yaw;
    s.y = r.y; s.surface = r.kind;
    this.lastStrip = r.strip;
    this.visY = s.y;
    this.sync(0);
    return true;
  }

  _try(nx, nz, stepLen) {
    const w = this.ctx.walk, s = this.state, r = w.resolve(nx, nz, s.y, this._r);
    if (!r.ok) return false;
    // 벽·텐트·나무 같은 구조물은 통과할 수 없다(이미 겹쳐 있을 때는 빠져나올 수 있게 둔다)
    if (w.blocked(nx, nz, r.y) && !w.blocked(s.x, s.z, s.y)) return false;
    // 지면끼리 이동할 때 너무 가파른 비탈은 막는다
    if (r.kind === 'ground' && s.surface === 'ground' && Math.abs(r.y - s.y) > stepLen * 1.3 + 0.04) return false;
    // 자전거로는 계단을 오르내릴 수 없다
    if (this.mode === 'bike' && r.kind === 'strip' && r.strip.tag.endsWith('-stair')) { this.blockedStair = 1.5; return false; }
    s.x = nx; s.z = nz; s.y = r.y; s.surface = r.kind;
    this.lastStrip = r.strip;
    return true;
  }

  update(dt, input, camYaw) {
    const s = this.state;
    this.blockedStair = Math.max(0, (this.blockedStair || 0) - dt);
    const free = this.mode === 'walk' || this.mode === 'bike';
    let ix = 0, iz = 0;
    if (input && free) {
      if (input.down('KeyW') || input.down('ArrowUp')) iz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) iz -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) ix += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) ix -= 1;
    }
    const moving = ix !== 0 || iz !== 0;
    const run = moving && input && (input.down('ShiftLeft') || input.down('ShiftRight'));
    const bike = this.mode === 'bike';
    const target = moving ? (bike ? (run ? BIKE_FAST : BIKE_SPEED) : run ? RUN_SPEED : WALK_SPEED) : 0;
    s.speed = free ? damp(s.speed, target, moving ? (bike ? 2.2 : 5) : bike ? 2.5 : 10, dt) : this.mode === 'bus' ? this.busSpeed || 0 : 0;
    if (s.speed < 0.02 && !moving) s.speed = 0;

    if (moving) {
      const sn = Math.sin(camYaw), cs = Math.cos(camYaw);
      // 카메라 기준 앞(-sin,-cos), 오른쪽(cos,-sin)
      let mx = -sn * iz + cs * ix, mz = -cs * iz - sn * ix;
      const l = Math.hypot(mx, mz);
      mx /= l; mz /= l;
      if (bike && this.dirX !== undefined) {
        // 자전거는 방향을 천천히 튼다
        const cur = Math.atan2(this.dirX, this.dirZ), a = dampAngle(cur, Math.atan2(mx, mz), 4.5, dt);
        mx = Math.sin(a); mz = Math.cos(a);
      }
      this.dirX = mx; this.dirZ = mz;
      s.yaw = dampAngle(s.yaw, Math.atan2(mx, mz), bike ? 14 : 11, dt);
    }
    if (free && s.speed > 0 && this.dirX !== undefined) {
      // 빠르게 달려도 계단·난간을 건너뛰지 않도록 잘게 나눠 이동한다
      const total = s.speed * dt, n = Math.max(1, Math.ceil(total / 0.2)), step = total / n;
      for (let i = 0; i < n; i++) {
        const dx = this.dirX * step, dz = this.dirZ * step;
        if (!this._try(s.x + dx, s.z + dz, step)) {
          // 막히면 벽을 따라 미끄러진다
          const okX = this._try(s.x + dx, s.z, Math.abs(dx));
          const okZ = !okX && this._try(s.x, s.z + dz, Math.abs(dz));
          if (!okX && !okZ) { s.speed = damp(s.speed, 0, 20, dt); break; }
        }
      }
      this._edge(dt);
    }
    s.anim = this.mode !== 'walk' ? this.mode : s.speed < 0.15 ? 'idle' : s.speed > 5 ? 'run' : 'walk';
    s.mount = this.mode === 'walk' ? null : this.mode;
    this.sync(dt);
  }

  // 산책 가능 범위의 가장자리에서는 부드럽게 안쪽으로 밀어낸다
  _edge(dt) {
    const s = this.state;
    this.edgeHint = Math.max(0, this.edgeHint - dt);
    if (s.surface !== 'ground') return;
    this._pos.x = s.x; this._pos.z = s.z;
    this.ctx.walk.pushOut(this._pos);
    let px = this._pos.x - s.x, pz = this._pos.z - s.z;
    const f = sampleField(s.x, s.z, this._f);
    if (f.zone <= 1) {
      const over = f.d - (f.w - 0.6);
      if (over > 0) {
        const e = 0.6;
        const gx = sampleField(s.x + e, s.z, this._f).d - sampleField(s.x - e, s.z, this._f).d;
        const gz = sampleField(s.x, s.z + e, this._f).d - sampleField(s.x, s.z - e, this._f).d;
        const gl = Math.hypot(gx, gz) || 1;
        px -= (gx / gl) * over * 5 * dt; pz -= (gz / gl) * over * 5 * dt;
        this.edgeHint = 1.5;
      }
    }
    const m = 14;
    if (s.x < WALK_X_MIN + m) { px += (WALK_X_MIN + m - s.x) * 3 * dt; this.edgeHint = 1.5; }
    if (s.x > WALK_X_MAX - m) { px -= (s.x - (WALK_X_MAX - m)) * 3 * dt; this.edgeHint = 1.5; }
    if (px !== 0 || pz !== 0) this._try(s.x + px, s.z + pz, Math.hypot(px, pz) + 0.2);
  }

  // 상태 → 메시(애니메이션)
  sync(dt) {
    const s = this.state, g = this.rig;
    this.visY = dt > 0 ? damp(this.visY, s.y, 22, dt) : s.y;
    const bike = this.mode === 'bike', sit = this.mode === 'sit' || this.mode === 'duck' || this.mode === 'tree' || (this.mode === 'bus' && this.busSit);
    const sp = bike || sit ? 0 : s.speed;
    const runK = clamp((sp - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    const moveK = clamp(sp / WALK_SPEED, 0, 1);
    const stride = lerp(1.55, 5.6, runK);
    const before = this.phase;
    this.phase += ((bike ? s.speed * 0.5 : sp) / (bike ? 1 : stride)) * Math.PI * 2 * dt;
    // 발 디딤 이벤트(반 주기마다)
    if (!bike && sp > 0.5 && Math.floor(before / Math.PI) !== Math.floor(this.phase / Math.PI) && this.onStep) this.onStep(runK);
    const ph = this.phase, sn = Math.sin(ph), cs = Math.cos(ph);
    const t = this.ctx.uniforms.uTime.value;

    const legA = lerp(0.52, 0.95, runK) * moveK;
    const knee = lerp(0.75, 1.5, runK) * moveK;
    g.legL.a.rotation.x = -sn * legA;
    g.legR.a.rotation.x = sn * legA;
    g.legL.b.rotation.x = Math.max(0, cs) * knee + 0.06 * moveK;
    g.legR.b.rotation.x = Math.max(0, -cs) * knee + 0.06 * moveK;
    const armA = lerp(0.42, 0.9, runK) * moveK;
    const idle = (1 - moveK) * Math.sin(t * 1.3) * 0.03;
    g.armL.a.rotation.x = sn * armA + idle;
    g.armR.a.rotation.x = -sn * armA - idle;
    g.armL.a.rotation.z = 0.07; g.armR.a.rotation.z = -0.07;
    const elbow = lerp(0.2, 1.35, runK) * moveK + 0.08;
    g.armL.b.rotation.x = -(elbow + Math.max(0, -sn) * 0.3 * moveK);
    g.armR.b.rotation.x = -(elbow + Math.max(0, sn) * 0.3 * moveK);
    g.upper.rotation.x = lerp(0.03, 0.2, runK) * moveK;
    g.upper.rotation.y = sn * 0.09 * moveK;
    g.upper.rotation.z = Math.sin(t * 0.9) * 0.008 * (1 - moveK);
    g.head.rotation.y = -sn * 0.05 * moveK;
    g.head.rotation.x = -lerp(0.0, 0.1, runK) * moveK;
    g.body.position.y = (Math.cos(ph * 2) * lerp(0.018, 0.045, runK) - lerp(0.01, 0.03, runK)) * moveK + (1 - moveK) * Math.sin(t * 1.3) * 0.004;
    g.body.rotation.z = cs * 0.025 * moveK;

    // 자세: 앉기 / 자전거
    this.bike.visible = bike;
    this.mat.visible = this.mode === 'sit' && this.sitLow;
    if (sit) {
      const low = this.mode === 'sit' && this.sitLow;
      g.body.position.y = low ? -0.42 : this.mode === 'duck' ? 0.05 : -0.07;
      g.legL.a.rotation.x = g.legR.a.rotation.x = low ? -1.35 : -1.5;
      g.legL.b.rotation.x = g.legR.b.rotation.x = low ? 0.5 : 1.45;
      g.armL.a.rotation.x = g.armR.a.rotation.x = -0.35;
      g.armL.b.rotation.x = g.armR.b.rotation.x = -0.5;
      g.upper.rotation.x = low ? 0.1 : 0.02;
    } else if (bike) {
      g.body.position.y = 0.36;
      g.legL.a.rotation.x = -1.0 - 0.42 * sn; g.legR.a.rotation.x = -1.0 + 0.42 * sn;
      g.legL.b.rotation.x = 1.15 + 0.4 * cs; g.legR.b.rotation.x = 1.15 - 0.4 * cs;
      g.armL.a.rotation.x = g.armR.a.rotation.x = -0.95;
      g.armL.b.rotation.x = g.armR.b.rotation.x = -0.25;
      g.upper.rotation.x = 0.42; g.upper.rotation.y = 0;
      g.head.rotation.x = -0.3;
    }
    // 들고 있는 음식·먹기·던지기
    if (this.item && !bike) { g.armR.a.rotation.x = -0.55; g.armR.b.rotation.x = -1.0; }
    if (this.eatT > 0) {
      const k = 0.5 + 0.5 * Math.sin(t * 2.6);
      g.armR.a.rotation.x = lerp(-0.55, -1.15, k); g.armR.b.rotation.x = lerp(-1.0, -1.75, k);
      g.head.rotation.x = 0.12 * k;
    }
    g.armL.a.rotation.z = g.armR.a.rotation.z = 0;
    if (this.kissT > 0) { // 뽀뽀: 몸을 살짝 내밀고 까치발
      this.kissT = Math.max(0, this.kissT - dt);
      const k = Math.sin(Math.min(1, (1.6 - this.kissT) / 0.5) * Math.PI * 0.5) * Math.min(1, this.kissT / 0.3);
      g.upper.rotation.x = 0.32 * k; g.head.rotation.x = -0.12 * k;
      g.armL.a.rotation.x = g.armR.a.rotation.x = -0.7 * k; g.armL.a.rotation.z = -0.25 * k; g.armR.a.rotation.z = 0.25 * k;
      g.body.position.y += 0.04 * k;
    }
    if (this.kneelT > 0) { // 한쪽 무릎을 꿇고 꽃을 내민다
      this.kneelT = Math.max(0, this.kneelT - dt);
      g.body.position.y = -0.2;
      g.legL.a.rotation.x = -1.45; g.legL.b.rotation.x = 1.45;
      g.legR.a.rotation.x = 0.15; g.legR.b.rotation.x = 1.5;
      g.upper.rotation.x = 0.05;
      g.armR.a.rotation.x = -1.35 + Math.sin(t * 3) * 0.05; g.armR.b.rotation.x = -0.15;
      g.armL.a.rotation.x = 0.3; g.head.rotation.x = -0.2;
    }
    if (this.waveT > 0) { // 인사: 한 손을 번쩍 들어 흔든다
      this.waveT = Math.max(0, this.waveT - dt);
      g.armL.a.rotation.x = -2.7; g.armL.a.rotation.z = 0.35 + Math.sin(t * 11) * 0.3; g.armL.b.rotation.x = -0.2;
      g.head.rotation.z = Math.sin(t * 5.5) * 0.08;
    } else g.head.rotation.z = 0;
    if (this.petT > 0) { // 쓰다듬기: 몸을 숙이고 손을 흔든다
      this.petT = Math.max(0, this.petT - dt);
      g.upper.rotation.x = 0.75;
      g.body.position.y = -0.16;
      g.legL.a.rotation.x = g.legR.a.rotation.x = -0.9; g.legL.b.rotation.x = g.legR.b.rotation.x = 1.5;
      g.armR.a.rotation.x = -1.1 + Math.sin(t * 9) * 0.25; g.armR.b.rotation.x = -0.3;
      g.head.rotation.x = -0.3;
    }
    if (this.throwT > 0) {
      this.throwT = Math.max(0, this.throwT - dt);
      const k = 1 - this.throwT / 0.55; // 0→1
      const a = k < 0.45 ? lerp(0, 1.5, k / 0.45) : lerp(1.5, -1.3, (k - 0.45) / 0.55);
      g.armR.a.rotation.x = a; g.armR.b.rotation.x = -0.4;
      g.upper.rotation.y = k < 0.45 ? -0.35 * (k / 0.45) : lerp(-0.35, 0.4, (k - 0.45) / 0.55);
      g.upper.rotation.x = 0.25;
    }

    this.mesh.position.set(s.x, this.visY, s.z);
    this.mesh.rotation.y = s.yaw;
  }
}
