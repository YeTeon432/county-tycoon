/**
 * 网页版无头截图（验收界面用）。先构建 web-mobile：
 *   CocosCreator --project county-tycoon --build "configPath=build-configs/web-mobile.json"
 * 再跑：
 *   node tests/web/shot.mjs <输出目录> "wait 6" "shot start" "tap 215 600" "wait 1" "shot after" ...
 *
 * 动作：wait 秒 / tap x y（CSS 像素，430×932 竖屏）/ drag x1 y1 x2 y2 / twist cx cy 半径 度数 / pinch cx cy r0 r1 / shot 名字 / eval JS / fresh（清存档重载）
 * 手机尺寸 430×932 @3x（iPhone 15 Pro Max 级别）。Chrome 走 CDP，Node 22 自带 WebSocket。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../build/web-mobile', import.meta.url));   // 路径有中文，不能用 .pathname
const OUT = resolve(process.argv[2] ?? '/tmp/shots');
const STEPS = process.argv.slice(3);
const W = 430, H = 932, DPR = 3;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
    try {
        const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
        const data = await readFile(p);
        res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
        res.end(data);
    } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--user-data-dir=/tmp/shot-chrome', `--window-size=${W},${H}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok) => chrome.stderr.on('data', (d) => { const m = String(d).match(/ws:\/\/\S+/); if (m) ok(m[0]); }));
const targets = await (await fetch(wsUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '/json'))).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener('open', ok));
let id = 0; const wait = new Map();
ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('[页面报错]', m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
    if (m.method === 'Runtime.exceptionThrown') console.log('[页面异常]', m.params.exceptionDetails.exception?.description?.slice(0, 300));
});
const cdp = (method, params = {}) => new Promise((ok) => { const i = ++id; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });

await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
await cdp('Page.navigate', { url: `http://localhost:${port}/index.html` });
await mkdir(OUT, { recursive: true });

const touch = async (type, x, y) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
for (const step of STEPS) {
    const [cmd, ...a] = step.split(' ');
    if (cmd === 'wait') await sleep(Number(a[0]) * 1000);
    else if (cmd === 'tap') { await touch('touchStart', +a[0], +a[1]); await sleep(60); await touch('touchEnd', +a[0], +a[1]); await sleep(150); }
    else if (cmd === 'drag') {
        const [x1, y1, x2, y2] = a.map(Number);
        await touch('touchStart', x1, y1);
        for (let k = 1; k <= 10; k++) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * k / 10, y: y1 + (y2 - y1) * k / 10 }] }); await sleep(16); }
        await touch('touchEnd', x2, y2);
    } else if (cmd === 'twist' || cmd === 'pinch') {
        // twist cx cy 半径 角度（度，正 = 屏幕上顺时针）；pinch cx cy 起始半径 结束半径
        const [cx, cy, r0, v] = a.map(Number);
        const pts = (k) => {
            const t = k / 12;
            const ang = cmd === 'twist' ? (v * t) * Math.PI / 180 : 0;
            const r = cmd === 'twist' ? r0 : r0 + (v - r0) * t;
            const dx = Math.cos(ang) * r, dy = Math.sin(ang) * r;   // CSS 坐标 y 朝下：角度增大 = 顺时针
            return [{ x: cx - dx, y: cy - dy, id: 0 }, { x: cx + dx, y: cy + dy, id: 1 }];
        };
        await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
        for (let k = 1; k <= 12; k++) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(k) }); await sleep(16); }
        await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(150);
    } else if (cmd === 'eval') {
        const r = await cdp('Runtime.evaluate', { expression: a.join(' '), returnByValue: true });
        console.log('[eval]', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text));
    } else if (cmd === 'fresh') {
        await cdp('Runtime.evaluate', { expression: 'localStorage.clear()' });
        await cdp('Page.reload'); await sleep(500);
    } else if (cmd === 'shot') {
        const r = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(OUT, `${a[0]}.png`), Buffer.from(r.result.data, 'base64'));
        console.log('[shot]', join(OUT, `${a[0]}.png`));
    }
}
ws.close(); chrome.kill(); server.close();
