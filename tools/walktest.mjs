// 보행 판정 검증: 둔치 → 계단 → 다리 보도 → 반대편 계단 → 둔치
import { WalkWorld } from '../src/world/walk.js';
import { planBridges } from '../src/world/bridges.js';
import { heightAt, sampleField } from '../src/world/field.js';
const ctx = { walk: new WalkWorld() };
const plans = planBridges(ctx);
function mover(x, z) {
  const s = { x, z, y: heightAt(x, z), surface: 'ground' };
  const r0 = ctx.walk.resolve(x, z, s.y + 0.3, {});
  if (!r0.ok) return null;
  s.y = r0.y; s.surface = r0.kind;
  s.go = (dx, dz, dist) => {
    const step = 0.1; let moved = 0;
    for (let i = 0; i < dist / step; i++) {
      const nx = s.x + dx * step, nz = s.z + dz * step;
      const r = ctx.walk.resolve(nx, nz, s.y, {});
      if (!r.ok) break;
      if (r.kind === 'ground' && s.surface === 'ground' && Math.abs(r.y - s.y) > step * 1.3 + 0.04) break;
      s.x = nx; s.z = nz; s.y = r.y; s.surface = r.kind; s.tag = r.strip ? r.strip.tag : 'ground'; moved += step;
    }
    return moved;
  };
  return s;
}
let fails = 0;
for (const p of plans) {
  console.log(`\n${p.name}: L=${p.L} stairs=${p.stairs.length} piers=${p.piers.length} deckH=${p.H}`);
  for (const st of p.stairs) {
    const a = st.a;
    const q = p.at(st.sB - st.end * 1.5, a);
    const m = mover(q[0], q[1]);
    if (!m) { console.log('  FAIL start not walkable', st.end, st.sg); fails++; continue; }
    const y0 = m.y;
    const up = m.go(p.dx * st.end, p.dz * st.end, st.len + 1.5 + st.land - 0.6);
    const topY = m.y;
    // 보도 쪽으로 옆걸음
    const side = m.go(-p.sx * st.sg, -p.sz * st.sg, 2.6);
    const onDeck = m.tag === p.id;
    // 다리를 따라 강 건너까지
    const along = m.go(-p.dx * st.end, -p.dz * st.end, p.L);
    const ok = onDeck && Math.abs(topY - (p.deckY(st.sT) + 0.12)) < 0.3 && along > p.L * 0.7;
    if (!ok) fails++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} end=${st.end} side=${st.sg} steps=${st.n} y ${y0.toFixed(2)}→${topY.toFixed(2)} up=${up.toFixed(1)} side=${side.toFixed(1)} tag=${m.tag} along=${along.toFixed(0)}`);
  }
  if (p.jamsu) {
    const q = p.at(p.jamsu.s0 - 3);
    const m = mover(q[0], q[1]);
    const d = m ? m.go(p.dx, p.dz, p.jamsu.s1 - p.jamsu.s0 + 6) : 0;
    const ok = d > p.jamsu.s1 - p.jamsu.s0 + 4;
    if (!ok) fails++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} 잠수교 횡단 ${d.toFixed(0)} / ${(p.jamsu.s1 - p.jamsu.s0 + 6).toFixed(0)} endTag=${m && m.tag} y=${m && m.y.toFixed(2)}`);
  }
  if (p.island) {
    // 한강대교 보도에서 노들섬으로 내려서기
    const q = p.at((p.island[0] + p.island[1]) / 2, p.W / 2 - 1.5);
    const m = mover(q[0], q[1]);
    m.y = p.deckY(0) ; const r = ctx.walk.resolve(q[0], q[1], p.H + 0.3, {}); m.y = r.y; m.surface = r.kind;
    const d = m.go(p.sx, p.sz, 30);
    const f = sampleField(m.x, m.z, {});
    const ok = d > 20;
    if (!ok) fails++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} 보도→노들섬 ${d.toFixed(1)} surface=${m.surface} y=${m.y.toFixed(2)} d=${f.d.toFixed(1)}`);
  }
}
for (const fb of ctx.footbridges) {
  const m = mover(fb.ax - fb.dx * 2, fb.az - fb.dz * 2);
  const d = m ? m.go(fb.dx, fb.dz, fb.len + 6) : 0;
  const f = m ? sampleField(m.x, m.z, {}) : {};
  const ok = d > fb.len + 4 && f.zone === 4;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} 서래섬 보행교 len=${fb.len.toFixed(1)} moved=${d.toFixed(1)} zone=${f.zone}`);
}
console.log('\nstrips', ctx.walk.strips.length, 'capsules', ctx.walk.capsules.length, 'FAILS', fails);
