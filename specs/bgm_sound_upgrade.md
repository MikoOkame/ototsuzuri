# BGM 音源の改良 引き継ぎ書（羽結び・ほしつなぎ向け）

作成：2026-10-14（音綴り `src/orgel_dev.html` で作り、ユーザーが耳で確かめて採用したもの）
読む人：羽結び・ほしつなぎのプロジェクトを担当する Claude

---

## 0. これは何か

音綴りの BGM の音源は、星の音楽会 v10（`hoshi_ongakukai_v10.html`）の音源を土台にしている。
その上で、2026-10-10〜14 に次の改良を入れた。ユーザーは聞き比べて「こもった感じと音割れ感が減った」「パッドがきれいになった」と判断し、採用した。

1. オルゴールの音色（旋律の `musicbox`）
2. 残響（部屋らしい響き、低い音を切る）
3. 全体の音量の抑え（コンプレッサーを弱める）
4. パッド（入りのタイミング、音色）
5. ベース（短く切る）
6. 分散和音（`triangle` を柔らかい音に）

この書類は、同じ改良をそちらのプロジェクトの音源に移すためのものだ。§2 のコードは、v10 の関数名・変数名（`audioCtx`・`masterGain`・`masterCompressor`・`reverbConvolver`・`reverbWet`・`sendToReverb`・`trackNode`・`midiToFreq`・`clampNum`）をそのまま使っている。

**最初にやること**：そちらの音源が v10 と同じ作りかを確かめろ。
- 関数の名前と中身を比べる：`ensureAudioCtx`／`ensureReverb`／`sendToReverb`／`play○○Note`。
- 違う所（たとえば羽結びはコンプレッサーを別の場所で作っている）は、コードをそのまま貼らない。§1 の「何を・なぜ」を読んで、同じ考え方で直せ。

---

## 1. 変更の一覧（何を・なぜ・どれだけ）

| # | 対象 | 変更 | 理由 |
|---|---|---|---|
| 1 | オルゴール | 基音に、2倍（−24dB）・3倍（−16dB）の上の音を足す。約6.27倍の音を、弾いた瞬間だけ鳴らす（0.07秒で消える）。ピンが歯を弾く雑音（5ms）を足す。高い音ほど弱める。 | 下に別記 |
| 2a | 残響 | 残響に送る手前で、300Hz より下を切る | 低い音の残響が溜まって「ボワーン」とこもる。ミックスの定番の手当て |
| 2b | 残響 | 響き（インパルス応答）の作り直し。消えていくにつれて高い音を削る（9kHz → 約0.7kHz）。頭に20msの間を置く。左右で別の雑音にする | 白い雑音を小さくしていくだけの響きは、最後まで高い音がシャーと残ってざらつく。響きの総量（二乗和）は元と揃えてあるので、残響の大きさは変わらない |
| 3 | コンプレッサー | −12dB から 1/6 だったのを、−6dB から 1/3 にする。立ち上がりは 3→10ms。後ろで 1.15 倍する | 強すぎる抑えは、ベースや和音が鳴るたびに全体を押し下げる（ポンピング）。抑えを弱めると自動の持ち上げ（メイクアップ）が減って約1.2dB 小さくなるので、1.15倍で戻す |
| 4a | パッド | 立ち上がりを、指数（0.0001 から）から直線30msに替える | 0.0001 からの指数の立ち上がりは、時間のほとんどがほぼ無音だ。最大から −10dB に届くまで、最長0.9秒の設定で約0.8秒、0.15秒の設定でも約0.13秒かかる。拍より遅れて聞こえていた（ユーザーの指摘で発覚） |
| 4b | パッド | 3つの声の重ね（±6セント、左・中・右）。1つの声は、正弦波に2倍（0.16）・3倍（0.05）を足した波。伸ばしている間に7割まで少しずつ弱まる。150Hz より下は切る | 正弦波2本だけでは平たくうつろで、真ん中の一点から鳴る。揺らぎと左右の広がりを出す。低音はベースに任せる |
| 5 | ベース | 伸び（release）を、最長1.1秒から0.5秒にする | 次の音と重なって、低音が溜まる |
| 6 | 分散和音 | 三角波をやめて、正弦波＋2倍音（0.12）にする | 三角波の奇数倍音が、低い所でブーと濁る |

