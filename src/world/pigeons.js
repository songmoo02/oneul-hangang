// 비둘기: 산책로와 광장을 걸어 다니다가, 누가 뛰어오면 한꺼번에 날아오른다.
// 이스터에그: 여의도 광장의 "비둘기 할아버지"는 비둘기 떼에게 모이를 주고, 휘파람 한 번에 하늘을 한 바퀴 돌게 한다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, lerp } from '../core/math.js';
import { injectedMaterial } from './grass.js';
import { bankN, bankS, heightAt, PLAZA_POINTS } from './field.js';
import { WALK_X_MIN, WALK_X_MAX } from './geo.js';

function pigeonGeometry() {
  const tag = (g, part, col) => {
    const n = g.attributes.position.count, a = new Float32Array(n), c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i] = part; c.set(col, i * 3); }
    g.setAttribute('aPart', new THREE.BufferAttribute(a, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv');
    return g;
  };
  const S = (r, sx, sy, sz, x, y, z) => new THREE.SphereGeometry(r, 7, 5).scale(sx, sy, sz).translate(x, y, z);
  const grey = [0.33, 0.35, 0.4], dark = [0.16, 0.17, 0.2];
  return mergeGeometries([
    tag(S(0.085, 0.85, 0.8, 1.45, 0, 0.13, 0), 0, grey),
    tag(S(0.05, 1, 1, 1, 0, 0.235, 0.1), 3, [0.2, 0.32, 0.3]), // 머리(목덜미 초록빛)
    tag(new THREE.ConeGeometry(0.014, 0.045, 4).rotateX(Math.PI / 2).translate(0, 0.232, 0.165), 3, [0.75, 0.55, 0.4]),
    tag(S(0.011, 1, 1, 0.5, 0.03, 0.245, 0.135), 3, [0.9, 0.35, 0.1]), tag(S(0.011, 1, 1, 0.5, -0.03, 0.245, 0.135), 3, [0.9, 0.35, 0.1]),
    tag(new THREE.BoxGeometry(0.09, 0.015, 0.12).translate(0, 0.13, -0.16), 0, dark),
    tag(new THREE.BoxGeometry(0.2, 0.012, 0.13).translate(0.13, 0.16, -0.01), 1, dark),
    tag(new THREE.BoxGeometry(0.2, 0.012, 0.13).translate(-0.13, 0.16, -0.01), 2, dark),
    tag(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 4).translate(0.03, 0.035, 0), 4, [0.8, 0.35, 0.3]),
    tag(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 4).translate(-0.03, 0.035, 0), 4, [0.8, 0.35, 0.3]),
  ]);
}

function buildGrandpa() {
  const M = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const g = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const skin = M(0xe8c0a0), vest = M(0x8a7a5a), shirt = M(0xe8e2d2), pants = M(0x4a4a50), hair = M(0xd8d8d8), dark = M(0x1c1a1a);
  for (const x of [-0.09, 0.09]) { add(g, new THREE.CapsuleGeometry(0.075, 0.26, 3, 8), pants, x, 0.28, 0); add(g, new THREE.BoxGeometry(0.12, 0.08, 0.22), dark, x, 0.04, 0.03); }
  add(g, new THREE.CapsuleGeometry(0.18, 0.2, 4, 10), shirt, 0, 0.7, 0).scale.set(1.1, 1, 0.9);
  add(g, new THREE.CapsuleGeometry(0.19, 0.14, 4, 10), vest, 0, 0.7, -0.01).scale.set(1.12, 0.9, 0.86);
  const head = new THREE.Group(); head.position.set(0, 1.17, 0.03); g.add(head);
  add(head, new THREE.SphereGeometry(0.25, 14, 10), skin, 0, 0, 0);
  add(head, new THREE.SphereGeometry(0.262, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), M(0x6a5a44), 0, 0.03, -0.01); // 헌팅캡
  add(head, new THREE.BoxGeometry(0.3, 0.03, 0.14), M(0x6a5a44), 0, 0.1, 0.27);
  add(head, new THREE.SphereGeometry(0.235, 12, 8), hair, 0, -0.05, -0.06).scale.set(1.05, 0.8, 0.75);
  add(head, new THREE.SphereGeometry(0.09, 8, 6), hair, 0, -0.14, 0.2).scale.set(1.5, 0.7, 0.6); // 흰 수염
  for (const x of [-0.095, 0.095]) add(head, new THREE.SphereGeometry(0.028, 6, 5), dark, x, -0.01, 0.228).scale.set(1, 0.6, 0.5);
  const armL = new THREE.Group(); armL.position.set(0.26, 0.9, 0); g.add(armL);
  add(armL, new THREE.CapsuleGeometry(0.05, 0.24, 3, 6), shirt, 0, -0.16, 0); add(armL, new THREE.SphereGeometry(0.055, 6, 5), skin, 0, -0.34, 0);
  const armR = new THREE.Group(); armR.position.set(-0.26, 0.9, 0); g.add(armR);
  add(armR, new THREE.CapsuleGeometry(0.05, 0.24, 3, 6), shirt, 0, -0.16, 0); add(armR, new THREE.SphereGeometry(0.055, 6, 5), skin, 0, -0.34, 0);
  add(armR, new THREE.BoxGeometry(0.16, 0.2, 0.1), M(0xb89a5a), 0, -0.42, 0.04); // 모이 봉지
  return { g, armL, armR, head };
}

