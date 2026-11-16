// 시설물: 노들섬 푸드트럭, 따릉이 대여소, 치킨 배달존 표지. (편의점·선착장은 boats.js)
import * as THREE from 'three';
import { GeoBuilder } from '../core/geobuilder.js';
import { bankOffset, heightAt, NODEUL_FRAME, PLAZA_POINTS, registerPathShape } from '../world/field.js';
import { toWorld } from '../world/geo.js';
import { signTexture } from '../world/boats.js';

const lonX = (lon) => toWorld(0, lon).x;

// 지형을 만들기 전에: 위치를 정하고 바닥 포장을 등록한다
export function planFacilities(ctx) {
  const F = NODEUL_FRAME;
  const racks = [['S', 126.9368, 19.5], ['S', 126.9312, 19.5], ['S', 126.9240, 19.5], ['N', 126.9668, 19.5], ['N', 126.9758, 19.5], ['S', 126.9866, 19.5], ['S', 126.9950, 19.5], ['N', 126.9440, 19.5]]
    .map(([bank, lon, d]) => { const p = bankOffset(bank, lonX(lon), d); return { x: p.x, z: p.z, tx: p.tx, tz: p.tz, lx: p.lx, lz: p.lz }; });
  for (const r of racks) registerPathShape({ t: 1, ax: r.x - r.tx * 3.2, az: r.z - r.tz * 3.2, bx: r.x + r.tx * 3.2, bz: r.z + r.tz * 3.2, r: 2.1 });
  // 치킨 배달존: 큰 광장 가장자리
  const zones = [PLAZA_POINTS[0], PLAZA_POINTS[3], PLAZA_POINTS[4]].map((pl) => ({ x: pl.x - pl.r * 0.55, z: pl.z - pl.r * 0.55, name: pl.name }));
  const truck = { x: F.cx + F.ax * -40 + F.bx * 13, z: F.cz + F.az * -40 + F.bz * 13, yaw: Math.atan2(F.ax, F.az) };
  ctx.facilityPlan = { racks, zones, truck };
  return ctx.facilityPlan;
}

