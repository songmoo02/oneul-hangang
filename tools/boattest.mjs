import { WalkWorld } from '../src/world/walk.js';
import { planBridges } from '../src/world/bridges.js';
import { planBoats } from '../src/world/boats.js';
import { sampleField } from '../src/world/field.js';
const ctx = { walk: new WalkWorld() };
const plans = planBridges(ctx);
const bp = planBoats(ctx);
const f = {};
for (const [name, r] of [['bus', bp.busRoute], ['cruise', bp.cruiseRoute]]) {
  let minD = 1e9, worst = 0, minPier = 1e9, pierAt = '';
  for (let s = 0; s <= r.total; s += 2) {
    const o = r.at(s);
    for (const off of [-8, 0, 8]) {
      const x = o.x - o.tz * off, z = o.z + o.tx * off;
      sampleField(x, z, f);
      if (-f.d < minD && s > 30 && s < r.total - 30) { minD = -f.d; worst = s; }
      for (const p of plans) { const rx = x - p.ax, rz = z - p.az; const sv = rx * p.dx + rz * p.dz, a = rx * p.sx + rz * p.sz; if (sv < 0 || sv > p.L || Math.abs(a) > p.W / 2 + 2) continue; for (const pr of p.piers) { const d = Math.abs(pr.s - sv); if (d < minPier) { minPier = d; pierAt = p.id + '@' + s; } } }
    }
  }
  console.log(name, 'len', r.total.toFixed(0), 'min water depth-dist (mid route)', minD.toFixed(1), 'at s', worst, 'min pier dist', minPier.toFixed(1), pierAt);
}
for (const d of Object.values(bp.docks)) { sampleField(d.x, d.z, f); console.log(d.name, 'd', f.d.toFixed(1), 'berth d', sampleField(d.berth[0], d.berth[1], f).d.toFixed(1)); }
console.log('duck', sampleField(bp.duckDock.x, bp.duckDock.z, f).d.toFixed(1));
