# ブラウザ3D作品の動画収録システム（移植用の手引き）

音綴り（`src/orgel_dev.html` ＋ `tools/promo/`）で作った宣伝動画の収録の仕組みを、別の作品にも載せられる形でまとめたもの。
three.js（WebGL）と Web Audio で動くページを前提に書くが、考え方は Canvas 2D や他の描画系でも同じ。

---

## 0. できること

- ページを **1コマずつ** 進めて PNG に撮り、ffmpeg で **H.264 の mp4**（1920×1080・30fps など）にする。
- 重い環境（GPU の無いサーバ、ソフトウェア描画）でも、**動きと音がずれない**。実時間を使わないので、1コマに何秒かかってもよい。
- **同じ設定なら毎回同じ絵** になる（乱数の種を固定）。モデルや素材を作り直したら、同じコマンドで撮り直せる。
- 音は、同じ時間軸で **オフライン合成** して WAV にし、mp4 に合成する。撮影中に起きた効果音（鳥の声など）も、起きた時刻どおりに入る。
- 撮影中は UI を隠す。
- 画角を名前で置き、**キーフレーム** で順に移る。時刻（昼夜など）の流れに **緩急** を付ける。演出のきっかけ（「この鳥は何秒に飛んでくる」など）を設定で指定する。
- 同じ仕組みで **1枚絵**（シェアカードなど）も撮れる。

---

## 1. 全体の構成

```
shots.json ──┐
             ▼
render.mjs（Node）
  ├ 静的サーバを立てる（リポジトリ直下を配る）
  ├ Chromium を起動（playwright-core。GPU が無ければ SwiftShader）
  ├ ページを ?capture&seed=… で開く
  ├ window.__cap.setup(cfg) → start(cfg)
  ├ for i: __cap.frame(cfg, i) → スクリーンショット → 00000.png …
  ├ __cap.renderAudio(cfg, 秒) → WAV（base64）
  └ ffmpeg で PNG 連番 ＋ WAV → mp4

ページ（?capture のときだけ）
  ├ Math.random を種つきに差し替え
  ├ requestAnimationFrame のループを止める
  ├ 1コマ分の更新を stepFrame(dt) に集約し、外から呼ばれたときだけ進む
  ├ UI を隠す（body.capturing）
  ├ 実時間の音は鳴らさず、効果音は「起きた時刻」だけ記録する
  └ window.__cap を公開（準備・開始・1コマ・音の書き出し）
```

役割の分け方：**ページは「時刻 t の状態を作って描く」ことだけ**を受け持つ。何コマ撮るか・どこに保存するか・どう動画にするかは、すべてドライバ（render.mjs）が持つ。

---

## 2. 考え方の要点

1. **実時間を捨てる。** `performance.now()` や `Date.now()`、`requestAnimationFrame` の引数から時間を取ると、撮影の速さで動きが変わる。撮影中は「1コマ = 1/fps 秒」の仮想の時計だけで進める。
2. **時間の出どころを一本にする。** 動き・アニメーション・時刻・曲の位置・パーティクルの寿命は、すべて同じ `dt` から進める。どこか一か所でも実時間を読むと、そこだけずれる。
3. **乱数を固定する。** 鳥の顔ぶれ、動きの揺らぎ、パーティクル、音の残響の揺らぎまで、`Math.random` の種で決まるようにする。
4. **音は後から作る。** 撮影中に音を鳴らして録るのではなく、「何秒に何が鳴ったか」から、オフラインで最初から合成し直す。描画が遅くても音はずれない。
5. **準備の時間を取る。** 読み込み直後は物が落ち着いていない（鳥が飛んでくる途中など）。撮影の前に、描かずに数秒ぶん進めてから撮り始める。

---

## 3. ページ側に入れるもの

### 3.1 撮影フラグと乱数の固定

他のどのコードよりも先に置く（乱数を使う初期化より前）。

