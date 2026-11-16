// 강변의 자잘한 것들: 글자 조형물, 화장실·음수대·운동기구·쓰레기통·구명환함, 노들섬 건물들, 무지개, 멀리 보이는 초고층 타워.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';
import { mulberry32, lerp, clamp } from '../core/math.js';
import { bankOffset, heightAt, sampleField, pathSDF, NODEUL_FRAME, PLAZA_POINTS, CITY_Y } from './field.js';
import { WALK_X_MIN, WALK_X_MAX, V_SCALE } from './geo.js';
import { signTexture } from './boats.js';

const FONT = { // 5×7 점 글꼴
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'], '♥': ['01010', '11111', '11111', '11111', '01110', '00100', '00000'],
};

export function buildExtras(ctx) {
  const rnd = mulberry32(31337), group = new THREE.Group();
  group.name = 'extras';
  const gb = new GeoBuilder(), glow = new GeoBuilder(), f = {};
  const wk = ctx.walk;
  const sign = (text, x, y, z, yaw, w, h, bg = '#1d3a5c', size = 90, both = false) => {
    const mat = new THREE.MeshStandardMaterial({ map: signTexture(text, 512, Math.round(512 * h / w), bg, '#fff', size), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0, side: both ? THREE.DoubleSide : THREE.FrontSide });
    mat.emissiveMap = mat.map;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = yaw;
    group.add(m);
    ctx.nightMaterials.push({ mat, max: 0.8 });
  };

  // ── 글자 조형물 "I ♥ HANGANG"(여의도 물빛광장): 정육면체를 쌓아 만든 포토존
  const sculpt = (() => {
    const b = bankOffset('S', PLAZA_POINTS[0].x + 26, 10.7), text = 'I♥HANGANG', px = 0.26, yaw = Math.atan2(b.lx, b.lz);
    const y0 = heightAt(b.x, b.z), total = text.length * 6 * px;
    const lg = new GeoBuilder(), hg = new GeoBuilder();
    [...text].forEach((ch, ci) => FONT[ch].forEach((row, r) => [...row].forEach((bit, c) => {
      if (bit !== '1') return;
      const o = (ci * 6 + c) * px - total / 2 + px * 0.5, g = ch === '♥' ? hg : lg;
      g.color(ch === '♥' ? 0xd9412a : 0xf4f1ea);
      g.box(b.x + b.lz * o, y0 + 0.5 + (6 - r) * px + px / 2, b.z - b.lx * o, px, px, px * 2, yaw);
    })));
    gb.color(0x8a8d90); gb.box(b.x, y0 + 0.25, b.z, total + 0.6, 0.5, 0.9, yaw);
    for (const [g, em] of [[lg, 0xfff4e0], [hg, 0xff5a3a]]) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: em, emissiveIntensity: 0 });
      const m = new THREE.Mesh(g.build(), mat); m.castShadow = true; group.add(m);
      ctx.nightMaterials.push({ mat, max: 0.55 });
    }
    wk.addBox(b.x, b.z, b.lz, -b.lx, total / 2 + 0.3, 0.45);
    return { x: b.x + b.lx * 3, z: b.z + b.lz * 3, name: '글자 조형물' };
  })();

  // ── 한강공원 시설물
  const toilets = [];
  for (const bank of ['S', 'N']) {
    let k = 0;
    for (let x = WALK_X_MIN + 70; x < WALK_X_MAX - 70; x += 46 + rnd() * 12, k++) {
      const p = bankOffset(bank, x, 0);
      if (ctx.nearBridge(p.x, p.z, 10)) continue;
      sampleField(p.x + p.lx * 12, p.z + p.lz * 12, f);
      const yawIn = Math.atan2(-p.lx, -p.lz);
      // 구명환함(물가의 주황색 상자)
      if (k % 2 === 0) { const q = bankOffset(bank, x, 2.4), y = heightAt(q.x, q.z); gb.color(0x6a6d70); gb.box(q.x, y + 0.5, q.z, 0.08, 1.0, 0.08); gb.color(0xe9642a); gb.box(q.x, y + 1.25, q.z, 0.7, 0.75, 0.22, yawIn); gb.color(0xf4f1ea); gb.cylinder(q.x - p.lx * 0.13, y + 1.0, q.z - p.lz * 0.13, 0.22, 0.22, 0.5, 10, true); wk.addCircle(q.x, q.z, 0.2); }
      if (f.w < 30) continue;
      // 쓰레기통(일반·재활용)
      if (k % 3 === 0) { const q = bankOffset(bank, x + 6, 10.4), y = heightAt(q.x, q.z); [0x3a7a4a, 0x3a6ab0].forEach((c, i) => { gb.color(c); gb.box(q.x + p.tx * (i - 0.5) * 0.7, y + 0.45, q.z + p.tz * (i - 0.5) * 0.7, 0.55, 0.9, 0.55, yawIn); gb.color(0x2a2a2e); gb.box(q.x + p.tx * (i - 0.5) * 0.7, y + 0.93, q.z + p.tz * (i - 0.5) * 0.7, 0.6, 0.06, 0.6, yawIn); }); wk.addBox(q.x, q.z, p.tx, p.tz, 0.65, 0.3); }
      // 음수대
      if (k % 5 === 1) { const q = bankOffset(bank, x + 3, 10.6), y = heightAt(q.x, q.z); gb.color(0xb8bcc0); gb.cylinder(q.x, y, q.z, 0.22, 0.16, 0.9, 10, true); gb.color(0x8a8d90); gb.cylinder(q.x, y + 0.9, q.z, 0.3, 0.3, 0.06, 12, true); wk.addCircle(q.x, q.z, 0.3); }
      if (f.w < 44) continue;
      // 운동기구
      if (k % 6 === 2) {
        const q = bankOffset(bank, x, 19.5), y = heightAt(q.x, q.z);
        if (pathSDF(q.x, q.z) > 2) for (let i = -1; i <= 1; i++) {
          const ex = q.x + p.tx * i * 2.2, ez = q.z + p.tz * i * 2.2;
          gb.color(0x3a8ad9); gb.box(ex, y + 0.9, ez, 0.1, 1.8, 0.1); gb.color(0xe9c23a); gb.box(ex, y + 1.5, ez, 0.9, 0.08, 0.08, yawIn + Math.PI / 2); gb.box(ex + p.lx * 0.4, y + 0.6, ez + p.lz * 0.4, 0.08, 0.08, 0.9, yawIn + Math.PI / 2);
          gb.color(0x2a2a2e); gb.cylinder(ex - p.lx * 0.35, y + 0.75, ez - p.lz * 0.35, 0.28, 0.28, 0.06, 12, true);
          wk.addCircle(ex, ez, 0.45);
        }
      }
      // 화장실
      if (k % 9 === 4 && f.w > 52) {
        const q = bankOffset(bank, x, 25), y = heightAt(q.x, q.z);
        if (pathSDF(q.x, q.z) > 4 && !(ctx.trees || []).some((t) => Math.hypot(t.x - q.x, t.z - q.z) < 5)) {
          gb.color(0xd8d2c4); gb.box(q.x, y + 1.5, q.z, 7, 3, 3.6, yawIn + Math.PI / 2);
          gb.color(0x6a5a4a); gb.box(q.x, y + 3.1, q.z, 7.6, 0.25, 4.2, yawIn + Math.PI / 2);
          gb.color(0x3a6ab0); gb.box(q.x + p.tx * 1.7 - p.lx * 1.82, y + 1.05, q.z + p.tz * 1.7 - p.lz * 1.82, 0.05, 2.1, 0.9, yawIn + Math.PI / 2);
          gb.color(0xd9584a); gb.box(q.x - p.tx * 1.7 - p.lx * 1.82, y + 1.05, q.z - p.tz * 1.7 - p.lz * 1.82, 0.05, 2.1, 0.9, yawIn + Math.PI / 2);
          sign('화장실', q.x - p.lx * 1.83, y + 2.6, q.z - p.lz * 1.83, yawIn, 2.2, 0.5, '#3d5a6c', 110);
          wk.addBox(q.x, q.z, p.tx, p.tz, 3.5, 1.8);
          toilets.push({ x: q.x, z: q.z });
        }
      }
    }
  }

  // ── 노들섬: 라이브하우스, 노들서가, 카페, 잔디마당 야외무대, 달 조형물, 놀이정원, 예술섬 공사 구역
  const F = NODEUL_FRAME, rotA = Math.atan2(-F.az, F.ax);
  const N = (s, b) => [F.cx + F.ax * s + F.bx * b, F.cz + F.az * s + F.bz * b];
  const nbox = (s, b, y, ls, h, lb, col, g = gb) => { const q = N(s, b); g.color(col); g.box(q[0], y + h / 2, q[1], ls, h, lb, rotA); };
  const nsolid = (s, b, ls, lb) => { const q = N(s, b); wk.addBox(q[0], q[1], F.ax, F.az, ls / 2, lb / 2); };
  const yawS = (dir) => Math.atan2(F.ax * dir, F.az * dir), yawB = (dir) => Math.atan2(F.bx * dir, F.bz * dir);
  const nodeul = {};
  {
    // 라이브하우스(공연장): 서쪽 단의 어두운 금속 상자
    let q = N(-76, -1), y = heightAt(q[0], q[1]);
    nbox(-76, -1, y, 26, 9, 12, 0x3a3d44); nbox(-76, -1, y + 9, 27, 0.4, 13, 0x2a2c30);
    nbox(-62.9, -1, y, 0.12, 3.2, 5, 0xffd9a0, glow); nsolid(-76, -1, 26, 12);
    q = N(-62.8, -1); sign('LIVE HOUSE', q[0], y + 6.6, q[1], yawS(1), 9, 1.3, '#16181c', 60);
    q = N(-76, 5.05); sign('노들섬 라이브하우스', q[0], y + 7, q[1], yawB(1), 12, 1.2, '#c0462a', 70);
    nodeul.live = N(-60, -1);
    // 노들서가(책 문화공간)와 카페: 다리 옆 윗단
    for (const [s0, b0, name, bg, col] of [[-22, -13, '노들서가', '#5a4632', 0xe6dccb], [-22, 13, '카페 · 전망대', '#2a5a4a', 0xdfe6e2]]) {
      q = N(s0, b0); y = heightAt(q[0], q[1]);
      nbox(s0, b0, y, 12, 4.6, 8, col); nbox(s0, b0, y + 4.6, 13, 0.3, 9, 0x55606a);
      nbox(s0 + 6.02, b0, y + 0.6, 0.06, 3.2, 6.6, 0xffe2b0, glow);
      nsolid(s0, b0, 12, 8);
      const e = N(s0 + 6.1, b0); sign(name, e[0], y + 4.15, e[1], yawS(1), 5, 0.7, bg, 100);
      // 서가 안의 책장이 유리 너머로 보인다
      if (name === '노들서가') for (let i = -2; i <= 2; i++) nbox(s0 + 5.6, b0 + i * 1.25, y + 0.4, 0.3, 2.4, 0.9, [0x8a5a3c, 0xc0462a, 0x3a6ab0, 0xe9c23a, 0x4aa86a][i + 2]);
    }
    nodeul.book = N(-13, -13);
    // 잔디마당 야외무대와 대형 화면
    q = N(-103, 0); y = heightAt(q[0], q[1]);
    nbox(-103, 0, y, 5, 0.7, 12, 0x3a3d44); nsolid(-103, 0, 5, 12);
    for (const b of [-6.2, 6.2]) nbox(-104.5, b, y, 0.4, 8, 0.4, 0x2a2c30);
    nbox(-104.5, 0, y + 8, 0.5, 0.5, 13, 0x2a2c30);
    const scr = document.createElement('canvas'); scr.width = 512; scr.height = 256;
    const sg = scr.getContext('2d'), grd = sg.createLinearGradient(0, 0, 512, 256);
    grd.addColorStop(0, '#ff7a3a'); grd.addColorStop(0.5, '#d9418a'); grd.addColorStop(1, '#4a3ad9');
    sg.fillStyle = grd; sg.fillRect(0, 0, 512, 256);
    sg.fillStyle = '#fff'; sg.font = '700 64px "Pretendard","Malgun Gothic","Noto Sans KR",sans-serif'; sg.textAlign = 'center';
    sg.fillText('NODEUL LIVE', 256, 120); sg.font = '600 34px "Pretendard","Malgun Gothic","Noto Sans KR",sans-serif'; sg.fillText('오늘의 한강 · 가을 음악회', 256, 180);
    const stex = new THREE.CanvasTexture(scr); stex.colorSpace = THREE.SRGBColorSpace;
    const smat = new THREE.MeshStandardMaterial({ map: stex, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: 0.25, roughness: 0.4 });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), smat);
    q = N(-104.2, 0); sm.position.set(q[0], y + 4.6, q[1]); sm.rotation.y = yawS(1);
    group.add(sm); ctx.nightMaterials.push({ mat: smat, max: 1.4, min: 0.25 });
    nodeul.stage = N(-92, 0);
    // 잔디마당 줄 전구
    for (const b of [-9.5, 9.5]) for (let s = -98; s <= -50; s += 8) { q = N(s, b); const yy = heightAt(q[0], q[1]); gb.color(0x3a3d44); gb.box(q[0], yy + 1.6, q[1], 0.08, 3.2, 0.08); wk.addCircle(q[0], q[1], 0.08); for (let i = 0; i < 8; i++) { const e = N(s + i, b), sag = Math.sin((i / 8) * Math.PI) * 0.45; glow.color(0xffd9a0); glow.box(e[0], yy + 3.1 - sag, e[1], 0.12, 0.12, 0.12); } }
    // 달 조형물: 남쪽 물가에 떠 있는 보름달 모양 무대
    q = N(-66, 47);
    gb.color(0x55595e); gb.cylinder(q[0], -0.3, q[1], 7, 7, 0.9, 24, true);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 28, 18), new THREE.MeshStandardMaterial({ color: 0xf4eeda, roughness: 0.9, emissive: 0xffe9b0, emissiveIntensity: 0.05 }));
    moon.position.set(q[0], 5.4, q[1]); group.add(moon);
    ctx.nightMaterials.push({ mat: moon.material, max: 1.6, min: 0.05 });
    // 놀이정원(미끄럼틀·그네)
    q = N(64, -26); y = heightAt(q[0], q[1]);
    if (y > 0.5) {
      nbox(64, -26, y, 2, 2.2, 2, 0xe9c23a); nsolid(64, -26, 2, 2); gb.color(0xd9412a); gb.beam([q[0] + F.ax * 1, y + 2.1, q[1] + F.az * 1], [q[0] + F.ax * 4.2, y + 0.2, q[1] + F.az * 4.2], 0.9, 0.1);
      const w0 = N(70, -24), w1 = N(74, -24); gb.color(0x3a8ad9); for (const w of [w0, w1]) gb.box(w[0], y + 1.2, w[1], 0.1, 2.4, 0.1); gb.beam([w0[0], y + 2.4, w0[1]], [w1[0], y + 2.4, w1[1]], 0.1, 0.1);
      for (const s of [71, 73]) { const e = N(s, -24); gb.color(0x2a2a2e); gb.box(e[0], y + 1.5, e[1], 0.03, 1.8, 0.03); gb.color(0xd9412a); gb.box(e[0], y + 0.55, e[1], 0.5, 0.06, 0.25, rotA); }
      wk.addCircle(w0[0], w0[1], 0.15); wk.addCircle(w1[0], w1[1], 0.15);
    }
    // 예술섬 공사 구역(동쪽): 가림막과 타워크레인
    for (let s = 74; s <= 102; s += 2) for (const b of [-8.5, 8.5]) { q = N(s, b); const yy = heightAt(q[0], q[1]); nbox(s, b, yy, 2, 2.2, 0.08, (s / 2) % 2 ? 0xf4f1ea : 0xe9822a); }
    for (let b = -8; b <= 8; b += 2) { q = N(74, b); nbox(74, b, heightAt(q[0], q[1]), 0.08, 2.2, 2, (b / 2) % 2 ? 0xf4f1ea : 0xe9822a); }
    nsolid(88, -8.5, 30, 0.3); nsolid(88, 8.5, 30, 0.3); nsolid(74, 0, 0.3, 17);
    q = N(88, 0); y = heightAt(q[0], q[1]);
    gb.color(0xe9b02a); gb.box(q[0], y + 22, q[1], 1.2, 44, 1.2); gb.beam([q[0] - F.ax * 9, y + 44, q[1] - F.az * 9], [q[0] + F.ax * 26, y + 44, q[1] + F.az * 26], 0.9, 0.9); gb.box(q[0], y + 47, q[1], 0.7, 6, 0.7);
    gb.color(0x55595e); gb.box(q[0] - F.ax * 8, y + 42.6, q[1] - F.az * 8, 2.4, 1.8, 1.4, rotA);
    glow.color(0xff3020); glow.box(q[0], y + 50.2, q[1], 0.5, 0.5, 0.5);
    q = N(73.9, 0); sign('노들 예술섬 조성 공사 중', q[0], heightAt(q[0], q[1]) + 1.2, q[1], yawS(-1), 6, 0.9, '#e9822a', 60);
  }

  // ── 동쪽 멀리 보이는 초고층 타워(잠실 방향)
  {
    const H = 555 * V_SCALE, x = WALK_X_MAX + 1500, z = -420;
    const g = new THREE.CylinderGeometry(6, 26, H, 4, 12, false); g.rotateY(Math.PI / 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8fa6b8, roughness: 0.2, metalness: 0.8, emissive: 0xcfe4ff, emissiveIntensity: 0 });
    const m = new THREE.Mesh(g, mat); m.position.set(x, CITY_Y + H / 2, z); group.add(m);
    ctx.nightMaterials.push({ mat, max: 0.5 });
  }

  const mesh = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  const gmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.1 });
  gmat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;'); };
  group.add(new THREE.Mesh(glow.build(), gmat));
  ctx.nightMaterials.push({ mat: gmat, max: 2.2, min: 0.1 });

  // ── 무지개: 해 반대편 하늘에 뜨는 큰 호
  const rb = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 96, 1, 0, Math.PI), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying float vR; varying float vT; void main(){ vR = (length(position.xy) - 0.86) / 0.14; vT = atan(position.y, position.x); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uA; varying float vR; varying float vT; void main(){ vec3 c = clamp(abs(fract((1.0 - vR) * 0.82 + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); float a = smoothstep(0.0, 0.18, vR) * smoothstep(1.0, 0.8, vR) * smoothstep(0.0, 0.25, sin(vT)) * uA; gl_FragColor = vec4(c * a, a); }',
  }));
  rb.scale.setScalar(1500); rb.frustumCulled = false; rb.layers.set(1); rb.renderOrder = -1;
  ctx.scene.add(rb);
  ctx.scene.add(group);

  return {
    sculpt, toilets, nodeul, force: false, rainbow: 0,
    update(dt, env, player) {
      // 일요일 낮(해가 낮게 떠 있을 때)에 무지개가 뜬다
      const sd = env.sunDir, el = Math.asin(clamp(sd.y, -1, 1));
      const want = (this.force || env.dow === 0) && el > 0.05 && el < 0.85 && env.weather.cur.over < 0.75 ? 1 : 0;
      this.rainbow += clamp(want - this.rainbow, -dt * 0.4, dt * 0.4);
      rb.visible = this.rainbow > 0.002;
      if (rb.visible) {
        const hl = Math.hypot(sd.x, sd.z) || 1, ax = -sd.x / hl, az = -sd.z / hl;
        rb.position.set(player.state.x + ax * 2600, -260 - el * 900, player.state.z + az * 2600);
        rb.rotation.y = Math.atan2(-ax, -az);
        rb.material.uniforms.uA.value = this.rainbow * 0.5 * (1 - env.night);
      }
    },
  };
}
