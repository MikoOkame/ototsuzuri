// 公開版を作る：node tools/build_public.mjs
// src/orgel_dev.html（制作版）から、リポジトリ直下の index.html（公開版）を作る。
//   ・DEV を false にする（URL 引数を読まない＝制作用の機能はすべて止まる）
//   ・素材の場所をリポジトリ直下から見た形にする（ROOT = ''）
// 制作版を直したら、このスクリプトを流し直して index.html も一緒にコミットする。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let s = fs.readFileSync(path.join(root, 'src/orgel_dev.html'), 'utf8');
const swap = (a, b) => { if (!s.includes(a)) throw new Error('見つからない: ' + a); s = s.replace(a, b); };
swap("const DEV = true;", "const DEV = false;");
swap("const ROOT = '../';", "const ROOT = '';");
// 制作版にしか無い表示を外す（デバッグ表示の版番号）
s = s.replace(/<span id="buildTag"[^>]*>[^<]*<\/span>/, '');
s = s.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- 公開版。tools/build_public.mjs が src/orgel_dev.html から作る。直接は編集しない -->');
fs.writeFileSync(path.join(root, 'index.html'), s);
console.log('index.html を作った（' + (s.length/1024).toFixed(0) + ' KB）');
