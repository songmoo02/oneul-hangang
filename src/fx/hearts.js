// 작은 하트(쓰다듬을 때)와 꽃잎: 위로 떠오르다 사라지는 스프라이트.
import * as THREE from 'three';
import { canvasTexture } from '../core/textures.js';

export class Hearts {
  constructor(ctx) {
    const heart = canvasTexture(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.fillStyle = '#ff6b8f';
      g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(2, 34, 8, 8, 32, 22); g.bezierCurveTo(56, 8, 62, 34, 32, 56); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(23, 24, 4, 0, 7); g.fill();
    });
    const note = canvasTexture(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.fillStyle = '#ffd0e4';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; g.beginPath(); g.ellipse(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 11, 7, a, 0, 7); g.fill(); }
      g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(32, 32, 6, 0, 7); g.fill();
    });
    this.maps = [heart, note];
    this.pool = [];
    for (let i = 0; i < 28; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heart, transparent: true, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) }));
      sp.visible = false; sp.layers.set(1);
      ctx.scene.add(sp);
      this.pool.push({ sp, t: 0, life: 1, vx: 0, vy: 0, vz: 0 });
    }
    this.i = 0;
  }

  burst(x, y, z, n = 5, petal = false) {
    for (let k = 0; k < n; k++) {
      const h = this.pool[this.i++ % this.pool.length];
      h.sp.material.map = this.maps[petal ? 1 : 0];
      h.sp.position.set(x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.5);
      h.vx = (Math.random() - 0.5) * 0.5; h.vz = (Math.random() - 0.5) * 0.5; h.vy = 0.5 + Math.random() * 0.5;
      h.life = 1.2 + Math.random() * 0.6; h.t = -k * 0.12;
      h.sp.visible = false;
    }
  }

  update(dt) {
    for (const h of this.pool) {
      if (h.t >= h.life) continue;
      h.t += dt;
      if (h.t < 0) continue;
      const k = h.t / h.life;
      h.sp.visible = k < 1;
      h.sp.position.x += h.vx * dt; h.sp.position.y += h.vy * dt; h.sp.position.z += h.vz * dt;
      const s = 0.12 + 0.16 * Math.min(1, k * 4);
      h.sp.scale.set(s, s, s);
      h.sp.material.opacity = Math.min(1, (1 - k) * 2.5);
    }
  }
}
