// 사진 모드(P): UI를 숨기고 필터·화각을 골라 찍는다. 찍은 사진은 앨범에 모인다.
const FILTERS = ['기본', '따뜻하게', '필름', '흑백', '선명하게'];

export class Photo {
  constructor(game) {
    this.g = game;
    this.open = false;
    this.album = [];
    this.fov0 = game.camera.fov;
    const $ = (id) => document.getElementById(id);
    this.el = { bar: $('photo'), filters: $('pfilters'), fov: $('pfov'), hide: $('phide'), shoot: $('pshoot'), albumBtn: $('palbum'), close: $('pclose'), album: $('album'), grid: $('albumgrid'), flash: $('flash'), count: $('pcount') };
    FILTERS.forEach((name, i) => {
      const b = document.createElement('button');
      b.textContent = name;
      b.addEventListener('click', () => { this.setFilter(i); });
      this.el.filters.appendChild(b);
    });
    this.el.fov.addEventListener('input', () => { game.camera.fov = parseFloat(this.el.fov.value); game.camera.updateProjectionMatrix(); });
    this.el.hide.addEventListener('click', () => { game.player.mesh.visible = !game.player.mesh.visible; this.el.hide.classList.toggle('on', !game.player.mesh.visible); });
    this.el.shoot.addEventListener('click', () => this.shoot());
    this.el.albumBtn.addEventListener('click', () => this.showAlbum(true));
    this.el.close.addEventListener('click', () => this.toggle(false));
    $('albumclose').addEventListener('click', () => this.showAlbum(false));
    this.setFilter(0);
  }

  setFilter(i) {
    this.filter = i;
    this.g.post.finalMat.uniforms.uFilter.value = this.open ? i : 0;
    [...this.el.filters.children].forEach((b, k) => b.classList.toggle('on', k === i));
  }

  toggle(force) {
    const g = this.g;
    this.open = force ?? !this.open;
    this.el.bar.classList.toggle('open', this.open);
    document.getElementById('hud').classList.toggle('photohide', this.open);
    g.input.forceDrag = this.open;
    if (this.open) {
      g.input.exitLock();
      this.fov0 = g.camera.fov;
      this.el.fov.value = g.camera.fov;
    } else {
      g.camera.fov = this.fov0; g.camera.updateProjectionMatrix();
      g.player.mesh.visible = true; this.el.hide.classList.remove('on');
      this.showAlbum(false);
    }
    g.post.finalMat.uniforms.uFilter.value = this.open ? this.filter : 0;
  }

  shoot() { if (this.open) this.g._shoot = true; }

  // 렌더 직후 같은 프레임에서 호출된다
  capture(canvas) {
    let url;
    try { url = canvas.toDataURL('image/jpeg', 0.92); } catch { return; }
    this.album.unshift({ url, place: this.g.player.state.place, time: this.g.env.clockText() });
    if (this.album.length > 40) this.album.pop();
    this.el.count.textContent = this.album.length;
    this.el.flash.classList.remove('go'); void this.el.flash.offsetWidth; this.el.flash.classList.add('go');
    this.g.audio?.sfx('shutter');
  }

  showAlbum(show) {
    this.el.album.classList.toggle('open', show);
    if (!show) return;
    const grid = this.el.grid;
    grid.innerHTML = '';
    if (!this.album.length) { grid.innerHTML = '<p class="empty">아직 찍은 사진이 없어요. 촬영 버튼이나 스페이스바로 찍어 보세요.</p>'; return; }
    this.album.forEach((ph, i) => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = ph.url; img.alt = `${ph.place} ${ph.time}`;
      const cap = document.createElement('figcaption');
      const a = document.createElement('a');
      a.href = ph.url; a.download = `oneul-hangang-${String(this.album.length - i).padStart(2, '0')}.jpg`; a.textContent = '저장';
      cap.append(`${ph.place || '한강'} · ${ph.time} `, a);
      fig.append(img, cap);
      grid.appendChild(fig);
    });
  }
}
