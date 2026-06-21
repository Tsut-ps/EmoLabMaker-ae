# 開発・ビルド

EmoLabMaker は After Effects 用の単一 ScriptUI パネルですが、保守性のため
**ソースを `src/` 以下に分割**し、`build.js` で 1 枚の `dist/EmoLabMaker.jsx` に
連結して配布します。

After Effects は単一の `.jsx` しか読めず、本体は 1 つの IIFE
`(function emoLabMaker(thisObj){ … })(this)` の中で共有変数（`win` / `tabs` /
各 UI ウィジェット）を参照し合う構造です。そのため ES module（`import`/`export`）
分割はできず、**ビルド時にテキストを順番に連結**して同一クロージャを保ちます。

## ディレクトリ構成

```
src/
  00_header.jsx        ファイル冒頭のドキュメントコメント（IIFE の外）
  05_open.jsx          共通定数・設定(app.settings)・AE/undo ヘルパー・win/tabs 生成
  core/                UI 非依存のロジック（純粋寄り。各タブから参照）
    layers.jsx         制御レイヤーの作成/選択/登録
    expressions.jsx    emo マーカー/不透明度エクスプレッション・エスケープ
    markers.jsx        マーカー読み書き・「表示中レイヤー名の集合」・choice/flip
    emoset.jsx         表情セット（capture / save / apply）
    lab.jsx            lab 解析・音素・口形マッピング・式生成
    psd.jsx            PSDToolKit 命名解析・走査・自動セットアップ・反転
    blink.jsx          目パチ（自動まばたき）
    stage-model.jsx    立ち絵の階層ツリー構築・active 判定・prefix/表示名
  ui/                  UI 部品（ScriptUI 依存）
    scriptui.jsx       グリッド計算・チェックマーク・ドロップダウン再構築
    dialogs.jsx        各種ダイアログ（表情セット名・音素コンポ選択・PSD 結果 等）
  tabs/                各タブの UI 構築＋イベントハンドラ（即時実行コード）
    lab.jsx            口パクタブ
    psd.jsx            セットアップ(PSD)タブ
    stage.jsx          立ち絵タブ
  99_close.jsx         onResizing / tabs.onChange / onActivate / init・IIFE 終了

build.js               src/*.jsx を連結して dist/EmoLabMaker.jsx を生成
dist/EmoLabMaker.jsx   生成物（.gitignore 対象・コミットしない。配布は Releases）
```

- **`core/`** … UI ウィジェットを参照しない関数群。タブをまたいで使い回す土台。
- **`ui/`** … ScriptUI のウィジェット/ダイアログを扱う部品。
- **`tabs/`** … 各タブのパネル構築とハンドラ。`*.add(...)` や `*.onClick = …` のような
  **即時実行コード**が中心。

## ビルド

```sh
node build.js   # 依存パッケージ不要（Node 標準のみ）
```

`build.js` は次の順で連結し、`dist/EmoLabMaker.jsx` を出力します。

```
00_header                                  ← IIFE の外
(function emoLabMaker(thisObj) {           ← build.js が付与
  05_open
  core/layers, core/expressions, core/markers, core/emoset,
  core/lab, core/psd, core/blink, core/stage-model,
  ui/scriptui, ui/dialogs,
  tabs/lab, tabs/psd, tabs/stage,
  99_close
})(this);                                  ← build.js が付与
```

ポイント:

- **連結順は `build.js` の `BODY` 配列で一元管理**します。ファイルを追加したら
  ここに 1 行足してください。
- **関数宣言は巻き上げ**られるため、`core/*` と `tabs/*` の前後関係は自由です。
  順序が効くのは即時実行コード（`05_open` の定数/`win`・`tabs` 生成 → 各タブの
  UI 構築 → `99_close` の init）だけで、これらは実行順どおりに並べます。
- **IIFE ラッパーは `build.js` が付与**します。よって `src/*.jsx` は括弧が閉じた断片で、
  各ファイル単体でも `node --check` が通ります。
- **インデント復元**: `src/*.jsx` は prettier でトップレベル（0 インデント）に整形
  されますが、連結後は IIFE の中に入るので、`build.js` が本体の各行を 2 スペース
  下げて元のネスト体裁に戻します（空行はそのまま・相対インデント保持＝挙動不変）。

## 開発フロー

1. **`src/` の該当ファイルを編集**（`dist/` は触らない。生成物）。
2. `node build.js` で再生成。
3. 構文チェック: `node --check dist/EmoLabMaker.jsx`。
4. After Effects の ScriptUI Panels に `dist/EmoLabMaker.jsx` を置いて動作確認。

> [!NOTE]
> `src/*.jsx` は連結後に同一クロージャへ入る前提なので、エディタで開くと
> 共有変数（`win` / `tabs` 等）に「未定義」警告が出ます。これは**構文エラーではなく**、
> ビルド後の `dist/EmoLabMaker.jsx` では解決されます。

## リリース

`v*` タグを push すると GitHub Actions（`.github/workflows/release.yml`）が
ビルドして Release に `EmoLabMaker.jsx` を添付します。

```sh
git tag v2.0.3
git push origin v2.0.3
```

手動実行（Actions タブ → Release → Run workflow）でもタグ指定でリリースできます
（ワークフローがデフォルトブランチに入っている必要があります）。

> リポジトリ Settings → Actions → Workflow permissions を **Read and write** に
> しておくと確実です（`permissions: contents: write` も明記済み）。
