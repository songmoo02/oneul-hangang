import sys, time, json
from playwright.sync_api import sync_playwright
# usage: shot.py out.png "q=mid&t=17.3" [frames] [w] [h] [js]
out = sys.argv[1]; qs = sys.argv[2] if len(sys.argv) > 2 else ''
frames = int(sys.argv[3]) if len(sys.argv) > 3 else 6
W = int(sys.argv[4]) if len(sys.argv) > 4 else 1280
H = int(sys.argv[5]) if len(sys.argv) > 5 else 720
js = sys.argv[6] if len(sys.argv) > 6 else ''
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
        args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    logs = []
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    t0 = time.time()
    pg.goto('http://localhost:4173/?' + qs)
    try:
        pg.wait_for_function('window.__hangang && window.__hangang.frames > 1', timeout=180000)
        import os
        if not os.environ.get('NOSTART'): pg.evaluate("document.getElementById('start').click()")
        if js: pg.evaluate(js)
        f0 = pg.evaluate('window.__hangang.frames')
        pg.wait_for_function(f'window.__hangang.frames > {f0 + frames}', timeout=240000)
        info = pg.evaluate('''() => { const g = window.__hangang; const r = g.renderer.info; return { fps: g.fps, calls: g.stats.calls, tris: g.stats.tris, geos: r.memory.geometries, tex: r.memory.textures, hour: g.env.hour, fine: g.terrain.fineCount, trees: g.veg.count, lamps: g.props.lampCount, bld: g.city.count, pos: g.player.state.toJSON() }; }''')
        print(json.dumps(info))
    except Exception as e:
        print('ERR', str(e)[:300])
    pg.screenshot(path=out)
    print('time', round(time.time() - t0, 1))
    for l in logs[:25]: print(l[:400])
    b.close()
