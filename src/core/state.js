// 플레이어 상태: 렌더링과 분리된 순수 데이터. 직렬화가 가능해 나중에 멀티플레이어 동기화에 그대로 쓸 수 있다.
export class PlayerState {
  constructor() {
    this.id = 'local';
    this.x = 0; this.y = 0; this.z = 0;
    this.yaw = 0; // 캐릭터가 바라보는 방향
    this.speed = 0;
    this.anim = 'idle'; // idle | walk | run
    this.mount = null; // 탑승 상태(따릉이·오리배·한강버스 등) – 이후 단계에서 사용
    this.surface = 'ground'; // ground | strip
    this.place = '';
  }

  toJSON() {
    const r = (v) => Math.round(v * 100) / 100;
    return { id: this.id, x: r(this.x), y: r(this.y), z: r(this.z), yaw: r(this.yaw), speed: r(this.speed), anim: this.anim, mount: this.mount };
  }

  apply(o) {
    if (!o) return this;
    for (const k of ['id', 'x', 'y', 'z', 'yaw', 'speed', 'anim', 'mount']) if (o[k] !== undefined) this[k] = o[k];
    return this;
  }
}

// 브라우저 저장소(없거나 막혀 있어도 게임은 계속된다)
export const store = {
  load(key) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
  },
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  },
};
