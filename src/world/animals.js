// 동물과 작은 생명들: 비둘기·까치 무리(다가가면 날아오름), 밤섬의 백로, 수면 위로 튀는 물고기, 가로등 날벌레, 밤하늘 비행기.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, lerp, clamp, smoothstep } from '../core/math.js';
import { injectedMaterial } from './grass.js';
import { sampleField, heightAt, isGroundWalkable, PLAZA_POINTS, ISLANDS, ZONE, bankN, bankS } from './field.js';
import { WALK_X_MIN, WALK_X_MAX } from './geo.js';

function part(geo, id, col, x, y, z, sx = 1, sy = 1, sz = 1) {
  geo.scale(sx, sy, sz); geo.translate(x, y, z);
  const n = geo.attributes.position.count, a = new Float32Array(n * 4), c = new THREE.Color(col);
  for (let i = 0; i < n; i++) a.set([id, c.r, c.g, c.b], i * 4);
  geo.setAttribute('aPC', new THREE.BufferAttribute(a, 4));
  geo.deleteAttribute('uv');
  return geo;
}

function birdGeometry() {
  const wing = () => { const g = new THREE.BoxGeometry(0.34, 0.015, 0.16); g.translate(0.17, 0, 0); return g; };
  const wr = wing(); wr.scale(-1, 1, 1);
  // BoxGeometry를 뒤집으면 면 방향이 바뀌므로 양면 재질로 그린다
  return mergeGeometries([
    part(new THREE.SphereGeometry(0.09, 8, 6), 0, 0xffffff, 0, 0.1, 0, 0.8, 0.8, 1.6),
    part(new THREE.SphereGeometry(0.05, 6, 5), 0, 0xcccccc, 0, 0.19, 0.13),
    part(new THREE.ConeGeometry(0.015, 0.05, 4).rotateX(Math.PI / 2), 0, 0x8a6a2a, 0, 0.18, 0.2),
    part(new THREE.BoxGeometry(0.07, 0.012, 0.14), 0, 0x888888, 0, 0.1, -0.2),
    part(wing(), 1, 0xdddddd, 0.04, 0.13, 0),
    part(wr, 2, 0xdddddd, -0.04, 0.13, 0),
  ]);
}

function heronGeometry() {
  return mergeGeometries([
    part(new THREE.SphereGeometry(0.2, 8, 6), 0, 0xffffff, 0, 0.75, 0, 0.75, 0.8, 1.5),
    part(new THREE.CylinderGeometry(0.03, 0.045, 0.55, 6), 3, 0xffffff, 0, 1.1, 0.24),
    part(new THREE.SphereGeometry(0.06, 6, 5), 3, 0xffffff, 0, 1.4, 0.27, 1, 1, 1.3),
    part(new THREE.ConeGeometry(0.02, 0.2, 4).rotateX(Math.PI / 2), 3, 0xd9a02a, 0, 1.4, 0.44),
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), 0, 0x2a2a2a, 0.05, 0.3, 0),
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), 0, 0x2a2a2a, -0.05, 0.3, 0),
  ]);
}

const BIRD_PRE = /* glsl */ `
attribute vec4 aPC; // 부위, 색
attribute vec4 aXf; // 위치, 방향
attribute vec4 aAn; // 날갯짓 위상, 날갯짓 크기(0 접음), 크기, 색 농도
varying vec3 vGCol;
`;
const BIRD_MAIN = /* glsl */ `
  vec3 bp = position, bn = normal;
  float bPart = aPC.x;
  if (bPart > 0.5 && bPart < 2.5) {
    float sg = bPart < 1.5 ? 1.0 : -1.0;
    // 접었을 때는 몸에 붙이고, 날 때는 위아래로 친다
    float ang = mix(-1.25 * sg, sg * sin(aAn.x) * 0.95, aAn.y);
    float c = cos(ang), s = sin(ang);
    bp.y -= 0.13;
    bp.xy = vec2(bp.x * c - bp.y * s, bp.x * s + bp.y * c);
    bp.y += 0.13;
    bn.xy = vec2(bn.x * c - bn.y * s, bn.x * s + bn.y * c);
  } else if (bPart > 2.5) {
    bp.z += sin(uTime * 0.7 + aXf.x) * 0.03; // 백로가 목을 까딱인다
  } else {
    bp.y += (1.0 - aAn.y) * abs(sin(aAn.x * 0.5)) * 0.015;
  }
  float cy = cos(aXf.w), sy = sin(aXf.w);
  vec3 gPos = vec3(bp.x * cy + bp.z * sy, bp.y, -bp.x * sy + bp.z * cy) * aAn.z + aXf.xyz;
  vec3 objectNormal = vec3(bn.x * cy + bn.z * sy, bn.y, -bn.x * sy + bn.z * cy);
  vGCol = aPC.yzw * aAn.w;
`;

