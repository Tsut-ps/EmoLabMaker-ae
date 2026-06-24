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
3. 構文チェック: `dist/EmoLabMaker.jsx` を `.js` にコピーして `node --check`
   （Node によっては `.jsx` 拡張子を直接 check できないため）。
4. After Effects の ScriptUI Panels に `dist/EmoLabMaker.jsx` を置いて動作確認。

> [!NOTE]
> `src/*.jsx` は連結後に同一クロージャへ入る前提なので、エディタで開くと
> 共有変数（`win` / `tabs` 等）に「未定義」警告が出ます。これは**構文エラーではなく**、
> ビルド後の `dist/EmoLabMaker.jsx` では解決されます。

## コーディング規約（ExtendScript / ES3）

After Effects の ExtendScript は ES3 相当。次を守ります。

- `var` のみ（`const` / `let` / アロー関数 / モダン配列メソッドは不可）。
- ネストした三項演算子は避ける（誤評価することがある）。`if/else` で書く。
- レイヤー名に `,`（カンマ）を使わない。マーカーの「表示中レイヤー名の集合」が
  カンマ区切りのため、含まれると壊れます。

## 検証（テスト）

AE 実機が無くても、UI 非依存ロジック（`core/*`）はモック AE 環境で検証できます。

- 構文チェック: 上記のとおり `.js` にコピーして `node --check`。
- 純ロジックテスト: 関数を抽出し、モック AE（CompItem / レイヤー / マーカー）上で
  評価する Node スクリプトで assert する。`dist` を読むので先に `node build.js`。
  （テストハーネスの場所・件数など運用メモは [docs/status.md](docs/status.md) を参照）

## バージョニング

セマンティック風 `x.y.z`（x=破壊的 / y=機能追加 / z=修正）。版を上げるときは次の 3 箇所を更新します。

- `src/01_version.jsx` の `EMO_VERSION`
- `src/00_header.jsx` の `@version`
- `CHANGELOG.md`（先頭に追記）

`EMO_VERSION` を独立ファイルにしているのは、版上げ時の差分を小さく保つためです。

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

## 設計メモ（背景・不変条件）

### PSDToolKit の仕様（調査結果）

- **レイヤー命名規則**
  - `*` prefix: 兄弟レイヤー間で排他表示(ラジオボタン)
  - `!` prefix: 強制表示(常に表示、非表示にできない)
  - `:flipx` / `:flipy` suffix: 左右/上下反転バリエーション
- **口パク あいうえお@PSD**: lab ファイルの母音タイミングで あ/い/う/え/お/ん の6口形状を切替。子音は基本「ん(閉じ)」扱い
- **目パチ@PSD**: 間隔・速度パラメータで自動まばたき

参考: [PSDTool マニュアル](https://oov.github.io/psdtool/manual.html) /
[PSD アニメーション効果](https://oov.github.io/aviutl_psdtoolkit/psd.html) /
[準備オブジェクト](https://oov.github.io/aviutl_psdtoolkit/prep.html)

### 不変条件

- **単一 `.jsx` を継続**（CEP / UXP 化しない）。AE は PSD をネイティブインポートでき
  （レイヤー名・構造・表示状態を保持）、CEP は更新終了・UXP は AE 未対応。単一ファイル配布が
  動画制作者層に合う。UXP の AE 対応が出たら再検討。
- **PSD 読み込みはスクリプトでやらない**（`importFile()` を呼ばない）。AE 標準の「コンポジション」
  インポートに任せ、スクリプトは読み込み済みコンポの解析・登録・更新のみ行う。
- **セットアップは冪等**（再実行＝既存を壊さず差分更新）。
- **コンポ名の一意化**: グループコンポを `<ルート名>_<グループ名>` にリネーム。式が `comp("名前")` で
  グローバル参照するため、同名コンポの衝突を避ける。
- **式のシグネチャ**: emo=`emo2layerCtrlMarker` / 口パク=`lab2layerPhonemeMap` / 目パチ=`emoBlinkAuto`。
- **マーカー＝表示中レイヤー名の集合**（カンマ区切り）。ラジオ(`*`)も任意(無印)も同じモデルで扱う。
