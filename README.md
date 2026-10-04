# 音綴り - OtoTsuzuri -

自作曲を聴くための音楽プレーヤー。海辺の町の窓辺で、オルゴールが曲を奏で、旅の鳥たちが集まってくる。

- 公開版：リポジトリ直下の `index.html`（GitHub Pages：https://mikookame.github.io/ototsuzuri/ ）
- 制作版：`src/orgel_dev.html`（URL 引数で確認用の機能が使える。一覧は `orgel_handoff.md`）

## フォルダ
| パス | 中身 |
|---|---|
| `index.html` | 公開版。`src/orgel_dev.html` から自動で作る。直接は編集しない |
| `src/orgel_dev.html` | 制作版。編集するのはここだけ |
| `src/tex/` | 鳥のテクスチャの軽量版（実際に読み込むもの） |
| `assets/` | 素材（鳥のモデル・テクスチャの原本・音符・UI・箱） |
| `assets/ui/` | 手描きのボタンとプレーヤーの枠（置くだけで差し替わる。寸法は `orgel_handoff.md` §7） |
| `assets/box/` | 箱のモデル（差し替え用） |
| `tools/build_public.mjs` | 公開版を作るスクリプト |
| `ref/` | 参考資料（編集しない） |
| `archive/` | 制作中のスクリーンショット |
| `orgel_handoff.md` | 仕様と引き継ぎ書 |

## 公開版の更新
制作版を直したら、公開版を作り直して一緒にコミットする。

```
node tools/build_public.mjs
```

UI の画像（`assets/ui/`）や箱を置き換えただけなら、作り直しは要らない。
