// 오늘의 한강 – 진입점. 세계를 단계별로 만들고 매 프레임을 굴린다.
import * as THREE from 'three';
import './ui/style.css';
import { QUALITY, SAVE_KEY } from './config.js';
import { makeNoiseTexture, makeWaterNormalTexture } from './core/textures.js';
import { Input } from './core/input.js';
import { store } from './core/state.js';
import { WalkWorld } from './world/walk.js';
import { planBridges, buildBridges } from './world/bridges.js';
import { buildTerrain } from './world/terrain.js';
import { Water } from './world/water.js';
import { buildCity } from './world/city.js';
import { buildVegetation } from './world/vegetation.js';
import { buildProps } from './world/props.js';
import { Trail, TRAIL_N } from './world/wind.js';
import { GrassMap } from './world/grassmap.js';
import { buildGrass } from './world/grass.js';
import { buildLeaves } from './world/leaves.js';
import { bankOffset, sampleField, isGroundWalkable, pathSDF, PLAZA_POINTS, NODEUL_FRAME, SEORAE_FRAME } from './world/field.js';
import { buildNPCs } from './npc/npcs.js';
import { buildTraffic } from './world/traffic.js';
import { planBoats, buildBoats } from './world/boats.js';
import { planFacilities, buildFacilities } from './game/facilities.js';
import { Interact } from './game/interact.js';
import { Ripples } from './fx/ripples.js';
import { buildFountain } from './fx/fountain.js';
import { buildAnimals } from './world/animals.js';
import { AudioEngine } from './audio/audio.js';
import { Photo } from './ui/photo.js';
import { buildFlowers } from './world/flowers.js';
import { buildFireworks } from './fx/fireworks.js';
import { Hearts } from './fx/hearts.js';
import { buildSupercars } from './world/supercars.js';
import { buildPigeons } from './world/pigeons.js';
import { buildExtras } from './world/extras.js';
import { buildCritters } from './fx/critters.js';
import { Multi } from './net/multi.js';
import { Touch, isTouch } from './ui/touch.js';
import { clamp } from './core/math.js';
import { toWorld, WALK_X_MIN, WALK_X_MAX } from './world/geo.js';
import { Environment } from './sky/environment.js';
import { skyUniforms } from './sky/skyglsl.js';
import { Player } from './player/player.js';
import { CameraRig } from './player/camera.js';
import { PostFX } from './fx/post.js';
import { HUD } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.started = false;
    this.menuOpen = false;
    this.fps = 60;
    this.saveT = 0;
    this.autoQ = { t: 0, frames: 0, done: false };
  }

  async init() {
    const canvas = $('view');
    const saved = store.load(SAVE_KEY) || {};
    this.qualityName = params.get('q') || saved.quality || (isTouch() ? 'low' : 'mid'); // 모바일은 낮음 화질로 시작
    if (!QUALITY[this.qualityName]) this.qualityName = 'mid';
    this.userPickedQuality = !!(params.get('q') || saved.quality);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // 톤매핑은 후처리 마지막 단계에서 직접 한다
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 16000);
    camera.layers.enable(1); // 1번 레이어: 수면 반사에는 넣지 않는 것들
    this.scene = scene; this.camera = camera;

    const uniforms = {
      uTime: { value: 0 },
      uNoise: { value: null }, uWaterNormal: { value: null },
      uWet: { value: 0 }, uRain: { value: 0 }, uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(1, 0) },
      uKeyDir: { value: new THREE.Vector3(0, 1, 0) }, uKeyColor: { value: new THREE.Color(1, 1, 1) },
      uNightK: { value: 0 }, uLampOn: { value: 0 }, uWinLit: { value: 0 },
      uFogDensity: { value: 0.0002 }, uMist: { value: 0 }, uExposure: { value: 1 }, uGodRays: { value: 0 },
      uRainColor: { value: new THREE.Color(0.7, 0.75, 0.8) }, uPixelScale: { value: 800 },
      uSunDirRef: skyUniforms.uSunDir.value,
      uFoamCol: { value: new THREE.Color(0.8, 0.85, 0.9) },
      uGust: { value: 0 }, uAmbientCol: { value: new THREE.Color(0.2, 0.25, 0.3) },
      uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4(1e6, 1e6, -100, 0)) },
    };
    const ctx = {
      scene, renderer, camera, uniforms, quality: QUALITY[this.qualityName],
      walk: new WalkWorld(), lamps: [], nightMaterials: [], wetMaterials: [], materials: {},
    };
    this.ctx = ctx;

    const steps = [
      ['하늘을 펼치는 중…', () => {
        uniforms.uNoise.value = makeNoiseTexture(256);
        uniforms.uWaterNormal.value = makeWaterNormalTexture(256);
        this.env = new Environment(ctx);
      }],
      ['강줄기와 둔치를 다지는 중…', () => { planBridges(ctx); planBoats(ctx); planFacilities(ctx); this.terrain = buildTerrain(ctx); }],
      ['한강에 물을 채우는 중…', () => { this.water = new Water(ctx); ctx.water = this.water; }],
      ['대교를 놓는 중…', () => { buildBridges(ctx); }],
      ['도시의 불빛을 세우는 중…', () => { this.city = buildCity(ctx); }],
      ['가을 나무를 심는 중…', () => { this.veg = buildVegetation(ctx); }],
      ['배를 띄우고 차와 열차를 보내는 중…', () => { this.boats = buildBoats(ctx); this.traffic = buildTraffic(ctx); }],
      ['산책 나온 사람들을 부르는 중…', () => { this.npcs = buildNPCs(ctx); this.facilities = buildFacilities(ctx); }],
      ['가로등과 벤치를 놓는 중…', () => {
        this.props = buildProps(ctx);
        this.extras = buildExtras(ctx);
        // 나무·가로등·벤치는 통과할 수 없다
        const wk = ctx.walk;
        for (const t of ctx.trees || []) wk.addCircle(t.x, t.z, 0.26 * (t.s || 1), t.y - 2, t.y + 4);
        for (const l of ctx.lamps) if (l.kind !== 'low') wk.addCircle(l.x, l.z, 0.1, l.y - 1.5, l.y + 3);
        for (const b of ctx.benches || []) wk.addBox(b.x - b.dirx * 0.2, b.z - b.dirz * 0.2, -b.dirz, b.dirx, 0.85, 0.2, b.y - 1, b.y + 2);
      }],
      ['풀과 억새, 낙엽에 바람을 불어넣는 중…', () => {
        this.grassMap = new GrassMap(ctx);
        this.grass = buildGrass(ctx, this.grassMap);
        this.leaves = buildLeaves(ctx, this.grassMap);
        this.flowers = buildFlowers(ctx);
        this.trail = new Trail(uniforms.uTrail);
      }],
      ['새들과 분수를 깨우는 중…', () => {
        this.ripples = new Ripples(ctx);
        this.animals = buildAnimals(ctx, this.ripples);
        this.fountain = buildFountain(ctx);
        this.fireworks = buildFireworks(ctx);
        this.supercars = buildSupercars(ctx);
        this.pigeons = buildPigeons(ctx);
        this.critters = buildCritters(ctx, this.flowers, this.ripples);
        this.hearts = new Hearts(ctx);
      }],
      ['산책 준비 중…', () => {
        this.player = new Player(ctx);
        this.rig = new CameraRig(camera);
        this.post = new PostFX(ctx);
        this.input = new Input(canvas);
        this.audio = new AudioEngine();
        this.hud = new HUD(this);
        this._mapPoints();
        this.hud.buildMap();
        this.interact = new Interact(this);
        this.photo = new Photo(this);
        this.player.onStep = (runK) => this.audio.step(this._surface(), runK);
        this.npcs.onBell = () => this.audio.sfx('bell');
        this.animals.takeoff = () => this.audio.sfx('flap');
        this.animals.onSplash = (d) => { if (d < 45) this.audio.sfx('plop', 0.5); };
        // 불꽃놀이: 쏘아 올릴 때 휘파람, 터질 때는 거리만큼 늦게 쿵 소리와 환호
        const fw = this.fireworks, far = (x, z) => Math.hypot(x - this.player.state.x, z - this.player.state.z);
        fw.onStart = () => this.hud.caption('여의도 불꽃놀이가 시작됐어요! 밤하늘을 올려다보세요', 6);
        fw.onLaunch = (x, z) => { const d = far(x, z); if (d < 900) this.audio.sfx('whistle', clamp(1.3 - d / 700, 0.1, 1)); };
        fw.onBurst = (p) => {
          const d = far(p.x, p.z), k = clamp(1.25 - d / 1500, 0.12, 1);
          this.audio.sfx('boom', k, Math.min(3.5, d / 400));
          if (d < 520 && Math.random() < 0.45) this.audio.sfx('cheer', clamp(1.2 - d / 520, 0.2, 1), Math.min(3.5, d / 400) + 0.4);
        };
        this.critters.onJump = (d, up) => { this.audio.sfx('splash', up ? 0.7 : 1); if (up && !this._dolphinSeen) { this._dolphinSeen = true; this.hud.caption('어, 돌고래다! 한강버스 옆에서 뛰어올라요', 4.5); } };
        if (isTouch() || params.get('touch')) this.touch = new Touch(this);
        this.multi = new Multi(this);
        this.multi.onAct = (kind, r) => this.interact.onPeerAct(kind, r);
        this.multi.start();
        this.pigeons.onFlap = (fl) => { const d = far(fl.x, fl.z); if (d < 60) this.audio.sfx('flap', clamp(1.2 - d / 60, 0.2, 1)); };
        this.pigeons.onMeet = () => this.hud.caption('비둘기 떼에 둘러싸인 할아버지가 모이를 뿌리고 있어요', 4.5);
        this.supercars.onPass = (c, d) => { this.audio.sfx('vroom', clamp(1.2 - d / 14, 0.3, 1)); if (Math.random() < 0.5) this.hud.caption(`${c.name}가 지나가요`, 2.2); };
        let motoT = 0;
        this.npcs.onMoto = (dt, d) => { motoT -= dt; if (motoT <= 0 && d < 70) { motoT = 0.085; this.audio.sfx('moto', clamp(1.1 - d / 70, 0.05, 1)); } };
        document.querySelector('[data-rainbow]')?.addEventListener('click', (e) => { this.extras.force = !this.extras.force; e.target.classList.toggle('on', this.extras.force); });
        for (const b of document.querySelectorAll('[data-gender]')) b.addEventListener('click', () => {
          this.player.setGender(b.dataset.gender);
          document.querySelectorAll('[data-gender]').forEach((q) => q.classList.toggle('on', q.dataset.gender === b.dataset.gender));
        });
      }],
    ];
    for (let i = 0; i < steps.length; i++) {
      $('loadtext').textContent = steps[i][0];
      $('bar').style.width = `${Math.round(((i + 0.5) / steps.length) * 100)}%`;
      await nextFrame(); await nextFrame();
      steps[i][1]();
    }
    $('bar').style.width = '100%';

    // 시작 위치는 매번 무작위(강변 산책로 위)
    this.resetPosition();
    if (typeof saved.hour === 'number') this.env.hour = saved.hour;
    if (saved.weather && !params.get('w')) this.env.weather.set(saved.weather, true);
    this._applyParams();

    this.setQuality(this.qualityName, false);
    window.addEventListener('resize', () => this.resize());
    this._bindUI();

    this.last = performance.now();
    renderer.setAnimationLoop((t) => this.frame(t));
    window.__hangang = this;
  }

  // 확인용 URL 파라미터 (?t=17.5&w=rain&x=..&z=..&yaw=..&pitch=..&dist=..&pause=1)
  _applyParams() {
    const num = (k) => (params.has(k) ? parseFloat(params.get(k)) : null);
    if (num('t') !== null) this.env.hour = num('t');
    if (params.get('w')) { this.env.weather.locked = true; this.env.weather.set(params.get('w'), true); }
    if (num('x') !== null && num('z') !== null) this.player.place(num('x'), num('z'), num('face') ?? 0, num('y'));
    if (num('yaw') !== null) this.rig.yaw = num('yaw');
    if (num('pitch') !== null) this.rig.pitch = num('pitch');
    if (num('dist') !== null) this.rig.dist = this.rig.distTarget = num('dist');
    if (params.get('pause')) this.env.paused = true;
    if (num('gust') !== null) { const w = this.env.weather; w.gustTarget = num('gust'); w.gustHold = 1e6; }
    if (num('wind') !== null) { this.windOverride = num('wind'); }
    if (params.get('cam')) this.freeCam = params.get('cam').split(',').map(Number);
    if (params.get('fps')) $('fps').style.display = 'block'; else $('fps').style.display = 'none';
  }

  // 지도에 표시할 시설과 바로가기 목록
  _mapPoints() {
    const { docks, duckDock } = this.boats, fc = this.facilities, F = NODEUL_FRAME, S = SEORAE_FRAME;
    const jam = this.ctx.bridgePlans.find((p) => p.id === 'banpo'), hg = this.ctx.bridgePlans.find((p) => p.id === 'hangang'), mp = this.ctx.bridgePlans.find((p) => p.id === 'mapo');
    const pois = [];
    for (const d of Object.values(docks)) pois.push({ x: d.x, z: d.z, color: '#2a6fb0', text: d.big ? '선착장·편의점' : '선착장' });
    pois.push({ x: duckDock.x, z: duckDock.z, color: '#e9a02a', text: '오리배' });
    pois.push({ x: fc.truck.x, z: fc.truck.z, color: '#c0462a', text: '푸드트럭' });
    for (const z of fc.zones) pois.push({ x: z.x, z: z.z, color: '#c0462a', text: '치킨' });
    for (const r of fc.racks) pois.push({ x: r.x, z: r.z, color: '#2f8a4a', text: '' });
    pois.push({ x: this.fountain.x, z: this.fountain.z, color: '#8f7bff', text: '분수' });
    pois.push({ x: this.pigeons.grandpa.x, z: this.pigeons.grandpa.z, color: '#8a8d92', text: '' });
    pois.push({ x: this.fireworks.site.x, z: this.fireworks.site.z, color: '#ffb02a', text: '불꽃놀이 20시' });
    for (const fp of this.flowers.patches) pois.push({ x: fp.x, z: fp.z, color: '#f27ab0', text: '' });
    this.hud.pois = pois;
    const land = (d, k) => ({ x: d.bank.x + d.bank.lx * k, z: d.bank.z + d.bank.lz * k });
    const jm = jam.at(jam.mid), hm = hg.at(hg.sW0 + 60, hg.W / 2 - 1.5), mm = mp.at(mp.mid, mp.W / 2 - 1.5);
    this.places = [
      { name: '여의도 선착장·편의점', ...land(docks.yeouido, 8) },
      { name: '여의도 물빛광장', x: PLAZA_POINTS[0].x, z: PLAZA_POINTS[0].z },
      { name: '오리배 선착장', ...land({ bank: duckDock.bank }, 8) },
      { name: '불꽃놀이 명당', ...(() => { const b = bankOffset('S', this.fireworks.site.x, 4.5); return { x: b.x, z: b.z }; })() },
      { name: '코스모스 꽃밭', x: this.flowers.patches[0].x + this.flowers.patches[0].r + 1.5, z: this.flowers.patches[0].z },
      { name: '마포대교 위', x: mm[0], z: mm[1] },
      { name: '노들섬 라이브하우스', x: this.extras.nodeul.live[0], z: this.extras.nodeul.live[1] },
      { name: '글자 조형물', x: this.extras.sculpt.x, z: this.extras.sculpt.z },
      { name: '한강대교 위', x: hm[0], z: hm[1] },
      { name: '이촌한강공원', x: PLAZA_POINTS[4].x, z: PLAZA_POINTS[4].z },
      { name: '반포 선착장', ...land(docks.banpo, 8) },
      { name: '서래섬', x: S.cx, z: S.cz },
      { name: '반포 달빛광장', x: PLAZA_POINTS[3].x, z: PLAZA_POINTS[3].z },
      { name: '잠수교', x: jm[0], z: jm[1] },
    ];
    this.hud.setPlaces(this.places);
  }

  // 발밑이 무엇인지(발소리용)
  _surface() {
    const pl = this.player, s = pl.state;
    if (s.surface === 'strip') return pl.lastStrip && (pl.lastStrip.tag === 'seorae' || pl.lastStrip.tag === 'dock') ? 'wood' : 'hard';
    const f = sampleField(s.x, s.z, this._sf || (this._sf = {}));
    let hard = false;
    if (f.zone <= 1) hard = f.d < 5 || (f.d > 5.8 && f.d < 9.6) || (f.w > 20 && f.d > 11.8 && f.d < 16.6) || pathSDF(s.x, s.z) < 0;
    else if (f.zone === 2) hard = (f.d > 5 && f.d < 9.8) || s.y > NODEUL_FRAME.topY - 1.2;
    if (hard) return 'hard';
    return this.grassMap.canopy(s.x, s.z) > 0.45 ? 'leaves' : 'grass';
  }

  // 지도에서 고른 곳으로 순간이동: 걸을 수 있는 가장 가까운 지점(다리 위를 눌렀으면 보도)으로 간다
  teleport(x, z, fromMap) {
    const pl = this.player, ctx = this.ctx, f = {};
    if (pl.mode === 'busy') { this.hud.toast('하던 일을 마친 뒤에 이동할 수 있어요'); return false; }
    this.interact.dismount(); // 배·따릉이·나무에서 내린 상태로 이동한다
    x = clamp(x, WALK_X_MIN + 20, WALK_X_MAX - 20);
    const yaw = pl.state.yaw;
    let ok = false;
    sampleField(x, z, f);
    if (isGroundWalkable(f)) ok = pl.place(x, z, yaw);
    if (!ok) {
      const p = ctx.nearBridge(x, z, 0);
      if (p) {
        const rx = x - p.ax, rz = z - p.az;
        const sv = clamp(rx * p.dx + rz * p.dz, 10, p.L - 10), a = rx * p.sx + rz * p.sz;
        if (p.jamsu) { const sj = clamp(sv, p.jamsu.s0 + 3, p.jamsu.s1 - 3), q = p.at(sj, clamp(a, -5, 5)); ok = pl.place(q[0], q[1], yaw, p.jamsu.y(sj)); }
        else if (p.def.walk) { const q = p.at(sv, (a >= 0 ? 1 : -1) * (p.W / 2 - 1.5)); ok = pl.place(q[0], q[1], yaw, p.deckY(sv) + 0.12); }
      }
    }
    for (let r = 3; r < 400 && !ok; r += 3) {
      for (let k = 0; k < 16 && !ok; k++) {
        const a = (k / 16) * Math.PI * 2 + r * 0.3, tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
        if (isGroundWalkable(sampleField(tx, tz, f)) && tx > WALK_X_MIN + 15 && tx < WALK_X_MAX - 15) ok = pl.place(tx, tz, yaw);
      }
    }
    if (!ok) { this.hud.toast('그곳으로는 갈 수 없어요'); return false; }
    if (pl.mode === 'sit') { pl.mode = 'walk'; pl.sitLow = false; }
    this.rig._init = false;
    this.audio.sfx('whoosh');
    if (fromMap) this.closeMap(true);
    return true;
  }

  openMap() {
    if (this.photo.open || this.menuOpen) return;
    this.mapOpen = true;
    this.input.enabled = false;
    this.input.exitLock();
    this.hud.toggleBigMap(true);
  }

  closeMap(fromClick) {
    this.mapOpen = false;
    this.input.enabled = true;
    this.hud.toggleBigMap(false);
    if (fromClick !== undefined) this.input.requestLock();
  }

  // 강변 산책로 위의 무작위 지점으로 (다시) 태어난다
  resetPosition() {
    const trees = this.ctx.trees || [];
    for (let k = 0; k < 60; k++) {
      const bank = Math.random() < 0.5 ? 'N' : 'S';
      const x = WALK_X_MIN + 60 + Math.random() * (WALK_X_MAX - WALK_X_MIN - 120);
      const p = bankOffset(bank, x, 7.7);
      if (this.ctx.nearBridge(p.x, p.z, 14)) continue;
      if (trees.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 9)) continue;
      // 강 하류(서쪽, 해 지는 방향)를 바라보며 시작
      const fx = -p.tx, fz = -p.tz;
      if (!this.player.place(p.x, p.z, Math.atan2(fx, fz))) continue;
      this.rig.yaw = Math.atan2(-fx, -fz) + (bank === 'N' ? 0.35 : -0.35);
      this.rig.pitch = 0.16; this.rig.dist = this.rig.distTarget = 5.6;
      this.rig._init = false;
      this.spawn = p;
      return;
    }
    const p = bankOffset('N', toWorld(0, 126.9652).x, 7.7);
    this.player.place(p.x, p.z, -1.2);
    this.rig.yaw = 1.94; this.rig._init = false;
  }

  setQuality(name, byUser) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    if (byUser) this.userPickedQuality = true;
    const q = QUALITY[name];
    this.ctx.quality = q;
    this.renderer.setPixelRatio(q.pixelRatio);
    this.env.setQuality(q);
    this.water.setQuality(q);
    this.post.setQuality(q);
    this.grass.setQuality(q);
    this.leaves.setQuality(q);
    this.resize();
  }

  resize() {
    const el = $('app');
    const w = Math.max(320, el.clientWidth), h = Math.max(240, el.clientHeight);
    this.renderer.setSize(w, h, false);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bufW = s.x; this.bufH = s.y;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(s.x, s.y);
    this.ctx.uniforms.uPixelScale.value = s.y / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  _bindUI() {
    const intro = $('intro');
    intro.classList.add('ready');
    $('loadtext').hidden = true;
    document.querySelector('.bar').hidden = true;
    $('start').hidden = false;
    $('starthelp').hidden = false;
    $('start').addEventListener('click', () => {
      intro.classList.add('gone');
      $('hud').classList.remove('hidden');
      this.started = true;
      document.body.classList.add('started');
      this.audio.start();
      this.input.requestLock();
      $('view').focus();
    });
    this.input.onUnlock = () => { if (this.started && !this.menuOpen && !this.mapOpen && !this.photo.open) this.pause(); };
    this.input.onKey = (code, e) => {
      if (!this.started) return;
      if (code === 'Escape') {
        if (this.photo.open) this.photo.toggle(false);
        else if (this.mapOpen) this.closeMap();
        else if (this.menuOpen) this.resume(false);
        else if (!this.input.locked) this.pause();
        return;
      }
      if (this.menuOpen) return;
      if (code === 'KeyM') { if (this.mapOpen) this.closeMap(true); else this.openMap(); return; }
      if (code === 'KeyP' && !this.mapOpen) { this.photo.toggle(); if (!this.photo.open) this.input.requestLock(); return; }
      if (this.photo.open) { if (code === 'Space' || code === 'Enter') { this.photo.shoot(); e.preventDefault(); } return; }
      if (this.mapOpen) return;
      if (code === 'KeyE' || code === 'KeyF' || code === 'KeyQ' || code === 'KeyG' || code === 'KeyK' || code === 'Digit0' || code === 'Digit9' || code === 'Numpad0' || code === 'Numpad9') this.interact.key(code);
      // 확인용 단축키
      if (code === 'BracketRight') { this.env.hour = (this.env.hour + 1) % 24; this.env.sky.envTimer = 1e9; }
      if (code === 'BracketLeft') { this.env.hour = (this.env.hour + 23) % 24; this.env.sky.envTimer = 1e9; }
    };
  }

  pause() {
    this.menuOpen = true;
    this.input.enabled = false;
    this.hud.showMenu(true);
  }

  resume(fromClick) {
    this.menuOpen = false;
    this.input.enabled = true;
    this.hud.showMenu(false);
    this.audio.start();
    if (fromClick) this.input.requestLock();
  }

  frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.fps += (1 / dt - this.fps) * 0.05;
    const u = this.ctx.uniforms;
    u.uTime.value += dt;
    this.stats = { calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles };
    this.renderer.info.reset();

    const mouse = this.input.consume();
    const active = this.started && !this.menuOpen && !this.mapOpen;
    const control = active && !this.photo.open ? this.input : null;
    this.boats.update(dt, this.env);
    this.interact.update(dt, control);
    this.player.update(dt, control, this.rig.yaw);
    if (!this.started) this.rig.yaw += dt * 0.012; // 시작 화면에서는 천천히 둘러본다
    this.rig.update(dt, this.player, active ? mouse : null);
    if (this.freeCam) { const c = this.freeCam; this.camera.position.set(c[0], c[1], c[2]); this.camera.lookAt(c[3], c[4], c[5]); }
    this.camera.updateMatrixWorld();
    this.env.update(dt, this.player.mesh.position, this.camera);
    this.props.update(this.player.state.x, this.player.state.z, u.uLampOn.value);
    const ps = this.player.state;
    this.grassMap.update(ps.x, ps.z);
    this.grass.update(ps.x, ps.z);
    this.leaves.update(ps.x, ps.z);
    if (ps.surface === 'ground' && ps.speed > 0.3) this.trail.mark(ps.x, ps.z, u.uTime.value, 1);
    this.terrain.update(this.camera.position);
    this.veg.update(this.camera.position);
    this.npcs.update(dt, this.env, this.player);
    this.traffic.update(dt, this.env, this.player);
    this.animals.update(dt, this.env, this.player);
    this.fountain.update(dt, this.env.hour, () => { if (Math.hypot(this.fountain.x - ps.x, this.fountain.z - ps.z) < 900) this.hud.caption('반포대교 달빛무지개분수 쇼가 시작됐어요', 5); });
    this.fireworks.update(dt, this.env.hour, this.camera, this.renderer);
    this.npcs.cheer = Math.max(this.fireworks.active ? 0.25 : 0, this.fireworks.flash);
    this.hearts.update(dt);
    this.supercars.update(dt, this.env, this.player);
    this.pigeons.update(dt, this.env, this.player, this.npcs);
    this.extras.update(dt, this.env, this.player);
    this.critters.update(dt, this.env, this.player, this.player.mode === 'bus' ? this.interact.bus : null);
    this.multi.update(dt);
    this.audio.update(dt, this);

    this.water.renderReflection(this.renderer, this.scene, this.camera, this.bufW, this.bufH);
    this.post.render(this.scene, this.camera);
    if (this._shoot) { this._shoot = false; this.photo.capture(this.renderer.domElement); }
    this.hud.update(dt, this.player, this.env, this.fps);

    if (this.started && this.input.dragMode && !this._dragTold) {
      this._dragTold = true;
      this.hud.toast(this.touch ? '화면을 밀면 시점이 돌아가요. 두 손가락으로 벌리면 확대돼요' : '마우스를 누른 채 움직이면 시점이 돌아가요', 5);
    }
    this._autoQuality(dt);
    this.saveT += dt;
    if (this.saveT > 4 && this.started) { this.saveT = 0; this.save(); }
    this.frames = (this.frames || 0) + 1;
  }

  // 처음 몇 초 동안 프레임이 낮으면 품질을 한 단계 내린다(직접 고른 경우는 건드리지 않음)
  _autoQuality(dt) {
    const a = this.autoQ;
    if (a.done || this.userPickedQuality || !this.started) return;
    a.t += dt;
    if (a.t < 3) return;
    a.frames++;
    if (a.t > 7) {
      const avg = a.frames / (a.t - 3);
      if (avg < 30 && this.qualityName !== 'low') {
        this.setQuality(this.qualityName === 'high' ? 'mid' : 'low', false);
        this.hud.toast('부드럽게 걸을 수 있도록 그래픽 품질을 낮췄어요', 4);
        a.t = 0; a.frames = 0;
        if (this.qualityName === 'low') a.done = true;
      } else a.done = true;
    }
  }

  save() {
    store.save(SAVE_KEY, {
      hour: this.env.hour,
      weather: this.env.weather.state,
      quality: this.userPickedQuality ? this.qualityName : undefined,
    });
  }
}

const game = new Game();
game.init().catch((err) => {
  console.error(err);
  const t = document.getElementById('loadtext');
  if (t) { t.hidden = false; t.textContent = '불러오는 중 문제가 생겼어요: ' + (err && err.message ? err.message : err); }
});
