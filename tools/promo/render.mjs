// 宣伝動画の書き出し：node render.mjs A   （B、または A B）
// 制作版 src/orgel_dev.html を ?capture で開き、1コマずつ描いて PNG にし、ffmpeg で H.264 の mp4 にする。
// 音（audio: true のとき）は、同じ時間軸でページ内のオフライン合成で WAV にして、mp4 に合成する。
// 設定は shots.json。出力は out/。乱数は seed で固定するので、同じ設定なら同じ絵になる。
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const cfgAll = JSON.parse(fs.readFileSync(path.join(here, 'shots.json'), 'utf8'));
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cfgAll.shots);
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const outDir = path.join(here, 'out'); fs.mkdirSync(outDir, { recursive: true });

// 静的サーバ（リポジトリ直下を配る）
const types = { '.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.jpg':'image/jpeg', '.glb':'model/gltf-binary', '.json':'application/json' };
const server = http.createServer((q, r) => {
  const f = path.join(repo, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

for (const name of names) {
  const shot = cfgAll.shots[name]; if (!shot) throw new Error('shots.json に無い: ' + name);
  const cfg = { ...shot, fps: cfgAll.fps };
  const W = cfgAll.width, H = cfgAll.height, N = Math.min(Math.round(shot.seconds*cfgAll.fps), +(process.env.LIMIT || 1e9));   // LIMIT=コマ数 で試し撮り
  const frameDir = path.join(outDir, name + '_frames'); fs.rmSync(frameDir, { recursive: true, force: true }); fs.mkdirSync(frameDir);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  // three は unpkg からローカルの node_modules に差し替える（オフラインでも同じ版で動く）
  await page.route(/unpkg\.com\/three@[^/]+\/(.*)/, route => {
    const m = route.request().url().match(/unpkg\.com\/three@[^/]+\/(.*?)(\?.*)?$/);
    route.fulfill({ path: path.join(here, 'node_modules/three', m[1]), contentType: 'application/javascript' });
  });
  // 文字は画面に出さないので、ウェブフォントは読まない（読めない環境で待ち続けないように）
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const q = `capture&seed=${cfgAll.seed}&t=${shot.dayT}&birds=${cfgAll.birds}`;
  await page.goto(`http://127.0.0.1:${port}/src/orgel_dev.html?${q}`);
  await page.waitForFunction(() => window.__cap && window.__cap.ready(), null, { timeout: 120000 });
  await page.evaluate(c => window.__cap.setup(c), cfg);
  await page.evaluate(c => window.__cap.start(c), cfg);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    if (i > 0) await page.evaluate(([c, k]) => window.__cap.frame(c, k), [cfg, i]);
    await page.screenshot({ path: path.join(frameDir, String(i).padStart(5, '0') + '.png'), timeout: 180000 });
    if (i % 30 === 0) process.stdout.write(`${name} ${i}/${N} (${((Date.now()-t0)/1000).toFixed(0)}s)\n`);
  }
  const mp4 = path.join(outDir, `promo_${name}.mp4`);
  const ff = ['-y', '-loglevel', 'error', '-framerate', String(cfgAll.fps), '-i', path.join(frameDir, '%05d.png')];
  if (shot.audio) {
    const { b64, chirps } = await page.evaluate(([c, s]) => window.__cap.renderAudio(c, s), [cfg, shot.seconds]);
    const wav = path.join(outDir, `promo_${name}.wav`); fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
    console.log(`${name} 音：鳥の声 ${chirps} 回を含めて書き出し`);
    ff.push('-i', wav, '-c:a', 'aac', '-b:a', '192k', '-t', String(shot.seconds));
  }
  ff.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', mp4);
  execFileSync('ffmpeg', ff, { stdio: 'inherit' });
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log('書き出した', mp4);
  await page.close();
}
await browser.close(); server.close();