**オルゴールの音色（#1）の根拠**（ネットで調べた。数値は要約の段階のもので、原文は確かめていない）
- 2倍・3倍の上の音：実物のオルゴールの測定値に合わせた（英国オルゴール協会の会誌。603Hz の歯で、2倍が −24dB、3倍が −16dB）。v10 は2倍だけを −12dB で鳴らしていて、強すぎた。
- 約6.27倍の音：片端を固定した板の2番目の振動（梁の理論）。カリンバの測定では、整数倍でない上の音は弾いた直後に消える。
- 2倍・3倍の音が消える速さは、実測が見つからなかった。基音より少し早く消える値にしたのは推測だ。
- 高い音を弱める：ファ6（1400Hz）より上は、高さに反比例して弱める（上の音は2乗で）。耳は2〜5kHz に敏感で、高い音ほど刺さるからだ。音綴りでは、高い旋律の曲で耳に刺さると言われて入れた。そちらの曲が高い音を使わないなら、効きは小さい。

**大きさ**：どの変更も、全体の平均の大きさが元と同じになるように、書き出して測って合わせた（はじまりのワルツの頭30秒で −25.8 → −25.4dB）。差し替えても、BGM の音量設定は変えなくていい。

---

## 2. コード

v10 の同じ名前の関数を置き換える。新しく足すものは「追加」と書いた。

### 2.1 マスター段（`ensureAudioCtx` の中のコンプレッサー）

```js
masterCompressor = audioCtx.createDynamicsCompressor();
masterCompressor.threshold.value = -6;   // 元 -12
masterCompressor.knee.value = 12;        // 元 18
masterCompressor.ratio.value = 3;        // 元 6
masterCompressor.attack.value = .01;     // 元 .003（頭を潰さない）
masterCompressor.release.value = .25;
masterGain.connect(masterCompressor);
// 抑えを弱めると自動の持ち上げが減って約 1.2dB 小さくなる。その分を戻す
const makeup = audioCtx.createGain(); makeup.gain.value = 1.15;
masterCompressor.connect(makeup); makeup.connect(audioCtx.destination);
```

効果音のバスを `masterCompressor` につないでいる場合は、そのままでいい（効果音も makeup を通る）。

### 2.2 残響（`buildRoomImpulse` は追加。`ensureReverb`・`sendToReverb` は置き換え）

