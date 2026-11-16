import sys, json
from playwright.sync_api import sync_playwright
qs = sys.argv[1]; expr = sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'])
    pg = b.new_page(viewport={'width': 640, 'height': 360})
    logs = []
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    pg.goto('http://localhost:4173/?' + qs)
    pg.wait_for_function('window.__hangang && window.__hangang.frames > 3', timeout=180000)
    print(json.dumps(pg.evaluate(expr), ensure_ascii=False)[:3000])
    for l in logs[:12]: print(l[:600])
    b.close()
