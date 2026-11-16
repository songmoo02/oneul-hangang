// 모바일 조작: 왼쪽 조이스틱(이동, 끝까지 밀면 달리기), 화면 드래그(시점), 두 손가락 벌리기(줌), 오른쪽 버튼들.
// 키보드와 같은 입력 통로(Input)를 그대로 쓰므로 게임 쪽 코드는 손대지 않는다.
export const isTouch = () => (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

export class Touch {
  constructor(game) {
    const input = game.input, root = document.getElementById('touch'), canvas = game.renderer.domElement;
    this.game = game;
    document.body.classList.add('touch');
    root.hidden = false;
    const help = document.querySelector('.maphelp');
    if (help) help.innerHTML = '<b>지도를 누르면 그곳으로 순간이동해요</b> · 지도 버튼으로 닫기';
    input.dragMode = true; // 모바일에는 포인터 잠금이 없다
    const press = (code) => { if (input.onKey) input.onKey(code, { preventDefault() {} }); };

    // ── 조이스틱
    const pad = document.getElementById('tpad'), knob = document.getElementById('tknob');
    let padId = null, cx = 0, cy = 0;
    const R = 52;
    const setKeys = (dx, dy) => {
      const l = Math.hypot(dx, dy), k = input.keys;
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) k.delete(c);
      if (l < R * 0.22) return;
      const a = Math.atan2(dx, -dy); // 0 = 위
      const s = Math.sin(a), c = Math.cos(a);
      if (c > 0.38) k.add('KeyW'); if (c < -0.38) k.add('KeyS');
      if (s > 0.38) k.add('KeyD'); if (s < -0.38) k.add('KeyA');
      if (l > R * 0.86 || this.run) k.add('ShiftLeft');
    };
    const moveKnob = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      setKeys(dx, dy);
    };
    pad.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; padId = t.identifier; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; moveKnob(t); }, { passive: false });
    pad.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === padId) moveKnob(t); }, { passive: false });
    const padEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === padId) { padId = null; knob.style.transform = ''; setKeys(0, 0); } };
    pad.addEventListener('touchend', padEnd); pad.addEventListener('touchcancel', padEnd);

    // ── 시점 드래그와 두 손가락 줌(캔버스 위)
    const pts = new Map(); let pinch = 0;
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of e.changedTouches) pts.set(t.identifier, { x: t.clientX, y: t.clientY }); pinch = 0; game.audio.start(); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (pts.size >= 2) {
        for (const t of e.changedTouches) if (pts.has(t.identifier)) pts.set(t.identifier, { x: t.clientX, y: t.clientY });
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) input.wheel += (pinch - d) * 0.04;
        pinch = d;
        return;
      }
      for (const t of e.changedTouches) {
        const p = pts.get(t.identifier); if (!p) continue;
        if (input.enabled) { input.dx += (t.clientX - p.x) * 1.5; input.dy += (t.clientY - p.y) * 1.5; }
        p.x = t.clientX; p.y = t.clientY;
      }
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) pts.delete(t.identifier); pinch = 0; };
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);

    // ── 버튼: 짧게 누르면 그 키, (일부는) 길게 누르면 다른 키
    for (const b of root.querySelectorAll('[data-key]')) {
      let timer = 0, long = false;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); long = false; b.classList.add('down');
        if (b.dataset.long) timer = setTimeout(() => { long = true; press(b.dataset.long); }, 650);
      }, { passive: false });
      const up = (e) => { e.preventDefault(); clearTimeout(timer); b.classList.remove('down'); if (!long && e.type === 'touchend') press(b.dataset.key); };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('click', (e) => { if (e.detail) press(b.dataset.key); }); // 마우스로도 눌린다
    }
    const run = document.getElementById('trun');
    const toggleRun = (e) => { e.preventDefault(); this.run = !this.run; run.classList.toggle('on', this.run); };
    run.addEventListener('touchstart', toggleRun, { passive: false });
    // 페이지가 스크롤·확대되지 않게
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }
}