```js
let reverbIn = null;   // 残響の入口（低い音を切るフィルター）

// 部屋らしい残響：雑音を、時間とともに閉じていく低域通過（9kHz → 約 0.7kHz）に通し、頭に 20ms の間を置く。左右は別の雑音。
// 響きの総量（二乗和）は元の buildImpulseResponse と揃える（残響の大きさを変えずに質だけ変える）
function buildRoomImpulse(ctx, seconds, decay){
  const rate = ctx.sampleRate, pre = Math.floor(rate*.02), length = Math.max(1, Math.floor(rate*seconds));
  const impulse = ctx.createBuffer(2, length + pre, rate);
  for(let ch=0; ch<2; ch++){
    const data = impulse.getChannelData(ch);
    let lp = 0, eNew = 0, eRef = 0;
    for(let i=0;i<length;i++){
      const env = Math.pow(1 - i/length, decay), n = Math.random()*2 - 1;
      const fc = 600 + 8400*Math.exp(-i/rate*1.6), a = Math.exp(-2*Math.PI*fc/rate);
      lp = (1 - a)*n + a*lp;
      const v = lp*env; data[pre + i] = v; eNew += v*v; eRef += (n*env)*(n*env);
    }
    const k = Math.sqrt(eRef/eNew);
    for(let i=pre;i<pre + length;i++) data[i] *= k;
  }
  return impulse;
}
function ensureReverb(){
  if(reverbConvolver) return;
  reverbConvolver = audioCtx.createConvolver();
  reverbConvolver.buffer = buildRoomImpulse(audioCtx, 2.8, 2.6);   // 長さと減り方は v10 と同じ
  reverbWet = audioCtx.createGain();
  reverbWet.gain.value = .22;
  reverbConvolver.connect(reverbWet);
  reverbWet.connect(masterGain);
  // 残響に送る手前で 300Hz より下を切る（低い音の残響が溜まってこもるため）
  reverbIn = audioCtx.createBiquadFilter(); reverbIn.type = 'highpass'; reverbIn.frequency.value = 300; reverbIn.Q.value = .7;
  reverbIn.connect(reverbConvolver);
}
const reverbSends = {};
function sendToReverb(g, sendAmount){
  if(!reverbConvolver) return;
  const amt = sendAmount === undefined ? 1 : sendAmount, key = String(amt);
  if(!reverbSends[key]){
    const send = audioCtx.createGain();
    send.gain.value = amt;
    send.connect(reverbIn);            // 元は reverbConvolver に直接
    reverbSends[key] = send;
  }
  g.connect(reverbSends[key]);
}
```

- 曲ごとに残響の深さを変えている場合（v10 のクリア曲など）は、`reverbWet` の値の扱いをそのまま残せ。
- 何かの都合で `AudioContext` を作り直すときは、`reverbIn` と `reverbSends` も一緒に作り直すこと。

### 2.3 オルゴール（`playMusicBoxNote` を置き換え。`noiseBuf` は追加）

```js
// 雑音のバッファ（1つ作って使い回す。オフラインの書き出しなどで sampleRate が変わったら作り直す）
let noiseBufCache = null;
function noiseBuf(ctx){
  if(noiseBufCache && noiseBufCache.sampleRate === ctx.sampleRate) return noiseBufCache;
  const n = Math.round(ctx.sampleRate*.06), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = Math.random()*2 - 1;
  return noiseBufCache = b;
}
// 高い音の抑え：ファ6（1400Hz）より上は高さに反比例して弱める（上の音は2乗で）
const MB_HI_HZ = 1400;
function playMusicBoxNote(startTime, midi, dur, vel){
  const ctx = audioCtx, freq = midiToFreq(midi);
  const hi = freq > MB_HI_HZ ? MB_HI_HZ/freq : 1;
  const peak = clampNum(vel/127,.05,1)*.5*hi, attack = .006, release = Math.min(dur*2.4+.3, 2);
  const stopAt = startTime + attack + release + .05;
  const g = ctx.createGain();
  g.gain.setValueAtTime(.0001, startTime);
  g.gain.exponentialRampToValueAtTime(peak, startTime + attack);
  g.gain.exponentialRampToValueAtTime(.0001, startTime + attack + release);
  g.connect(masterGain); sendToReverb(g, .5);
  const parts = [g];
  const osc0 = trackNode(ctx.createOscillator()); osc0.type = 'sine'; osc0.frequency.value = freq; osc0.connect(g);
  osc0.start(startTime); osc0.stop(stopAt);
  // 上の音：[倍率, 基音に対する強さ, 消えるまでの秒]。それぞれ自分の包絡を持ち、基音の包絡（g）は通さず直接出す
  const overs = [[2.0, .063*hi, release*.6], [3.0, .158*hi*hi, release*.45], [6.27, .3*hi*hi, .07]];
  for(const [ratio, amp, life] of overs){
    const f = freq*ratio; if(f > 15000 || amp < .002) continue;
    const o = trackNode(ctx.createOscillator()); o.type = 'sine'; o.frequency.value = f;
    const og = ctx.createGain(), a = peak*amp;
    og.gain.setValueAtTime(.0001, startTime);
    og.gain.exponentialRampToValueAtTime(a, startTime + attack*.5);
    og.gain.exponentialRampToValueAtTime(.0001, startTime + attack*.5 + life);
    o.connect(og); og.connect(masterGain); sendToReverb(og, .5); parts.push(og);
    o.start(startTime); o.stop(Math.min(stopAt, startTime + attack + life + .05));
  }
  // ピンが歯を弾く雑音：5ms、高めの帯域
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(ctx);
  const ng = ctx.createGain(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.value = Math.min(9000, 3500 + freq*1.5); bp.Q.value = 1.2;
  ng.gain.setValueAtTime(.0001, startTime);
  ng.gain.exponentialRampToValueAtTime(peak*.5, startTime + .0008);
  ng.gain.exponentialRampToValueAtTime(.0001, startTime + .006);
  n.connect(bp); bp.connect(ng); ng.connect(masterGain); parts.push(bp, ng);
  n.start(startTime, Math.random()*.03, .012); trackNode(n);
  osc0.addEventListener('ended', ()=>{ parts.forEach(x=>x.disconnect()); });
}
```

