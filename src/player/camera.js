// 3인칭 카메라: 마우스로 공전, 휠로 거리 조절, 지면 아래로 내려가지 않게 보정.
import * as THREE from 'three';
import { clamp, damp } from '../core/math.js';
import { heightAt } from '../world/field.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 1.94;
    this.pitch = 0.2;
    this.dist = 5.6;
    this.distTarget = 5.6;
    this.target = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.sens = 0.0026;
    this._init = false;
  }

  update(dt, player, mouse) {
    if (mouse) {
      this.yaw -= mouse.dx * this.sens;
      this.pitch = clamp(this.pitch + mouse.dy * this.sens, -0.32, 1.3);
      if (mouse.wheel) this.distTarget = clamp(this.distTarget * (1 + mouse.wheel * 0.12), 2.2, 18);
    }
    this.dist = damp(this.dist, this.distTarget, 8, dt);
    const s = player.state;
    const tx = s.x, ty = player.visY + 1.18, tz = s.z;
    if (!this._init) { this.target.set(tx, ty, tz); this._init = true; }
    this.target.x = damp(this.target.x, tx, 16, dt);
    this.target.y = damp(this.target.y, ty, 10, dt);
    this.target.z = damp(this.target.z, tz, 16, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cam = this.camera;
    let cx = this.target.x + Math.sin(this.yaw) * cp * this.dist;
    let cy = this.target.y + sp * this.dist;
    let cz = this.target.z + Math.cos(this.yaw) * cp * this.dist;
    // 카메라가 땅이나 물속으로 들어가지 않게 한다 (다리 위에서는 다리 높이를 기준으로)
    const floor = Math.max(heightAt(cx, cz), 0) + 0.35;
    const minY = player.state.surface === 'strip' ? Math.min(floor, this.target.y - 1.0) : floor;
    if (cy < minY) cy = minY;
    // 건물 안에서는 카메라가 벽·천장 밖으로 나가지 않게 당긴다
    const room = this.room;
    if (room) {
      const inside = (x, y, z) => { const rx = x - room.cx, rz = z - room.cz; return Math.abs(rx * room.ux + rz * room.uz) < room.hl && Math.abs(-rx * room.uz + rz * room.ux) < room.hw && y < room.yTop; };
      let k = 1;
      for (let i = 0; i < 12 && !inside(cx, cy, cz); i++) {
        k *= 0.8;
        cx = this.target.x + Math.sin(this.yaw) * cp * this.dist * k; cy = Math.max(this.target.y + sp * this.dist * k, room.yTop - 3.2); cz = this.target.z + Math.cos(this.yaw) * cp * this.dist * k;
      }
    }
    cam.position.set(cx, cy, cz);
    this.look.set(this.target.x, this.target.y + 0.15, this.target.z);
    cam.lookAt(this.look);
  }
}