export function buildFacilities(ctx) {
  const { racks, zones, truck } = ctx.facilityPlan;
  const group = new THREE.Group();
  group.name = 'facilities';
  const gb = new GeoBuilder();
  const signs = [];
  const addSign = (text, x, y, z, yaw, w, h, bg, size, both = true) => {
    const mat = new THREE.MeshStandardMaterial({ map: signTexture(text, 512, Math.round(512 * h / w), bg, '#fff', size), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0, side: both ? THREE.DoubleSide : THREE.FrontSide });
    mat.emissiveMap = mat.map;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = yaw;
    group.add(m);
    ctx.nightMaterials.push({ mat, max: 0.8 });
    signs.push(m);
  };

  // ── 따릉이 대여소
  const bikeCount = racks.length * 4;
  const bikes = new THREE.InstancedMesh(ctx.bikeGeo, ctx.materials.bike, bikeCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  racks.forEach((r, i) => {
    r.y = heightAt(r.x, r.z);
    const yaw = Math.atan2(r.lx, r.lz);
    for (let k = 0; k < 4; k++) {
      const o = (k - 1.5) * 1.05;
      q.setFromAxisAngle(up, yaw);
      m4.compose(new THREE.Vector3(r.x + r.tx * o, r.y, r.z + r.tz * o), q, one);
      bikes.setMatrixAt(i * 4 + k, m4);
      gb.color(0x8a8d92);
      gb.box(r.x + r.tx * o - r.lx * 0.5, r.y + 0.35, r.z + r.tz * o - r.lz * 0.5, 0.08, 0.7, 0.08);
    }
    ctx.walk.addBox(r.x - r.lx * 0.1, r.z - r.lz * 0.1, r.tx, r.tz, 2.0, 0.75);
    ctx.walk.addCircle(r.x + r.tx * 3.0, r.z + r.tz * 3.0, 0.1);
    gb.color(0x2f8a4a);
    gb.box(r.x + r.tx * 3.0, r.y + 1.1, r.z + r.tz * 3.0, 0.1, 2.2, 0.1);
    addSign('따릉이 대여소', r.x + r.tx * 3.0, r.y + 2.45, r.z + r.tz * 3.0, yaw, 1.9, 0.5, '#2f8a4a', 110);
  });
  bikes.castShadow = true;
  bikes.frustumCulled = false;
  group.add(bikes);

  // ── 배달존 표지
  zones.forEach((z) => {
    z.y = heightAt(z.x, z.z);
    ctx.walk.addCircle(z.x, z.z, 0.08);
    gb.color(0x55595e);
    gb.cylinder(z.x, z.y - 0.1, z.z, 0.05, 0.05, 2.6, 8, true);
    gb.color(0xd9a02a);
    gb.cylinder(z.x, z.y + 0.01, z.z, 1.5, 1.5, 0.03, 20, true);
    addSign('치킨 배달존', z.x, z.y + 2.75, z.z, 0.6, 2.0, 0.55, '#c0462a', 110);
  });

  // ── 노들섬 푸드트럭
  {
    const t = truck;
    t.y = heightAt(t.x, t.z);
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), sx = Math.cos(t.yaw), sz = -Math.sin(t.yaw);
    const box = (cf, cs, y, lf, ls, h, col) => {
      gb.color(col);
      gb.obox([t.x + fx * cf + sx * cs, t.y + y, t.z + fz * cf + sz * cs], [fx * lf / 2, 0, fz * lf / 2], [0, h / 2, 0], [sx * ls / 2, 0, sz * ls / 2]);
    };
    // 짐칸: 판매 창이 뚫려 있어 안에 선 사장님이 보인다
    box(0, 0, 0.825, 4.6, 2.1, 0.85, 0xe8b23a);
    box(0, 0, 2.6, 4.6, 2.1, 0.2, 0xe8b23a);
    box(0, -0.95, 1.9, 4.6, 0.2, 1.3, 0xe8b23a);
    for (const cf of [-2.2, 2.2]) box(cf, 0, 1.9, 0.2, 2.1, 1.3, 0xe8b23a);
    box(0.9, 0.5, 1.33, 0.9, 0.5, 0.14, 0x2a2a2e); // 철판
    for (const k of [0.65, 0.9, 1.15]) box(k, 0.5, 1.43, 0.09, 0.34, 0.07, 0xb9772e); // 굽는 핫도그
    box(-0.9, 0.6, 1.4, 0.3, 0.3, 0.3, 0xd9412a); box(-1.3, 0.6, 1.38, 0.2, 0.2, 0.26, 0xe9c23a); // 소스통
    box(3.1, 0, 1.2, 1.6, 2.0, 1.6, 0xf2efe6); // 운전석
    box(3.3, 0, 1.6, 1.0, 2.04, 0.6, 0x2a3440);
    box(0, 1.5, 2.25, 4.2, 1.2, 0.08, 0xc0462a); // 차양
    box(0, 1.1, 1.25, 3.6, 0.3, 0.08, 0xf2efe6); // 판매대
    for (const cf of [-1.5, 3.0]) for (const cs of [-1.0, 1.0]) box(cf, cs, 0.35, 0.7, 0.25, 0.7, 0x151515);
    t.counter = [t.x + sx * 2.2, t.z + sz * 2.2];
    addSign('노들 푸드트럭', t.x + sx * 1.07, t.y + 3.0, t.z + sz * 1.07, Math.atan2(sx, sz), 3.6, 0.6, '#3a2a22', 84, false);
    addSign('핫도그 · 간식', t.x + sx * 1.07, t.y + 0.75, t.z + sz * 1.07, Math.atan2(sx, sz), 2.6, 0.45, '#c0462a', 90, false);
    ctx.walk.addBox(t.x + fx * 0.8, t.z + fz * 0.8, fx, fz, 3.15, 1.1);
    ctx.lamps.push({ x: t.x + sx * 1.6 + fx * 2.0, y: t.y, z: t.z + sz * 1.6 + fz * 2.0, kind: 'low', dirx: -fx, dirz: -fz });
  }

  const mesh = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  ctx.scene.add(group);
  return { racks, zones, truck };
}