1音あたりの発振器は2個から4個に増える（雑音が1個加わる）。音綴りでは、iPhone でも問題は出ていない。

### 2.4 分散和音（`playTriangleNote` を置き換え。名前はそのままでいい）

```js
function playTriangleNote(startTime, midi, dur, vel){
  const freq = midiToFreq(midi);
  const osc = trackNode(audioCtx.createOscillator()); osc.type = 'sine'; osc.frequency.value = freq;   // 元 'triangle'
  const peak = clampNum(vel/127,.05,1)*.22, attack = .008, release = Math.min(dur*1.1+.15, 1);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(.0001, startTime);
  g.gain.exponentialRampToValueAtTime(peak, startTime+attack);
  g.gain.exponentialRampToValueAtTime(.0001, startTime+attack+release);
  osc.connect(g); g.connect(masterGain); sendToReverb(g, .5);
  osc.start(startTime); osc.stop(startTime+attack+release+.05);
  // 柔らかい音：正弦波に2倍音を少し（三角波の奇数倍音の濁りを出さない）
  const o2 = trackNode(audioCtx.createOscillator()); o2.type = 'sine'; o2.frequency.value = freq*2;
  const g2 = audioCtx.createGain(); g2.gain.value = .12; o2.connect(g2); g2.connect(g);
  o2.start(startTime); o2.stop(startTime+attack+release+.05);
  osc.addEventListener('ended', ()=>{ g.disconnect(); g2.disconnect(); });
}
```

### 2.5 パッド（`playPadNote` を置き換え）

```js
let padWave = null;   // 正弦波に2倍（0.16）・3倍（0.05）を足した波。AudioContext ごとに作る
function playPadNote(startTime, midi, dur, vel){
  const ctx = audioCtx, freq = midiToFreq(midi);
  if(!padWave || padWave.ctx !== ctx){ padWave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, .16, .05])); padWave.ctx = ctx; }
  const peak = clampNum(vel/127,.05,1)*.1, release = Math.min(dur*.5, 1.2), end = startTime + dur;   // 3声の合計が元のパッドと同じ大きさになる値（書き出して測った）
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150; hp.Q.value = .7;   // 低音はベースに任せる
  const g = ctx.createGain();
  // 直線で 30ms で立ち上げる（0.0001 からの指数の立ち上がりは聞こえ始めが遅れ、拍より遅れて聞こえる）
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(peak, startTime + .03);
  const relAt = startTime + Math.max(dur - release, .03);
  g.gain.setTargetAtTime(peak*.7, startTime + .03, Math.max(.3, dur*.6));   // 伸ばしている間に少しずつ弱まる
  g.gain.cancelScheduledValues(relAt);
  g.gain.setTargetAtTime(.0001, relAt, release/4);
  lp.connect(hp); hp.connect(g); g.connect(masterGain); sendToReverb(g, .5);
  const parts = [lp, hp, g];
  let first = null;
  // 3声の重ね：±6 セントずらして左・中・右に置く（揺らぎと左右の広がり）
  for(const [cents, pan] of [[-6, -.6], [0, 0], [6, .6]]){
    const o = trackNode(ctx.createOscillator()); o.setPeriodicWave(padWave); o.frequency.value = freq*Math.pow(2, cents/1200);
    const pn = ctx.createStereoPanner(); pn.pan.value = pan;
    o.connect(pn); pn.connect(lp); parts.push(pn);
    o.start(startTime); o.stop(end + .05);
    if(!first) first = o;
  }
  first.addEventListener('ended', ()=>{ parts.forEach(x=>x.disconnect()); });
}
```