```js
const PARAMS = new URLSearchParams(location.search);
const CAPTURE = PARAMS.has('capture');
if (CAPTURE) {
  // mulberry32。?seed=7 で毎回同じ並び
  let sd = (parseInt(PARAMS.get('seed')) || 1) >>> 0;
  Math.random = () => {
    sd |= 0; sd = sd + 0x6D2B79F5 | 0;
    let t = Math.imul(sd ^ sd >>> 15, 1 | sd);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

公開版で URL 引数を読まない作りにしておけば、撮影モードが一般の人に開かれることはない（音綴りでは `DEV` が false のとき `PARAMS` を空にしている）。

### 3.2 ループを `stepFrame` に分ける

```js
let clock = 0;   // 仮想の経過秒。動きはすべてこれか dt を見る
function stepFrame(dt, now, noRender) {
  clock += dt;
  if (CAPTURE) CAP.advance(dt);   // 撮影用の時計（曲の位置・時刻など）
  // … ここに1コマ分の更新を全部書く …
  if (!noRender) renderer.render(scene, camera);
}
if (!CAPTURE) renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  stepFrame(dt, now);
});
```

- 撮影中は `setAnimationLoop` を回さない。ドライバが `__cap.frame()` を呼んだときだけ進む。
- `noRender` は準備の間に使う。描かずに進めないと、GPU（ソフトウェア描画）に描画が溜まり、最初のスクリーンショットが何十秒も待たされる（§8）。

### 3.3 時間の出どころの点検リスト

移植するときに一番漏れやすい所。撮影モードで次を全部 `dt`／`clock` 由来にする。

- [ ] 物の動き（補間・追従・揺れ）
- [ ] スケルトンアニメーション（`AnimationMixer.update(dt)`）
- [ ] シェーダーの時間 uniform（波・雲・揺らぎ）
- [ ] パーティクルの寿命・発生間隔
- [ ] タイマー（`setTimeout`／`setInterval` で演出を進めていないか）
- [ ] 曲の再生位置（Web Audio の `currentTime` を見ていないか。撮影中は自前の位置を `dt` で進める）
- [ ] 時刻・天候などのゲーム内時計
- [ ] 読み込み待ち（テクスチャやモデルが届くまで `ready()` を偽にする）

### 3.4 UI を隠す

```js
if (CAPTURE) document.body.classList.add('capturing');
```
```css
body.capturing #title, body.capturing #player, body.capturing #hint,
body.capturing #debug { display: none !important; }
```

絵の一部である効果（紙目・周辺減光など）は隠さない。

### 3.5 `window.__cap` の約束

| 呼び出し | 役割 |
|---|---|
| `ready()` | 撮り始めてよいか（モデル・テクスチャが揃い、登場物が落ち着いている）。ドライバは `waitForFunction` で待つ |
| `setup(cfg)` | 撮る前の準備。時刻・曲・登場物を設定し、`cfg.warmup` 秒だけ **描かずに** 進める。準備中は時刻を止める |
| `start(cfg)` | 撮影の 0 秒。仮想時計を 0 に戻し、記録を始め、曲を頭から。0 コマ目の姿勢を作って描く |
| `pose(cfg, t)` | 時刻 t の「台本どおりの状態」を作る（画角・ゲーム内時刻など） |
| `frame(cfg, i)` | i コマ目：`pose(cfg, i/fps)` → `stepFrame(1/fps)`（描く） |
| `renderAudio(cfg, 秒)` | 同じ時間軸で音をオフライン合成し、WAV を base64 で返す |

撮影用の状態は1つのオブジェクトにまとめる。

```js
const CAP = { cam:null, time:0, rec:false, chirps:[], offline:false,
              playing:false, daySpeed:0, hold:null, day0:0 };
