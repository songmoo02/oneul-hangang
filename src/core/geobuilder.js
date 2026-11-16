// 인공 구조물(다리·계단·가로등 등)을 한 덩어리 BufferGeometry로 쌓아 올리는 도우미.
import * as THREE from 'three';

export class GeoBuilder {
  constructor() {
    this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = [];
    this.col = [1, 1, 1];
    this.count = 0;
  }

  color(r, g, b) {
    if (g === undefined) { const c = new THREE.Color(r); this.col = [c.r, c.g, c.b]; } else this.col = [r, g, b];
    return this;
  }

  _v(x, y, z, nx, ny, nz, u = 0, v = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v);
    this.c.push(this.col[0], this.col[1], this.col[2]);
    return this.count++;
  }

  // a,b,c,d: [x,y,z] 반시계(바깥에서 볼 때). hint가 있으면 그 방향을 바깥으로 맞춘다.
  quad(a, b, c, d, hint, uvs) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) { // 퇴화 방지: 다른 대각으로 재계산
      ux = c[0] - b[0]; uy = c[1] - b[1]; uz = c[2] - b[2];
      vx = a[0] - b[0]; vy = a[1] - b[1]; vz = a[2] - b[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      l = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= l; ny /= l; nz /= l;
    let flip = false;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { flip = true; nx = -nx; ny = -ny; nz = -nz; }
    const u = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const i0 = this._v(a[0], a[1], a[2], nx, ny, nz, u[0][0], u[0][1]);
    const i1 = this._v(b[0], b[1], b[2], nx, ny, nz, u[1][0], u[1][1]);
    const i2 = this._v(c[0], c[1], c[2], nx, ny, nz, u[2][0], u[2][1]);
    const i3 = this._v(d[0], d[1], d[2], nx, ny, nz, u[3][0], u[3][1]);
    if (flip) this.idx.push(i0, i2, i1, i0, i3, i2);
    else this.idx.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  // 중심 c와 세 반축 벡터로 정의한 상자
  obox(c, X, Y, Z) {
    const P = (sx, sy, sz) => [
      c[0] + sx * X[0] + sy * Y[0] + sz * Z[0],
      c[1] + sx * X[1] + sy * Y[1] + sz * Z[1],
      c[2] + sx * X[2] + sy * Y[2] + sz * Z[2],
    ];
    const faces = [
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], X],
      [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-X[0], -X[1], -X[2]]],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], Y],
      [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-Y[0], -Y[1], -Y[2]]],
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], Z],
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [-Z[0], -Z[1], -Z[2]]],
    ];
    for (const f of faces) this.quad(P(...f[0]), P(...f[1]), P(...f[2]), P(...f[3]), f[4]);
    return this;
  }

  // 축 정렬 상자(+Y축 회전)
  box(cx, cy, cz, sx, sy, sz, rotY = 0) {
    const co = Math.cos(rotY), si = Math.sin(rotY);
    return this.obox([cx, cy, cz], [co * sx / 2, 0, -si * sx / 2], [0, sy / 2, 0], [si * sz / 2, 0, co * sz / 2]);
  }

  // p1→p2를 잇는 각재. w: 수평 방향 두께, h: 수직 방향 두께
  beam(p1, p2, w, h) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], dz = p2[2] - p1[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return this;
    const ax = [dx / 2, dy / 2, dz / 2];
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(dy) / len > 0.999) { ux = 1; uy = 0; }
    // side = dir × up
    let sx = dy * uz - dz * uy, sy = dz * ux - dx * uz, sz = dx * uy - dy * ux;
    let sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
    // up' = side × dir
    let vx = sy * dz - sz * dy, vy = sz * dx - sx * dz, vz = sx * dy - sy * dx;
    const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
    return this.obox(
      [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2],
      ax, [vx * h / 2, vy * h / 2, vz * h / 2], [sx * w / 2, sy * w / 2, sz * w / 2],
    );
  }

  // 볼록 다각형 [[x,z],...]을 y0~y1로 세운 기둥
  prism(poly, y0, y1, capTop = true, capBottom = false) {
    let cx = 0, cz = 0;
    for (const p of poly) { cx += p[0]; cz += p[1]; }
    cx /= poly.length; cz /= poly.length;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
      this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [mx, 0, mz]);
    }
    const cap = (y, up) => {
      for (let i = 1; i < poly.length - 1; i++) {
        const a = poly[0], b = poly[i], c = poly[i + 1];
        this.quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [c[0], y, c[1]], [0, up, 0]);
      }
    };
    if (capTop) cap(y1, 1);
    if (capBottom) cap(y0, -1);
    return this;
  }

  // 부드러운 법선을 가진 원기둥/원뿔대
  cylinder(cx, y0, cz, r0, r1, h, seg = 10, capTop = true) {
    const base = this.count;
    const slope = (r0 - r1) / h;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
      const nl = Math.hypot(1, slope);
      this._v(cx + co * r0, y0, cz + si * r0, co / nl, slope / nl, si / nl, i / seg, 0);
      this._v(cx + co * r1, y0 + h, cz + si * r1, co / nl, slope / nl, si / nl, i / seg, 1);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.idx.push(a, b, c, b, d, c);
    }
    if (capTop && r1 > 0) {
      const c0 = this._v(cx, y0 + h, cz, 0, 1, 0, 0.5, 0.5);
      const ring = this.count;
      for (let i = 0; i <= seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        this._v(cx + Math.cos(th) * r1, y0 + h, cz + Math.sin(th) * r1, 0, 1, 0, 0, 0);
      }
      for (let i = 0; i < seg; i++) this.idx.push(c0, ring + i + 1, ring + i);
    }
    return this;
  }

  // frames: [{p:[x,y,z], s:[..] 측면 단위벡터, u:[..] 위 단위벡터}], profile: [[a,b],...] (a: 측면, b: 위)
  // skip: 그리지 않을 프로파일 변 인덱스 목록
  sweep(frames, profile, { skip = [], caps = false, uvScale = 0.1 } = {}) {
    const isFn = typeof profile === 'function';
    const prof = (i) => (isFn ? profile(i) : profile);
    const P = (f, q) => [
      f.p[0] + f.s[0] * q[0] + f.u[0] * q[1],
      f.p[1] + f.s[1] * q[0] + f.u[1] * q[1],
      f.p[2] + f.s[2] * q[0] + f.u[2] * q[1],
    ];
    let acc = 0;
    for (let i = 0; i < frames.length - 1; i++) {
      const f0 = frames[i], f1 = frames[i + 1];
      const p0 = prof(i), p1 = prof(i + 1);
      const seg = Math.hypot(f1.p[0] - f0.p[0], f1.p[1] - f0.p[1], f1.p[2] - f0.p[2]);
      let ca = 0, cb = 0;
      for (const q of p0) { ca += q[0]; cb += q[1]; }
      ca /= p0.length; cb /= p0.length;
      for (let k = 0; k < p0.length; k++) {
        if (skip.includes(k)) continue;
        const k2 = (k + 1) % p0.length;
        const ma = (p0[k][0] + p0[k2][0]) / 2 - ca, mb = (p0[k][1] + p0[k2][1]) / 2 - cb;
        const hint = [f0.s[0] * ma + f0.u[0] * mb, f0.s[1] * ma + f0.u[1] * mb, f0.s[2] * ma + f0.u[2] * mb];
        const v0 = acc * uvScale, v1 = (acc + seg) * uvScale;
        this.quad(P(f0, p0[k]), P(f1, p1[k]), P(f1, p1[k2]), P(f0, p0[k2]), hint,
          [[k / p0.length, v0], [k / p0.length, v1], [(k + 1) / p0.length, v1], [(k + 1) / p0.length, v0]]);
      }
      acc += seg;
    }
    if (caps) {
      for (const [f, sign] of [[frames[0], -1], [frames[frames.length - 1], 1]]) {
        const pr = prof(f === frames[0] ? 0 : frames.length - 1);
        const t = [f.s[1] * f.u[2] - f.s[2] * f.u[1], f.s[2] * f.u[0] - f.s[0] * f.u[2], f.s[0] * f.u[1] - f.s[1] * f.u[0]];
        const hint = [t[0] * sign, t[1] * sign, t[2] * sign];
        for (let k = 1; k < pr.length - 1; k++) this.quad(P(f, pr[0]), P(f, pr[k]), P(f, pr[k + 1]), P(f, pr[k + 1]), hint);
      }
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
