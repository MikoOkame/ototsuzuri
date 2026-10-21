// 風景とオルゴールのモデルだけを見る HTML を作る：node tools/build_model_view.mjs
// src/orgel_dev.html（制作版）から exports/madobe_model.html を作る。別のプロジェクトに渡す用。
//   ・DEV を false にする（URL 引数を読まない。デバッグ表示・確認用の機能は動かない）
//   ・MODEL_VIEW を true にする（鳥・音・再生パネル・手描き UI の読み込みを止め、時刻の操作盤だけを出す）
// 制作版を直したら流し直す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let s = fs.readFileSync(path.join(root, 'src/orgel_dev.html'), 'utf8');
const swap = (a, b) => { if (!s.includes(a)) throw new Error('見つからない: ' + a); s = s.replace(a, b); };
swap("const DEV = true;", "const DEV = false;");
swap("const MODEL_VIEW = false;", "const MODEL_VIEW = true;");
s = s.replace(/<span id="buildTag"[^>]*>[^<]*<\/span>/, '');
swap('<title>', '<title>窓辺の風景とオルゴール（モデル）｜');
s = s.replace('<!DOCTYPE html>', `<!DOCTYPE html>
<!-- 窓辺の風景とオルゴールのモデルだけを見る HTML（音綴りから書き出し）。tools/build_model_view.mjs が src/orgel_dev.html から作る。
     鳥・音・再生パネルは止めてある（コードは残っているが動かない）。three.js 0.160 を unpkg から読む。ほかの素材ファイルは要らない。
     モデルの作りは、最後の大きな script（type="module"）の中の、次の節にある（「/* ====」で始まる見出しで探せる）：
       一日の時計／配色（時間帯の5つの基準色）／空／太陽と月／遠山／海／雲／町・灯台・桟橋（「町」「灯台」「桟橋と小舟」）／
       室内：壁と窓／ベランダ／オルゴール：機構と仮の箱（シリンダー・櫛歯・ピン・動力の流れ・巻き鍵）／時刻を舞台に流し込む
     操作：ドラッグで回る、ホイール（二本指）で寄る・引く、右ドラッグで平行移動。画面下のつまみで時刻、「時を流す」で一日を 72 秒で回す。 -->`);
fs.mkdirSync(path.join(root, 'exports'), { recursive: true });
fs.writeFileSync(path.join(root, 'exports/madobe_model.html'), s);
console.log('exports/madobe_model.html を作った（' + (s.length/1024).toFixed(0) + ' KB）');