CAP.advance = dt => {
  CAP.time += dt;
  if (CAP.daySpeed) { dayT = (dayT + dt*CAP.daySpeed) % 1; }
  if (CAP.playing) song.pos = (song.pos + dt) % song.track.loopSec;
};
```

### 3.6 カメラ：画角を数値で直接与える

普段のカメラ操作（オービットなど）を計算した **後** で、撮影用の画角で上書きする。部屋の中に留めるなどの制限は、撮影中は掛けない（数値どおりに置く）。

```js
// 普段のカメラの計算 … camera.lookAt(LOOK);
const fixedCam = CAPTURE ? CAP.cam : manualCam;   // manualCam はデバッグの手入力（§6）
if (fixedCam) {
  camera.position.copy(fixedCam.pos); LOOK.copy(fixedCam.target);
  camera.fov = fixedCam.fov; camera.updateProjectionMatrix(); camera.lookAt(LOOK);
}
```

画角の表し方は `{ pos:[x,y,z], target:[x,y,z], fov:縦の度 }`。デバッグ表示の「画角をコピー」と同じ形にしておくと、そのまま設定に貼れる。

キーフレーム（`[{t, pos, target, fov}, …]`）の間は、端でゆっくりの補間（smoothstep）で移る。同じ画角を2つ続けると、その間は留まる。

```js
const ease = t => t*t*(3 - 2*t);
pose: (cfg, t) => {
  const K = cfg.keys; let i = 0;
  while (i < K.length - 2 && t >= K[i+1].t) i++;
  const a = K[i], b = K[Math.min(i+1, K.length-1)];
  const k = b.t > a.t ? ease(Math.min(1, Math.max(0, (t - a.t)/(b.t - a.t)))) : 0;
  CAP.cam.pos.copy(V(a.pos)).lerp(V(b.pos), k);
  CAP.cam.target.copy(V(a.target)).lerp(V(b.target), k);
  CAP.cam.fov = a.fov + (b.fov - a.fov)*k;
}
```

注意：位置を直線で補間するので、2つの画角の間に壁などがあると突き抜ける。そのときは中継の画角を足す。

### 3.7 ゲーム内時刻の緩急（早回し）

一定の早回し（`daySeconds`：一日を何秒で回すか）に加えて、`[秒, 時刻]` のキーで **速さを場面ごとに変える**。キーの間は単調な3次補間（Fritsch–Carlson）でつなぐ。直線でつなぐと、キーの所で速さが急に変わって目に付く。単調にしないと、時刻が行き過ぎて戻る。

```js
function smoothKeys(K, t) {          // K = [[秒, 値], …]（秒は昇順、値は単調）
  const n = K.length;
  if (t <= K[0][0]) return K[0][1];
  if (t >= K[n-1][0]) return K[n-1][1];
  const d = [], m = [];
  for (let i=0;i<n-1;i++) d.push((K[i+1][1]-K[i][1])/(K[i+1][0]-K[i][0]));
  m.push(d[0]);
  for (let i=1;i<n-1;i++) m.push(d[i-1]*d[i] <= 0 ? 0 : (d[i-1]+d[i])/2);
  m.push(d[n-2]);
  for (let i=0;i<n-1;i++) {
    if (d[i] === 0) { m[i] = m[i+1] = 0; continue; }
    const a = m[i]/d[i], b = m[i+1]/d[i], h = a*a + b*b;
    if (h > 9) { const r = 3/Math.sqrt(h); m[i] = r*a*d[i]; m[i+1] = r*b*d[i]; }
  }
  let i = 0; while (t > K[i+1][0]) i++;
  const h = K[i+1][0]-K[i][0], u = (t-K[i][0])/h, u2 = u*u, u3 = u2*u;
  return (2*u3-3*u2+1)*K[i][1] + (u3-2*u2+u)*h*m[i] + (-2*u3+3*u2)*K[i+1][1] + (u3-u2)*h*m[i+1];
}
// pose の中で：値は 1 を越えて翌日へ続けてよい
const v = smoothKeys(cfg.dayKeys, t);
dayT = v - Math.floor(v); dayCount = CAP.day0 + Math.floor(v);
```

**大事な考え方：** 登場物の動き（飛ぶ・歩く）は実時間で数秒かかる。早回しの中では、その数秒で何時間も進んでしまう。だから **見せたい出来事の前後だけ、時刻を実時間に近い速さまで落とす。** 何秒目に何が起きるかは、§8 の「状態の記録」で確かめてから決める。

### 3.8 演出のきっかけ（台本）

作品本来の規則（時刻で出入りする等）はそのままにして、撮影のときだけ上書きできる口を作る。例：

- `birdArrive: [6.0, 7.0, 0.3]`：位置ごとに「この秒ちょうどに飛来を始める」。指定した登場物は最初は居ないことにする。
- `singOnLand: ["sora"]`：この名前の鳥は、着地したらすぐ歌い出す。

```js
// 出入りの判定の中で
const capHold = CAPTURE && CAP.hold && CAP.hold[b.idx] != null ? CAP.hold[b.idx] : null;
if (capHold != null ? CAP.rec && CAP.time >= capHold : clock >= b.arriveAt) beginArrive(b);
```

- 判定は **撮影中（`CAP.rec`）だけ**。準備中に条件が満たされて先に来てしまわないように。
- 普段の「ずらし（2羽が同時に動かないための待ち）」は、指定した登場物には使わない。使うと指定の秒からずれる。
- URL 引数などで「最初から居る」状態にしている場合は、`setup` で居なかったことに戻す。

### 3.9 音

**撮影中は鳴らさない。** オーディオの初期化そのものを止める。効果音は「起きた時刻と引数」だけを記録する。

```js
function ensureAudioCtx() {
  if (CAPTURE && !audioCtx) return null;   // 撮影中は実時間の音を作らない
  …
}
function chirp(m, vol, style, cents, at) {
  if (CAPTURE && !CAP.offline) { if (CAP.rec) CAP.chirps.push([CAP.time, m, vol, style, cents]); return; }
  … // 普段どおり鳴らす（at があればその時刻に）
}
```

**書き出しは OfflineAudioContext で。** そのために、音の経路（マスター・リバーブ・バスなど）を作る関数を、コンテキストを引数に取る形にしておく（`buildAudioGraph(ctx)`）。楽器の関数も「何秒に鳴らすか」を引数で受ける形にしておく。

```js
renderAudio: async (cfg, seconds) => {
  const SR = 48000, tail = 2.5;   // 残響の尾も含める
  const off = new OfflineAudioContext(2, Math.ceil(SR*(seconds + tail)), SR);
  CAP.offline = true;
  buildAudioGraph(off);
  // 曲：全パートを、ループしながら seconds まで並べる
  for (const part of PARTS) for (const [t, midi, dur, vel] of track[part])
    for (let k = 0; k*track.loopSec + t < seconds; k++) play(part, k*track.loopSec + t, midi, dur, vel);
  // 撮影中に記録した効果音を、同じ時刻に
  for (const [t, ...args] of CAP.chirps) if (t < seconds) chirp(...args, t);
  const buf = await off.startRendering();
  CAP.offline = false;
  return { b64: toWavBase64(buf) };   // 16bit PCM の WAV。ヘッダ 44 バイト＋左右交互
}
```

**絵と音の同期：** 曲の位置は撮影用の時計（`CAP.advance`）で進め、絵の「鳴る瞬間」（ピンが歯を弾く等）もその位置から判定する。判定の区間は **半開区間 `[前のコマの位置, 今の位置)`** にする。閉区間だと 0 秒の音を取りこぼしたり、同じ音を2回判定したりする。音綴りでは、絵の判定と発音の時刻が1コマ（33ms）以内で一致することを確かめた。

---

## 4. 撮影ドライバ（`render.mjs`）

Node で動く。要るのは `playwright-core`・Chromium・ffmpeg。

```js
import { chromium } from 'playwright-core';
// 1) 静的サーバ（リポジトリ直下）。ポートは空いている所を使う
const server = http.createServer(/* repo のファイルを返す */).listen(0);
// 2) ブラウザ。GPU が無い環境ではソフトウェア描画
const browser = await chromium.launch({ executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
// 3) CDN の three を、手元の node_modules に差し替える（オフラインでも同じ版）
await page.route(/unpkg\.com\/three@[^/]+\/(.*)/, route => {
  const m = route.request().url().match(/unpkg\.com\/three@[^/]+\/(.*?)(\?.*)?$/);
  route.fulfill({ path: path.join(here, 'node_modules/three', m[1]), contentType: 'application/javascript' });
});
// 4) ウェブフォントは読まない（撮影では文字を出さない。読めない環境で待ち続けないように）
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
// 5) 開いて、準備して、撮る
await page.goto(`http://127.0.0.1:${port}/page.html?capture&seed=${seed}&t=${dayT}`);
await page.waitForFunction(() => window.__cap && window.__cap.ready(), null, { timeout: 120000 });
await page.evaluate(c => window.__cap.setup(c), cfg);
await page.evaluate(c => window.__cap.start(c), cfg);
for (let i = 0; i < N; i++) {
  if (i > 0) await page.evaluate(([c, k]) => window.__cap.frame(c, k), [cfg, i]);
  await page.screenshot({ path: `${frameDir}/${String(i).padStart(5,'0')}.png`, timeout: 180000 });
}
// 6) 音
const { b64 } = await page.evaluate(([c, s]) => window.__cap.renderAudio(c, s), [cfg, seconds]);
fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
```

ffmpeg（映像だけ／音つき）：

```
ffmpeg -y -framerate 30 -i frames/%05d.png \
       -i out.wav -c:a aac -b:a 192k -t <秒> \
       -c:v libx264 -pix_fmt yuv420p -crf 17 -preset slow -movflags +faststart out.mp4
```

- `-pix_fmt yuv420p`：これが無いと、スマホや SNS で再生できないことがある。
- `-t <秒>`：音には残響の尾が付いているので、映像の長さで切る。
- `-movflags +faststart`：ウェブで再生し始めるのが早くなる。
- 試し撮りは環境変数 `LIMIT=コマ数` で先頭だけ撮る。

---

## 5. 設定ファイル（`shots.json`）

```jsonc
{
  "width": 1920, "height": 1080, "fps": 30, "seed": 7,
  "birds": "kurumi,momo,sora",                       // 作品固有：登場物の顔ぶれを固定
  "cams": {                                          // 名前つきの画角（デバッグの「画角をコピー」の形）
    "A": { "pos": [0, 1.345, 0.25], "target": [0, 1.1, 0.06], "fov": 52 },
    "B": { "pos": [-0.25, 1.374, 0.425], "target": [0.123, 1.151, 0.107], "fov": 52 },
    "C": { "pos": [0, 1.4, 1], "target": [0, 1.385, 0], "fov": 52 }
  },
  "shots": {
    "full": {
      "seconds": 41, "track": "hajimari00", "play": true, "audio": true, "warmup": 1,
      "keys":    [[0,"A"], [1,"A"], [3.5,"B"], [5.5,"B"], [8.5,"C"]],   // 画角の台本
      "dayKeys": [[0,0.36], [11,0.375], [14,0.66], [15,0.775], [17,0.796], [25.5,0.815],
                  [28,0.955], [29.5,0.975], [34.5,0.98], [36,0.9925], [41,0.996]],   // 時刻の台本
      "birdArrive": [6.0, 7.0, 0.3],                 // 演出のきっかけ
      "singOnLand": ["sora"]
    },
    "share": {                                        // 1枚絵
      "still": true, "width": 1200, "height": 630, "dayT": [0.42, 0.62, 0.9],
      "track": "hajimari00", "play": true, "warmup": 2, "at": 3, "camA": "D"
    }
  }
}
```

| 項目 | 意味 |
|---|---|
| `seconds` | 動画の長さ |
| `warmup` | 撮る前に描かずに進める秒（この間は時刻を止める） |
| `keys` | `[秒, 画角の名前]`。同じ名前が続く間は留まる |
| `camA`／`camB`／`move` | キーの代わりの簡単な書き方（始まり・終わり・移る秒数） |
| `dayT`／`daySeconds` | 開始時刻／一日を何秒で回すか（一定の早回し） |
| `dayKeys` | `[秒, 時刻]`。時刻の緩急。1 を越えると翌日 |
| `track`／`play`／`audio` | 曲・再生するか・音を書き出して合成するか |
| `still`／`at` | 1枚絵にする／曲を流して何秒のところを撮るか。`dayT` を配列にすると時刻ごとに1枚 |

`"_説明"` のような説明用の項目を混ぜておくと、半年後の自分が読める（JSON にはコメントが書けないため）。

---

## 6. 画角を決める道具（デバッグ表示）

撮影の画角は、数値を当てずっぽうに書かず、実際の画面で決めてから写す。

- **読み出し：** デバッグ表示に、カメラの位置・注視点・縦の画角を常に出す（4回/秒の更新で十分）。
- **コピー：** 「画角をコピー」で `{"pos":…,"target":…,"fov":…}` をクリップボードへ。そのまま `cams` に貼る。
- **手入力：** 位置・注視・画角を入れて「適用」すると、その画角に固定して見られる（`manualCam`）。撮影モードと同じ経路（§3.6）で描くので、動画と同じ見え方になる。固定中はドラッグで動かさない。「解除」で普段の操作に戻し、画角も画面の向きの既定値に戻す。JSON の貼り付けも受け付ける。
- iPhone の入力欄は文字を 16px 以上にする（未満だと入力時に画面が拡大される）。

**画面の縦横比に注意：** 画角（縦の fov）が同じでも、縦長の画面と 16:9 では横に映る範囲が違う。作品によっては縦長で fov を変えている（音綴りは縦長 70°・横長 52°）。動画用の画角は、横長のウィンドウで決める。

---

## 7. 1枚絵（シェアカードなど）

動画と同じページ・同じ API で撮る。違いは「`at` 秒まで進めて1枚だけ撮る」ことと、大きさを撮影ごとに変えられること。

- シェアカード（OGP）の標準は 1200×630。
- 解像度を上げたいときは `deviceScaleFactor` を 2 にする（2400×1260 になる）。
- 時刻違いを並べて選べるように、`dayT` を配列にして時刻ごとに書き出す。

---

## 8. つまずきと対策（実際に起きたこと）

| 症状 | 原因 | 対策 |
|---|---|---|
| 最初のスクリーンショットが 60 秒以上かかってタイムアウト | 準備のコマも描いていたので、ソフトウェア描画に仕事が溜まった | 準備のコマは `noRender`。スクリーンショットのタイムアウトを長く（180 秒） |
| ページが開き終わらない | ウェブフォントの読み込みを待ち続けた | フォントの通信を中止（撮影では文字を出さない） |
| 動画の 0 秒の時刻が設定とずれる | 準備の間も時刻が進んでいた | 準備中は時刻の速さを 0。`start` で速さを入れる |
| 曲の最初の音だけ鳴る絵が出ない | 判定が閉区間で、0 秒の音を取りこぼした | 半開区間 `[a, b)` |
| 早回しで、鳥が飛び去る途中に夜が明ける | 飛ぶ動きは実時間で数秒かかる。その間に時刻が何時間も進む | `dayKeys` で、出来事の前後だけ時刻を遅くする |
| 指定した秒に登場物が来ない／最初から居る | 普段の「ずらし」の待ちが足された／URL 引数で最初から置かれていた | 指定がある物はずらしを使わない。`setup` で居なかったことに戻す |
| iPhone で取った画角が動画で違って見える | 縦長と横長で fov を変えている／縦横比が違う | 動画の画角は横長の画面で決める |
| 撮影用の画角の上書きが効かない | 上書きを、普段のカメラ制限（部屋の中に留める等）より前に置いた | 普段のカメラの計算の **後** で上書きする |
| 準備を 0 秒にすると、0 コマ目だけ画角が違う | 撮影用の画角の上書きは `stepFrame` の中で効く。`start` で描く時点では、一度も `stepFrame` を通っていない | 準備（`warmup`）を 1 コマ以上にする。または `start` の中で上書きしてから描く |

**状態の記録で確かめる：** 本番の撮影は時間がかかる（§10）。先に小さい画面（480×270）で最後まで流し、0.5秒ごとに「時刻・登場物ごとの状態」をログに出す。何秒に何が起きるかを数字で見てから、台本（`dayKeys`・`birdArrive`）を直す。本番を撮っている途中でも、保存済みのコマ（PNG）をその場で並べて確かめられる。

---

## 9. 移植の手順（チェックリスト）

1. [ ] 撮影フラグと種つき乱数を、ページの一番最初に置く（§3.1）
2. [ ] 1コマの更新を `stepFrame(dt, now, noRender)` にまとめ、撮影中は rAF を回さない（§3.2）
3. [ ] 時間の出どころを点検し、全部 `dt`／`clock` 由来にする（§3.3）
4. [ ] UI を `body.capturing` で隠す（§3.4）
5. [ ] `CAP` と `window.__cap`（ready・setup・start・pose・frame・renderAudio）を作る（§3.5）
6. [ ] カメラの上書きを、普段のカメラ計算の後に置く（§3.6）
7. [ ] 音の経路をコンテキストを引数に取る形にし、撮影中は鳴らさず記録だけにする（§3.9）
8. [ ] デバッグ表示に画角の読み出し・コピー・手入力を付ける（§6）
9. [ ] `render.mjs` と `shots.json` を写し、ページの URL・CDN の差し替え先・作品固有の引数を直す（§4・§5）
10. [ ] `LIMIT=30` で試し撮り → 小さい画面で状態を記録 → 本番

---

## 10. 処理時間の目安

GPU の無いクラウド環境（SwiftShader）で、音綴りの 1920×1080 を撮ったときの実測：**1コマ約 2 秒**（300 コマで約 10 分、41 秒の動画 1230 コマで約 40 分）。小さい画面ほど速いが、そちらは測っていない。確認用の小さい撮影（480×270）は、本番よりずっと短く済んだ。

GPU のある手元の PC なら、ずっと速い。動きと音は実時間に依らないので、遅い環境でも結果は同じになる。

---

## 11. 必要なもの

- Node.js（ES modules）
- `playwright-core`（ブラウザ本体は同梱しないので、Chromium の場所を環境変数 `CHROME` で渡す）
- three.js をページと同じ版で `node_modules` に（CDN の差し替え用）
- ffmpeg（libx264・aac）

```
cd tools/promo
npm install
node render.mjs full    # 動画
node render.mjs share   # 1枚絵
```