export function buildPigeons(ctx) {
  const rnd = mulberry32(4242), o = {};
  const flocks = [];
  const mkFlock = (x, z, n, r, opts = {}) => {
    const y = heightAt(x, z);
    const fl = { x, z, y, r, birds: [], state: 'ground', t: 0, calm: 0, ...opts };
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * r; fl.birds.push({ fl, x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, y, yaw: rnd() * 6.283, tx: 0, tz: 0, t: rnd() * 3, walk: false, peck: 0, ph: rnd() * 6.283, fly: 0, fa: rnd() * 6.283, fr: 5 + rnd() * 5, fh: 5 + rnd() * 4, scale: 0.9 + rnd() * 0.3, cool: 0, tamed: false }); }
    flocks.push(fl);
    return fl;
  };
  // 산책로(강에서 7~8.5m 띠) 곳곳과 광장
  for (const bank of [bankN, bankS]) {
    const north = bank === bankN;
    for (let i = 0; i < 12; i++) {
      bank.at(bank.uAtX(lerp(WALK_X_MIN + 60, WALK_X_MAX - 60, (i + rnd()) / 12)), o);
      const nx = north ? o.tz : -o.tz, nz = north ? -o.tx : o.tx, d = 6.6 + rnd() * 2.4;
      const x = o.x + nx * d, z = o.z + nz * d;
      if (ctx.nearBridge(x, z, 3)) continue;
      mkFlock(x, z, 6 + Math.floor(rnd() * 7), 2.6);
    }
  }
  for (const pl of PLAZA_POINTS) mkFlock(pl.x + 7, pl.z - 6, 12, 4);
  // 비둘기 할아버지(여의도 물빛광장 옆)
  const gp = { x: PLAZA_POINTS[0].x - 13, z: PLAZA_POINTS[0].z - 9 };
  gp.y = heightAt(gp.x, gp.z);
  const gflock = mkFlock(gp.x, gp.z + 1.6, 46, 3.4, { grandpa: true });
  const gpa = buildGrandpa();
  gpa.g.position.set(gp.x, gp.y, gp.z);
  ctx.scene.add(gpa.g);
  ctx.walk.addCircle(gp.x, gp.z, 0.3);

  const birds = flocks.flatMap((f) => f.birds), N = birds.length;
  const base = pigeonGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aPart', 'aCol']) geo.setAttribute(k, base.getAttribute(k));
  geo.setIndex(base.getIndex());
  const aXf = new Float32Array(N * 4), aAn = new Float32Array(N * 4);
  const xf = new THREE.InstancedBufferAttribute(aXf, 4).setUsage(THREE.DynamicDrawUsage), an = new THREE.InstancedBufferAttribute(aAn, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aXf', xf); geo.setAttribute('aAn', an);
  geo.instanceCount = N;
  const mat = injectedMaterial(ctx, {
    uniforms: {},
    vertPre: 'attribute float aPart; attribute vec3 aCol; attribute vec4 aXf, aAn; varying vec3 vPCol;',
    vertMain: /* glsl */ `
      vec3 pp = position; float fly = aAn.y;
      if (aPart > 0.5 && aPart < 2.5) { // 날개: 땅에서는 접고, 날 때는 퍼덕인다
        float sg = aPart < 1.5 ? 1.0 : -1.0;
        pp.x = mix(sg * 0.05 + (pp.x - sg * 0.05) * 0.2, pp.x * 1.5, fly);
        float a = fly * 0.95 * sin(uTime * 24.0 + aAn.x) * sg;
        vec2 q = pp.xy - vec2(sg * 0.04, 0.16); float c = cos(a), s = sin(a);
        pp.xy = vec2(q.x * c - q.y * s, q.x * s + q.y * c) + vec2(sg * 0.04, 0.16);
      }
      if (aPart > 2.5 && aPart < 3.5) { pp.z += sin(aAn.x) * 0.018 * (1.0 - fly); pp.y -= aAn.w * 0.13; pp.z += aAn.w * 0.04; } // 머리 까딱, 모이 쪼기
      if (aPart > 3.5) pp.y = mix(pp.y, 0.1, fly);
      float cy = cos(aXf.w), sy = sin(aXf.w);
      vec3 gPos = vec3(pp.x * cy + pp.z * sy, pp.y, -pp.x * sy + pp.z * cy) * aAn.z + aXf.xyz;
      vec3 objectNormal = vec3(normal.x * cy + normal.z * sy, normal.y, -normal.x * sy + normal.z * cy);
      vPCol = aCol;
    `,
    fragPre: 'varying vec3 vPCol;', fragColor: 'diffuseColor.rgb = vPCol;', roughness: 0.8, side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = true;
  ctx.scene.add(mesh);

  let scanT = 0, showT = 14, greeted = false;
  const scare = (fl, why) => { if (fl.state !== 'ground') return; fl.state = 'fly'; fl.t = 0; fl.calm = fl.grandpa && why === 'show' ? 6.5 : 9 + Math.random() * 6; fl.show = why === 'show'; if (api.onFlap) api.onFlap(fl, why); };
  const api = {
    count: N, flocks, grandpa: gp, tamed: 0, onFlap: null, onCoo: null,
    // 걸어서 다가갈 수 있는 가장 가까운 비둘기
    near(x, z, y, r = 1.7) {
      let best = null, bd = r;
      for (const fl of flocks) {
        if (fl.state !== 'ground' || Math.hypot(fl.x - x, fl.z - z) > fl.r + 6 || Math.abs(fl.y - y) > 2) continue;
        for (const b of fl.birds) { if (b.tamed || b.cool > 0) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
      }
      return best;
    },
    // 길들이기: 5% 확률로 성공하면 어깨에 올라앉아 따라다닌다
    tame(b) {
      b.cool = 25;
      if (Math.random() < 0.05) { b.tamed = true; api.tamed++; return true; }
      b.t = 0; b.walk = true; const a = Math.random() * 6.283; b.tx = b.fl.x + Math.cos(a) * b.fl.r; b.tz = b.fl.z + Math.sin(a) * b.fl.r;
      return false;
    },
    show() { showT = 0; },
    update(dt, env, player, npcs) {
      const ps = player.state, px = ps.x, pz = ps.z, t = ctx.uniforms.uTime.value;
      const rain = env.weather.cur.rain > 0.3, night = env.night > 0.7;
      // 뛰어오는 사람(플레이어·러너·자전거)이 있으면 날아오른다
      scanT -= dt;
      const scan = scanT <= 0; if (scan) scanT = 0.25;
      for (const fl of flocks) {
        const dp = Math.hypot(fl.x - px, fl.z - pz);
        if (fl.state === 'ground') {
          if (dp < fl.r + 4.5 && ps.speed > 4.2 && Math.abs(ps.y - fl.y) < 2) scare(fl, 'player');
          else if (scan && !fl.grandpa && dp < 160) {
            for (const n of npcs.list) { if (n.vis > 0.5 && (n.kind === 'run' || n.kind === 'bike') && Math.abs(n.x - fl.x) < fl.r + 1.5 && Math.abs(n.z - fl.z) < fl.r + 1.5) { scare(fl, 'npc'); break; } }
          }
        } else {
          fl.t += dt;
          if (fl.t > fl.calm && !(dp < fl.r + 4 && ps.speed > 4.2)) { fl.state = 'land'; fl.t = 0; }
          if (fl.state === 'land' && fl.t > 2.2) fl.state = 'ground';
        }
      }
      // 할아버지: 가끔 팔을 들어 휘파람을 불면 비둘기들이 한 바퀴 돌고 돌아온다
      showT -= dt;
      const gd = Math.hypot(gp.x - px, gp.z - pz);
      if (showT <= 0) { showT = 26 + Math.random() * 14; if (gflock.state === 'ground' && !rain && !night) { scare(gflock, 'show'); gpa.raise = 2.2; } }
      gpa.raise = Math.max(0, (gpa.raise || 0) - dt);
      gpa.armL.rotation.x = gpa.raise > 0 ? -2.8 : -0.2;
      gpa.armR.rotation.x = -0.9 + Math.sin(t * 2.2) * 0.25; // 모이를 뿌리는 손
      gpa.g.rotation.y = gd < 9 ? Math.atan2(px - gp.x, pz - gp.z) : Math.sin(t * 0.3) * 0.5;
      gpa.g.visible = mesh.visible = true;
      gpa.g.visible = !rain && !night;
      if (gd < 7 && !greeted && gpa.g.visible) { greeted = true; if (api.onMeet) api.onMeet(); }

      for (let i = 0; i < N; i++) {
        const b = birds[i], fl = b.fl;
        b.cool = Math.max(0, b.cool - dt);
        let peck = 0;
        if (b.tamed) { // 어깨 위
          const yaw = ps.yaw; b.x = px - Math.cos(yaw) * 0.27; b.z = pz + Math.sin(yaw) * 0.27; b.y = player.visY + 0.98; b.yaw = yaw; b.fly = 0;
        } else if (fl.state === 'ground') {
          b.fly = Math.max(0, b.fly - dt * 3);
          b.t -= dt;
          if (b.t <= 0) {
            b.walk = Math.random() < 0.6; b.t = 1 + Math.random() * 3.5;
            const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * fl.r;
            b.tx = fl.x + Math.cos(a) * rr; b.tz = fl.z + Math.sin(a) * rr;
          }
          const dx = b.tx - b.x, dz = b.tz - b.z, dl = Math.hypot(dx, dz);
          if (b.walk && dl > 0.1) { const st = 0.4 * dt; b.x += (dx / dl) * st; b.z += (dz / dl) * st; b.yaw = Math.atan2(dx, dz); b.ph += dt * 14; }
          else peck = Math.max(0, Math.sin(t * 5 + b.fa * 3)) * (fl.grandpa ? 1 : 0.7);
          // 걸어오는 사람에게서는 살짝 비켜난다
          const pd = Math.hypot(b.x - px, b.z - pz);
          if (pd < 0.7 && pd > 0.01) { b.x += ((b.x - px) / pd) * dt * 1.5; b.z += ((b.z - pz) / pd) * dt * 1.5; }
          b.y = fl.y;
        } else {
          // 날기: 떼 중심을 돌며 올라갔다가, 내려앉을 때는 제자리로 돌아온다
          const land = fl.state === 'land', k = land ? 1 - Math.min(1, fl.t / 2.2) : Math.min(1, fl.t / 1.6);
          b.fly = Math.min(1, b.fly + dt * 5);
          b.fa += dt * (fl.show ? 1.5 : 1.1 + (b.fr % 1) * 0.5);
          const r = (fl.show ? 7 : b.fr) * k, hx = fl.x + Math.cos(b.fa) * r, hz = fl.z + Math.sin(b.fa) * r;
          const gx = fl.x + Math.cos(b.fa * 7.3) * fl.r * 0.7, gz = fl.z + Math.sin(b.fa * 5.1) * fl.r * 0.7;
          const nx = lerp(land ? gx : b.x, hx, land ? k : Math.min(1, dt * 4)), nz = lerp(land ? gz : b.z, hz, land ? k : Math.min(1, dt * 4));
          b.yaw = Math.atan2(nx - b.x, nz - b.z); b.x = nx; b.z = nz;
          b.y = fl.y + (fl.show ? 5.5 : b.fh) * k * k * (3 - 2 * k) + Math.sin(t * 2 + b.fa) * 0.3 * k;
          if (land && k <= 0.02) b.fly = 0;
        }
        const k4 = i * 4, hide = (rain || night) && !b.tamed && Math.hypot(b.x - px, b.z - pz) > 30;
        aXf[k4] = b.x; aXf[k4 + 1] = b.y; aXf[k4 + 2] = b.z; aXf[k4 + 3] = b.yaw;
        aAn[k4] = b.ph; aAn[k4 + 1] = b.fly; aAn[k4 + 2] = hide ? 0 : b.scale; aAn[k4 + 3] = peck;
      }
      xf.needsUpdate = true; an.needsUpdate = true;
    },
  };
  return api;
}