function instanced(ctx, baseGeo, n) {
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aPC']) g.setAttribute(k, baseGeo.getAttribute(k));
  g.setIndex(baseGeo.getIndex());
  const xf = new Float32Array(n * 4), an = new Float32Array(n * 4);
  const xa = new THREE.InstancedBufferAttribute(xf, 4).setUsage(THREE.DynamicDrawUsage);
  const aa = new THREE.InstancedBufferAttribute(an, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aXf', xa); g.setAttribute('aAn', aa);
  g.instanceCount = n;
  const mat = injectedMaterial(ctx, { uniforms: {}, vertPre: BIRD_PRE, vertMain: BIRD_MAIN, fragPre: 'varying vec3 vGCol;', fragColor: 'diffuseColor.rgb = vGCol;', roughness: 0.8 });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  ctx.scene.add(m);
  return { m, xf, an, xa, aa };
}

export function buildAnimals(ctx, ripples) {
  const rnd = mulberry32(31337);
  const f = {};

  // ── 비둘기·까치 무리
  const flocks = [];
  const spots = PLAZA_POINTS.map((p) => [p.x + 4, p.z + 3]);
  const o = {};
  for (const bank of [bankN, bankS]) {
    const north = bank === bankN;
    for (let i = 0; i < 10; i++) {
      const x = lerp(WALK_X_MIN + 150, WALK_X_MAX - 150, rnd());
      bank.at(bank.uAtX(x), o);
      const d = 7.5 + rnd() * 3;
      spots.push([o.x + (north ? o.tz : -o.tz) * d, o.z + (north ? -o.tx : o.tx) * d]);
    }
  }
  const birds = [];
  spots.forEach(([x, z], fi) => {
    const magpie = fi % 3 === 2;
    const fl = { x, z, state: 'ground', t: 0, dur: 0, fx: x, fz: z, tx: x, tz: z, magpie, birds: [] };
    const n = magpie ? 3 : 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, r = rnd() * 2.6;
      const b = { fl, ox: Math.cos(a) * r, oz: Math.sin(a) * r, x: 0, y: 0, z: 0, yaw: rnd() * 6.28, ph: rnd() * 6, hop: rnd() * 4, delay: rnd() * 0.7, shade: magpie ? 0.12 : 0.28 + rnd() * 0.3, scale: magpie ? 1.25 : 1 };
      fl.birds.push(b); birds.push(b);
    }
    flocks.push(fl);
  });
  const B = instanced(ctx, birdGeometry(), birds.length);

  const relocate = (fl) => {
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * 6.28, r = 26 + Math.random() * 34;
      const x = fl.x + Math.cos(a) * r, z = fl.z + Math.sin(a) * r;
      sampleField(x, z, f);
      if (f.zone <= 1 && isGroundWalkable(f) && f.d > 5.5 && f.d < f.w - 3 && x > WALK_X_MIN + 20 && x < WALK_X_MAX - 20 && !ctx.nearBridge(x, z, 3)) return [x, z];
    }
    return [fl.x, fl.z];
  };

  // ── 백로(밤섬 물가)와 밤섬 위를 도는 새
  const herons = [];
  for (const isl of ISLANDS) {
    if (isl.zone !== ZONE.BAMSEOM) continue;
    const p = {};
    for (let i = 0; i < 14; i++) {
      isl.poly.at(rnd() * isl.poly.total, p);
      const nx = -p.tz * isl.poly.orient, nz = p.tx * isl.poly.orient;
      const x = p.x + nx * 1.4, z = p.z + nz * 1.4;
      herons.push({ x, y: Math.max(heightAt(x, z), -0.25), z, yaw: rnd() * 6.28, s: 0.9 + rnd() * 0.4 });
    }
  }
  const H = instanced(ctx, heronGeometry(), herons.length);
  herons.forEach((h, i) => { H.xf.set([h.x, h.y, h.z, h.yaw], i * 4); H.an.set([0, 0, h.s, 1], i * 4); });
  H.xa.needsUpdate = true; H.aa.needsUpdate = true;
  const bam = ISLANDS.find((i) => i.zone === ZONE.BAMSEOM).poly;
  const soar = [0, 1, 2, 3].map((i) => ({ a: i * 1.7, r: 40 + i * 14, h: 14 + i * 4, sp: 0.09 + i * 0.015 }));
  const S = instanced(ctx, birdGeometry(), soar.length);

  // ── 물고기
  const fish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0xb8c2c8, metalness: 0.7, roughness: 0.3 }));
  fish.scale.set(0.45, 0.8, 2.2);
  fish.visible = false;
  ctx.scene.add(fish);
  const jump = { t: 0, wait: 6, x: 0, z: 0, yaw: 0 };

  // ── 가로등 날벌레
  const BUGS = 96;
  const bugPos = new Float32Array(BUGS * 3), bugSeed = new Float32Array(BUGS * 4);
  for (let i = 0; i < BUGS * 4; i++) bugSeed[i] = rnd();
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bugPos, 3).setUsage(THREE.DynamicDrawUsage));
  const bugs = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xfff0c8, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false }));
  bugs.frustumCulled = false;
  bugs.layers.set(1);
  ctx.scene.add(bugs);
  const nearLamps = [];
  let lampT = 0;

  // ── 비행기 불빛
  const pg = new THREE.BufferGeometry();
  const planePos = new Float32Array(6);
  pg.setAttribute('position', new THREE.BufferAttribute(planePos, 3).setUsage(THREE.DynamicDrawUsage));
  pg.setAttribute('color', new THREE.Float32BufferAttribute([3, 3, 3, 4, 0.3, 0.2], 3));
  const plane = new THREE.Points(pg, new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
  plane.frustumCulled = false;
  plane.visible = false;
  ctx.scene.add(plane);
  const fly = { t: -1, wait: 25, x0: 0, z0: 0, dx: 0, dz: 0 };

  return {
    birdCount: birds.length,
    takeoff: null, // 날아오를 때 소리용 콜백
    update(dt, env, player) {
      const t = ctx.uniforms.uTime.value, ps = player.state;
      const night = env.night;
      // 무리
      for (const fl of flocks) {
        if (fl.state === 'ground') {
          const d = Math.hypot(fl.x - ps.x, fl.z - ps.z);
          if (d < 5.2 && Math.abs(ps.y - heightAt(fl.x, fl.z)) < 2 && (ps.speed > 0.4 || d < 2.5)) {
            fl.state = 'fly'; fl.t = 0; fl.dur = 4.2 + Math.random();
            fl.fx = fl.x; fl.fz = fl.z;
            [fl.tx, fl.tz] = relocate(fl);
            if (this.takeoff && d < 12) this.takeoff();
          }
        } else {
          fl.t += dt;
          if (fl.t > fl.dur + 0.8) { fl.state = 'ground'; fl.x = fl.tx; fl.z = fl.tz; }
        }
      }
      birds.forEach((b, i) => {
        const fl = b.fl;
        let flap = 0;
        if (fl.state === 'ground') {
          b.hop -= dt;
          if (b.hop <= 0) { b.hop = 1 + Math.random() * 4; const a = Math.random() * 6.28, r = Math.random() * 2.6; b.ox = Math.cos(a) * r; b.oz = Math.sin(a) * r; }
          const gx = fl.x + b.ox, gz = fl.z + b.oz;
          const dx = gx - b.x, dz = gz - b.z, dl = Math.hypot(dx, dz);
          if (dl > 30) { b.x = gx; b.z = gz; } else if (dl > 0.05) { const st = Math.min(dl, 0.7 * dt); b.x += (dx / dl) * st; b.z += (dz / dl) * st; b.yaw = Math.atan2(dx, dz); b.ph += dt * 14; }
          b.y = heightAt(b.x, b.z);
        } else {
          const k = clamp((fl.t - b.delay) / fl.dur, 0, 1), e = k * k * (3 - 2 * k);
          const sx = fl.fx + b.ox, sz = fl.fz + b.oz, ex = fl.tx + b.ox, ez = fl.tz + b.oz;
          const nx = lerp(sx, ex, e) + Math.sin(k * 6 + b.ph) * 1.2 * Math.sin(k * Math.PI), nz = lerp(sz, ez, e) + Math.cos(k * 5 + b.ph) * 1.2 * Math.sin(k * Math.PI);
          if (k > 0 && k < 1) b.yaw = Math.atan2(nx - b.x, nz - b.z);
          b.x = nx; b.z = nz;
          b.y = lerp(heightAt(sx, sz), heightAt(ex, ez), e) + Math.sin(k * Math.PI) * (6 + b.delay * 5);
          flap = k > 0 && k < 1 ? 1 : 0;
          b.ph += dt * 22;
        }
        const k4 = i * 4;
        B.xf[k4] = b.x; B.xf[k4 + 1] = b.y; B.xf[k4 + 2] = b.z; B.xf[k4 + 3] = b.yaw;
        B.an[k4] = b.ph; B.an[k4 + 1] = flap; B.an[k4 + 2] = b.scale * (night > 0.8 ? 0 : 1); B.an[k4 + 3] = b.shade;
      });
      B.xa.needsUpdate = true; B.aa.needsUpdate = true;
      // 밤섬 위를 도는 새
      soar.forEach((s, i) => {
        s.a += s.sp * dt;
        const k4 = i * 4;
        S.xf[k4] = bam.cx + Math.cos(s.a) * s.r; S.xf[k4 + 1] = s.h + Math.sin(s.a * 3) * 1.5; S.xf[k4 + 2] = bam.cz + Math.sin(s.a) * s.r * 0.6; S.xf[k4 + 3] = -s.a;
        S.an[k4] = t * 5 + i; S.an[k4 + 1] = 1; S.an[k4 + 2] = night > 0.8 ? 0 : 2.6; S.an[k4 + 3] = 1;
      });
      S.xa.needsUpdate = true; S.aa.needsUpdate = true;

      // 물고기가 튀어 오른다
      if (jump.t > 0) {
        jump.t -= dt;
        const k = 1 - jump.t / 0.85;
        fish.position.set(jump.x + Math.sin(jump.yaw) * k * 1.3, Math.sin(k * Math.PI) * 0.75 - 0.1, jump.z + Math.cos(jump.yaw) * k * 1.3);
        fish.rotation.set(-Math.cos(k * Math.PI) * 1.1, jump.yaw, 0, 'YXZ');
        if (jump.t <= 0) { fish.visible = false; ripples.add(fish.position.x, fish.position.z, 0.8); if (this.onSplash) this.onSplash(Math.hypot(fish.position.x - ps.x, fish.position.z - ps.z)); }
      } else {
        jump.wait -= dt;
        if (jump.wait <= 0) {
          jump.wait = 7 + Math.random() * 14;
          for (let k = 0; k < 12; k++) {
            const a = Math.random() * 6.28, r = 12 + Math.random() * 40;
            const x = ps.x + Math.cos(a) * r, z = ps.z + Math.sin(a) * r;
            if (sampleField(x, z, f).d < -4) { jump.x = x; jump.z = z; jump.yaw = Math.random() * 6.28; jump.t = 0.85; fish.visible = true; ripples.add(x, z, 0.6); break; }
          }
        }
      }

      // 가로등 날벌레: 켜진 가로등 가운데 가까운 8개 주위를 맴돈다
      const lampOn = ctx.uniforms.uLampOn.value;
      bugs.visible = lampOn > 0.2 && env.weather.cur.rain < 0.2;
      if (bugs.visible) {
        lampT -= dt;
        if (lampT <= 0) {
          lampT = 1.2;
          nearLamps.length = 0;
          for (const l of ctx.lamps) { const d2 = (l.hx - ps.x) ** 2 + (l.hz - ps.z) ** 2; if (d2 < 3600 && l.kind !== 'bridge') nearLamps.push([d2, l]); }
          nearLamps.sort((a, b) => a[0] - b[0]);
          nearLamps.length = Math.min(8, nearLamps.length);
        }
        const per = BUGS / 8;
        for (let i = 0; i < BUGS; i++) {
          const l = nearLamps[Math.floor(i / per)], k = i * 3, s = i * 4;
          if (!l || lampOn < l[1].order) { bugPos[k + 1] = -30; continue; }
          const a = t * (1.5 + bugSeed[s] * 2.5) + bugSeed[s + 1] * 6.28, r = 0.25 + 0.6 * bugSeed[s + 2];
          bugPos[k] = l[1].hx + Math.cos(a) * r; bugPos[k + 1] = l[1].hy - 0.25 + Math.sin(t * 3.1 * (0.5 + bugSeed[s + 3]) + i) * 0.3; bugPos[k + 2] = l[1].hz + Math.sin(a * 1.3) * r;
        }
        bg.attributes.position.needsUpdate = true;
      }

      // 비행기: 해 질 무렵부터 밤까지, 가끔 불빛이 하늘을 가로지른다
      if (fly.t >= 0) {
        fly.t += dt;
        const x = fly.x0 + fly.dx * fly.t, z = fly.z0 + fly.dz * fly.t;
        const blink = Math.floor(t * 1.4) % 2;
        planePos.set([x, 1300, z, blink ? x + fly.dx * 0.4 : 0, blink ? 1300 : -100, z + fly.dz * 0.4]);
        pg.attributes.position.needsUpdate = true;
        if (fly.t > 70) { fly.t = -1; plane.visible = false; fly.wait = 40 + Math.random() * 80; }
      } else if (night > 0.25) {
        fly.wait -= dt;
        if (fly.wait <= 0) {
          const a = Math.random() * 6.28;
          fly.dx = Math.cos(a) * 85; fly.dz = Math.sin(a) * 85;
          fly.x0 = ps.x - fly.dx * 35 + (Math.random() - 0.5) * 2500; fly.z0 = ps.z - fly.dz * 35 + (Math.random() - 0.5) * 2500;
          fly.t = 0; plane.visible = true;
        }
      }
      void smoothstep;
    },
  };
}
