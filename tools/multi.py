import sys, time, json
from playwright.sync_api import sync_playwright
# usage: multi.py "query" name1 "js1" name2 "js2" ...  (한 번 로드해서 여러 장)
qs = sys.argv[1]; pairs = list(zip(sys.argv[2::2], sys.argv[3::2]))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
        args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'])
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    logs = []
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    pg.goto('http://localhost:4173/?' + qs)
    pg.wait_for_function('window.__hangang && window.__hangang.frames > 1', timeout=180000)
    pg.evaluate("document.getElementById('start').click()")
    for name, js in pairs:
        try:
            r = pg.evaluate('() => { const g = window.__hangang; ' + js + ' }')
            f0 = pg.evaluate('window.__hangang.frames')
            pg.wait_for_function(f'window.__hangang.frames > {f0 + 12}', timeout=120000)
            pg.screenshot(path=f'/tmp/{name}.png')
            print(name, 'ok', json.dumps(r) if r is not None else '', flush=True)
        except Exception as e:
            print(name, 'ERR', str(e)[:300], flush=True)
    for l in dict.fromkeys(logs): print(l[:300])
    b.close()
