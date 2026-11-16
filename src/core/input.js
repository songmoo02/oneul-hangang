// 키보드·마우스 입력. 포인터 잠금이 막힌 환경에서는 "드래그로 시점 회전"으로 자동 전환한다.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.dragMode = false;
    this.forceDrag = false; // 사진 모드: 커서를 보이면서 드래그로 시점 회전
    this.dragging = false;
    this.enabled = true;
    this.onUnlock = null; // 포인터 잠금이 풀렸을 때(Esc)
    this.onKey = null; // 단발성 키

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, e);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; });

    dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0 || e.button === 2) this.dragging = true;
      if (!this.locked && !this.dragMode && !this.forceDrag && e.button === 0) this.requestLock();
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || ((this.dragMode || this.forceDrag) && this.dragging)) {
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      }
    });
    dom.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === dom;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
    document.addEventListener('pointerlockerror', () => { this.dragMode = true; });
  }

  // 반드시 클릭 핸들러 안에서 호출
  requestLock() {
    if (this.dragMode || this.forceDrag) return;
    try {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.dragMode = true; });
    } catch {
      this.dragMode = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }

  consume() {
    const r = { dx: this.dx, dy: this.dy, wheel: this.wheel };
    this.dx = 0; this.dy = 0; this.wheel = 0;
    return r;
  }
}