### 2.6 ベース（`playBassNote` の release だけ変える）

```js
const peak = clampNum(vel/127,.05,1)*.3, attack = .01, release = Math.min(dur*.9, .5);   // 元 Math.min(dur*.9, 1.1)
```

---

## 3. 入れ方の手順

1. §0 のとおり、そちらの音源が v10 と同じ作りかを確かめる。
2. 前の音と聞き比べられるようにして入れる。たとえば、URL 引数が付いたときだけ前の関数を使う。音綴りでは、`?mix=1` で前の伴奏、`?tone=1` で前のオルゴールに戻せる。採用が決まるまで、既定は前の音のままにしておくのが安全だ。
3. §4 の確認をする。
4. 聞き比べ用の音を書き出してユーザーに渡し、耳で判断してもらう。音綴りでは、曲の頭30秒を `OfflineAudioContext` で書き出し、m4a にして渡した。パッドのように他のパートに埋もれる変更は、そのパートだけを書き出すと違いが分かりやすい。
5. 採用されたら既定を新しい音にする。前の音は、聞き比べ用の引数で残す。

一度に全部を入れても、一つずつ入れてもいい。ただし、音色の良し悪しを決めるのはユーザーだ。何が効いたかを分けて聞けるように、段階ごとに書き出しておくと話が早い。

---

## 4. 確認すること

- **音量**：新旧で全体の平均（RMS）と最大を測り、差が ±0.5dB 以内か見る。ffmpeg の `volumedetect` で測れる。大きく違うと、聞き比べで大きい方が良く聞こえてしまう。
- **ノードの片付け**：再生を続けても、`activeNodes` の数とノードが増え続けないこと（v10 の設計指針 §1）。新しい関数はどれも、`ended` で自分の作ったノードを切断している。
- **書き出し（OfflineAudioContext）**：`padWave` と `noiseBuf` は AudioContext や sampleRate ごとに作り直す作りにしてある。オフラインで書き出すとき、実時間用に作ったものを使い回すとエラーになるからだ。
- **古い Safari**：`createStereoPanner` は iOS 14.1 以降で使えると記憶しているが、調べてはいない。古い端末も対象なら、無いときに中央に置く回り道を入れること。
- **高い旋律**：オルゴールの高い音の抑え（1400Hz より上）は、高い音が多い曲ほど効く。旋律が軽く聞こえすぎると言われたら、`MB_HI_HZ` を上げるか、外す。

---

## 5. 参考

- 音綴りの実装：`src/orgel_dev.html` の `playMusicBoxNote2`、`buildRoomImpulse`、`ensureReverb`、`playPadNote2`、`buildAudioGraph`。音綴りでは前の音との切り替えのために `MIX`／`MIX_FX`／`MB_TONE` で分岐している。この書類のコードは、その分岐を外した「採用版だけ」の形だ。
- 仕様の記録：音綴りの `orgel_handoff.md`（音色2・伴奏の整理の項）。
