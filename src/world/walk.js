// 보행 판정: 지면(필드)과 "띠 모양 보행면"(다리 보도·계단·잠수교)을 함께 다룬다.
// 다리 밑을 지나갈 때와 다리 위를 걸을 때를 높이로 구분한다.
import { sampleField, heightFromField, isGroundWalkable } from './field.js';
import { WALK_X_MIN, WALK_X_MAX } from './geo.js';

const STEP_UP = 0.6; // 한 번에 오를 수 있는 높이
const DROP = 1.25; // 한 번에 내려설 수 있는 높이

export class WalkWorld {
  constructor() {
    this.strips = []; // {ax,az,dx,dz,sx,sz,s0,s1,a0,a1,y(s),tag}
    this.capsules = []; // 지면에서만 적용되는 충돌체 {ax,az,bx,bz,r}
    this.solids = new Map(); // 격자 칸 → 구조물(벽·텐트·나무 등). 어떤 바닥에서든 막는다
    this._f = {};
  }

  _insert(o, rad) {
    const C = 12;
    for (let ix = Math.floor((o.cx - rad) / C); ix <= Math.floor((o.cx + rad) / C); ix++) {
      for (let iz = Math.floor((o.cz - rad) / C); iz <= Math.floor((o.cz + rad) / C); iz++) {
        const k = ix * 4096 + iz;
        if (!this.solids.has(k)) this.solids.set(k, []);
        this.solids.get(k).push(o);
      }
    }
    return o;
  }

  // 방향이 있는 직사각형(중심, 길이 방향 단위벡터, 반길이, 반폭, 높이 범위)
  addBox(cx, cz, ux, uz, hl, hw, y0 = -1e9, y1 = 1e9) { return this._insert({ cx, cz, ux, uz, hl, hw, y0, y1 }, Math.hypot(hl, hw) + 1); }
  addCircle(x, z, r, y0 = -1e9, y1 = 1e9) { return this._insert({ cx: x, cz: z, r, y0, y1 }, r + 1); }

  // (x,z,y)에 선 사람이 구조물과 겹치는지
  blocked(x, z, y, m = 0.26) {
    const list = this.solids.get(Math.floor(x / 12) * 4096 + Math.floor(z / 12));
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (y < o.y0 || y > o.y1) continue;
      const rx = x - o.cx, rz = z - o.cz;
      if (o.r !== undefined) { if (rx * rx + rz * rz < (o.r + m) * (o.r + m)) return true; }
      else if (Math.abs(rx * o.ux + rz * o.uz) < o.hl + m && Math.abs(-rx * o.uz + rz * o.ux) < o.hw + m) return true;
    }
    return false;
  }

  addStrip(s) { this.strips.push(s); return s; }
  addCapsule(c) { this.capsules.push(c); }

  // (x,z)에서 yPrev 높이에 있던 사람이 설 수 있는 면을 찾는다
  resolve(x, z, yPrev, out = {}) {
    let best = null, bestY = -Infinity;
    for (let i = 0; i < this.strips.length; i++) {
      const st = this.strips[i];
      const rx = x - st.ax, rz = z - st.az;
      const s = rx * st.dx + rz * st.dz;
      if (s < st.s0 || s > st.s1) continue;
      const a = rx * st.sx + rz * st.sz;
      if (a < st.a0 || a > st.a1) continue;
      const y = st.y(s);
      if (y > yPrev + STEP_UP || y < yPrev - DROP) continue;
      if (y > bestY) { bestY = y; best = st; }
    }
    if (best) { out.ok = true; out.y = bestY; out.kind = 'strip'; out.strip = best; return out; }
    const f = sampleField(x, z, this._f);
    if (isGroundWalkable(f) && x > WALK_X_MIN && x < WALK_X_MAX) {
      const h = heightFromField(f, x, z);
      if (h <= yPrev + STEP_UP && h >= yPrev - DROP) {
        out.ok = true; out.y = h; out.kind = 'ground'; out.strip = null;
        out.d = f.d; out.w = f.w; out.zone = f.zone;
        return out;
      }
    }
    out.ok = false;
    return out;
  }

  // 지면 위 충돌체(교각 등) 밀어내기
  pushOut(pos) {
    for (let i = 0; i < this.capsules.length; i++) {
      const c = this.capsules[i];
      const ex = c.bx - c.ax, ez = c.bz - c.az;
      const l2 = ex * ex + ez * ez;
      let t = l2 > 0 ? ((pos.x - c.ax) * ex + (pos.z - c.az) * ez) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = pos.x - (c.ax + ex * t), pz = pos.z - (c.az + ez * t);
      const d = Math.hypot(px, pz), r = c.r + 0.3;
      if (d < r && d > 1e-5) { pos.x += (px / d) * (r - d); pos.z += (pz / d) * (r - d); }
    }
  }
}
