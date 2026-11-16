// 꽃밭의 나비와 벌, 한강버스 옆에서 뛰어오르는 돌고래.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';

export function buildCritters(ctx, flowers, ripples) {
  const rnd = mulberry32(99);
  // ── 나비·벌: 꽃밭마다 몇 마리씩. 날개 한 쌍(사각형 두 장)을 인스턴스로 그린다
  const list = [];
  for (const p of flowers.patches) {
    for (let i = 0; i < 6; i++) list.push({ p, bee: false, a: rnd() * 6.28, r: rnd() * p.r, h: 0.7 + rnd() * 0.7, sp: 0.5 + rnd() * 0.6, ph: rnd() * 6.28, col: [0xfff2a0, 0xffffff, 0xffb347, 0xb9d9ff, 0xffa0c8][Math.floor(rnd() * 5)] });
    for (let i = 0; i < 4; i++) list.push({ p, bee: true, a: rnd() * 6.28, r: rnd() * p.r, h: 0.55 + rnd() * 0.25, sp: 1.2 + rnd(), ph: rnd() * 6.28, col: 0xf2b21a });
  }
  const wing = new THREE.PlaneGeometry(0.09, 0.11); wing.translate(0.045, 0, 0);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  const mk = () => { const m = new THREE.InstancedMesh(wing, mat, list.length); m.frustumCulled = false; m.layers.set(1); ctx.scene.add(m); return m; };
  const wL = mk(), wR = mk();
  const c = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  list.forEach((b, i) => { c.set(b.col).multiplyScalar(b.bee ? 0.9 : 1.1); wL.setColorAt(i, c); wR.setColorAt(i, c); });

  // ── 돌고래(3마리 풀)
  const dMat = new THREE.MeshStandardMaterial({ color: 0x6f8496, roughness: 0.35, metalness: 0.1 });
  const dolphins = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.5, 6, 12).rotateX(Math.PI / 2), dMat); body.scale.set(0.9, 1, 1); g.add(body);
    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.3, 4, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe6ecef, roughness: 0.4 })); belly.position.y = -0.09; g.add(belly);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 8).rotateX(Math.PI / 2), dMat); nose.position.set(0, -0.05, 1.25); g.add(nose);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4).rotateX(-0.5), dMat); fin.scale.x = 0.25; fin.position.set(0, 0.5, -0.1); g.add(fin);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 6).rotateX(-Math.PI / 2), dMat); tail.position.set(0, 0, -1.3); g.add(tail);
    const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.3), dMat); fluke.position.set(0, 0, -1.7); g.add(fluke);
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.2), dMat); f.position.set(sx * 0.4, -0.2, 0.4); f.rotation.z = sx * -0.5; g.add(f); }
    g.visible = false; g.traverse((o) => { o.castShadow = true; });
    ctx.scene.add(g);
    dolphins.push({ g, t: -1, x: 0, z: 0, yaw: 0, len: 6, h: 2.4 });
  }
  let nextJump = 5;

  return {
    onJump: null,
    update(dt, env, player, bus) {
      const t = ctx.uniforms.uTime.value, px = player.state.x, pz = player.state.z;
      const hide = env.weather.cur.rain > 0.15 || env.night > 0.6; // 비 오는 날과 밤에는 나오지 않는다
      for (let i = 0; i < list.length; i++) {
        const b = list[i], p = b.p;
        if (hide || Math.hypot(p.x - px, p.z - pz) > 70) { m4.makeScale(0, 0, 0); wL.setMatrixAt(i, m4); wR.setMatrixAt(i, m4); continue; }
        b.a += dt * b.sp * (0.6 + 0.4 * Math.sin(t * 0.7 + b.ph));
        const rr = p.r * (0.25 + 0.7 * Math.abs(Math.sin(b.a * 0.37 + b.ph)));
        const x = p.x + Math.cos(b.a) * rr, z = p.z + Math.sin(b.a) * rr;
        const y = p.y + b.h + Math.sin(t * (b.bee ? 5 : 2.2) + b.ph) * (b.bee ? 0.05 : 0.22);
        const yaw = -b.a - Math.PI / 2, flap = b.bee ? Math.sin(t * 90 + b.ph) * 0.5 : Math.sin(t * 13 + b.ph) * 1.1, s = b.bee ? 0.45 : 1;
        v.set(x, y, z); sc.set(s, s, s);
        e.set(Math.PI / 2, yaw, flap, 'YXZ'); q.setFromEuler(e); m4.compose(v, q, sc); wL.setMatrixAt(i, m4);
        e.set(Math.PI / 2, yaw + Math.PI, flap, 'YXZ'); q.setFromEuler(e); m4.compose(v, q, sc); wR.setMatrixAt(i, m4);
      }
      wL.instanceMatrix.needsUpdate = true; wR.instanceMatrix.needsUpdate = true;

      // 돌고래: 한강버스를 타고 달리는 동안 가끔 옆에서 뛰어오른다
      if (bus && bus.state === 'sail' && bus.speed > 6) {
        nextJump -= dt;
        if (nextJump <= 0) {
          nextJump = 5 + Math.random() * 9;
          const n = Math.random() < 0.4 ? 2 : 1, side = Math.random() < 0.5 ? 1 : -1;
          for (let k = 0; k < n; k++) {
            const d = dolphins.find((o) => o.t < 0); if (!d) break;
            const off = 14 + Math.random() * 16 + k * 3, ahead = 18 + Math.random() * 18 - k * 4;
            d.yaw = bus.yaw + (Math.random() - 0.5) * 0.3;
            d.x = bus.x + Math.cos(bus.yaw) * off * side + Math.sin(bus.yaw) * ahead; d.z = bus.z - Math.sin(bus.yaw) * off * side + Math.cos(bus.yaw) * ahead;
            d.t = -k * 0.35 - 0.001; d.len = 7 + Math.random() * 3; d.h = 2.2 + Math.random() * 1.2; d.started = false;
          }
        }
      }
      for (const d of dolphins) {
        if (d.t === -1) continue;
        d.t += dt;
        if (d.t < 0) continue;
        const T = 1.5, k = d.t / T;
        if (!d.started) { d.started = true; ripples.add(d.x, d.z, 2.2); if (this.onJump) this.onJump(d, true); }
        if (k >= 1) { d.t = -1; d.g.visible = false; const ex = d.x + Math.sin(d.yaw) * d.len, ez = d.z + Math.cos(d.yaw) * d.len; ripples.add(ex, ez, 2.6); if (this.onJump) this.onJump({ x: ex, z: ez }, false); continue; }
        const y = Math.sin(k * Math.PI) * d.h - 0.5, pitch = -Math.cos(k * Math.PI) * 0.95;
        d.g.visible = true;
        d.g.position.set(d.x + Math.sin(d.yaw) * d.len * k, y, d.z + Math.cos(d.yaw) * d.len * k);
        d.g.rotation.set(pitch, d.yaw, 0, 'YXZ');
      }
    },
  };
}
