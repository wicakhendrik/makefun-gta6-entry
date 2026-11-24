// Screenshot and smoke-test tool: serves game/ on a local port, drives headless Chrome over the DevTools
// protocol, waits for the game's window.__shotReady flag, saves each shot listed in shots.json and reports
// any console errors. Usage: node tools/shoot.ts [shots.json] [outDir]

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const gameDir = join(root, 'game');
const listFile = process.argv[2] ?? join(root, 'shots.json');
const outDir = process.argv[3] ?? join(root, 'screenshots');
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = normalize(join(gameDir, decodeURIComponent(url.pathname)));
  if (!path.startsWith(gameDir)) { res.writeHead(403).end(); return; }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as { port: number }).port;

const profile = join(tmpdir(), 'solara-shoot-' + Date.now());
const proc = spawn(chrome, [
  '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1280,720',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio', 'about:blank',
]);
const wsUrl: string = await new Promise((resolve, reject) => {
  let buf = '';
  proc.stderr.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  setTimeout(() => reject(new Error('Chrome did not start: ' + buf)), 20000);
});

const browser = new WebSocket(wsUrl);
await new Promise((r) => browser.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map<number, (v: any) => void>();
const listeners: ((msg: any) => void)[] = [];
browser.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id); }
  else listeners.forEach((l) => l(msg));
});
function send(method: string, params: object = {}, sessionId?: string): Promise<any> {
  const id = nextId++;
  browser.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((r) => pending.set(id, r));
}

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const errors: string[] = [];
listeners.push((msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
    errors.push(msg.params.type + ': ' + msg.params.args.map((a: any) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
});
await send('Runtime.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);

const shots: { name: string; query: string; quality?: number }[] = JSON.parse(readFileSync(listFile, 'utf8'));
mkdirSync(outDir, { recursive: true });
for (const shot of shots) {
  errors.length = 0;
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html${shot.query}` }, sessionId);
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 500));
    const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true }, sessionId);
    if (r.result?.result?.value === true) { ready = true; break; }
  }
  const fmt = shot.name.endsWith('.png') ? 'png' : 'jpeg';
  const cap = await send('Page.captureScreenshot', { format: fmt, quality: fmt === 'jpeg' ? shot.quality ?? 86 : undefined }, sessionId);
  const bytes = Buffer.from(cap.result.data, 'base64');
  writeFileSync(join(outDir, shot.name), bytes);
  console.log(`${shot.name}: ${ready ? 'ready' : 'TIMEOUT'} in ${Date.now() - t0} ms, ${(bytes.length / 1024).toFixed(1)} KiB`);
  for (const e of errors) console.log('  ' + e);
}
browser.close();
proc.kill();
server.close();
process.exit(0);
