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
    bake.jsx           ベイク（式→キーフレーム変換・解除・式パラメータの逆パース）
  ui/                  UI 部品（ScriptUI 依存）
    scriptui.jsx       グリッド計算・チェックマーク・ドロップダウン再構築
    dialogs.jsx        各種ダイアログ（表情セット名・音素コンポ選択・PSD 結果 等）
  tabs/                各タブの UI 構築＋イベントハンドラ（即時実行コード）
    lab.jsx            口パクタブ
    psd.jsx            セットアップ(PSD)タブ
    stage.jsx          立ち絵タブ
  99_close.jsx         onResizing / tabs.onChange / onActivate / init・IIFE 終了

test/                  Node で動く自動テスト（AE 不要・依存パッケージ不要）
  helpers.js           core/*.jsx の vm 読み込みと AE モック・式評価・KF 階段値
  build.test.js        ビルド実行と dist の構文チェック
  es3.test.js          ES3(ExtendScript) 互換 lint（const/let/アロー等の混入検出）
  expressions.test.js  式の挙動テスト（表情集合 / 口形 / 目パチ / 逆パーサ）
  bake.test.js         ベイク同値テスト（ベイク KF の階段値 ＝ 式の評価値）
  random-equivalence.test.js  シード固定ランダムシナリオでのベイク同値テスト

package.json           npm scripts のみ（build / test）。依存パッケージなし
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
  core/lab, core/psd, core/blink, core/stage-model, core/bake,
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
2. `npm test`（= `node --test`）を実行。ビルド → dist の構文チェック →
   全テストまで一括で走る（依存パッケージ不要・AE 不要）。
3. After Effects の ScriptUI Panels に `dist/EmoLabMaker.jsx` を置いて動作確認。

ビルドだけなら `npm run build`（= `node build.js`）。

## テスト

`test/` は Node 単体で動く（ScriptUI に依存しない `core/*.jsx` を vm サンドボックスへ
読み込み、AE のレイヤー/マーカー/コンポをモックして検証する）。式は「最後の文の値が
結果」＝ vm の完了値セマンティクスと同じなので、生成された式を本物どおり評価できる。
ランナーは Node 組み込みの `node:test`（Node 18+。依存パッケージなし）。

- `build.test.js` … `build.js` の実行と dist の構文チェック（vm.Script でコンパイル）
- `es3.test.js` … **ES3 互換 lint**。他のテストは Node(V8) 上で src を実行するため、
  ES3 に無い構文/API（const/let/アロー/ES5+ メソッド/JSON 等）が混入してもテストは
  通ってしまう。ここで src 全体を走査して機械的に検出する（式に埋め込む文字列も対象）
- `expressions.test.js` … 式の挙動（表情集合 membership / 口形マッピング / 目パチ /
  `parseEmoContext` のラウンドトリップ）
- `bake.test.js` … **ベイク同値テスト**。ベイクが書くホールド KF の階段値と、実際の
  式の評価値を時間軸全域（等間隔＋KF 境界前後）で比較する。エッジケース
  （[Lab] の重なり・空割当サプレス・尺境界マーカー・目パチ極値）も含む
- `random-equivalence.test.js` … ベイク同値をシード固定の疑似乱数シナリオ
  （マーカー配置・in/out・パラメータをランダム生成）で叩く。シード固定なので
  毎回同じ列＝再現可能。マーカー時刻は 0.01s グリッドで生成する
  （MARKER_EPSILON 未満の近接マーカーはベイクが丸めるため、既知の許容差）

テストが保証**しない**もの（既知の限界）: AE 実機の API 挙動（KF 書き込み・
時刻量子化・expressionEnabled の副作用）はモックの再現に依存するため、
ベイクまわりの変更後は AE での目視確認（ベイク → 再生 → 解除）を必ず行うこと。
UI 層（tabs/*.jsx）とセットアップ走査（core/psd.jsx / stage-model.jsx）は未テスト。

CI: GitHub Actions（`.github/workflows/test.yml`）が push / PR ごとに `npm test` を
実行する。リリース（`release.yml`）もビルド前に `npm test` を実行し、テストが通らない限りリリースは失敗する。

便利な実行方法（`npm test` の代わりに直接 `node --test` を使う）:

```sh
node --test                                             # npm test と同じ（既定探索）
node --test --test-name-pattern="目パチ" test/bake.test.js  # ファイル＋名前で絞り込み
node --test --watch                                     # 変更を監視して自動再実行
```

※ glob 引数（`node --test "test/*.test.js"`）は Node 21+ 限定なので使わない
（CI や他環境の Node で `Could not find` エラーになる）。引数なしの既定探索は
`test/` 配下を全部実行する（`helpers.js` もテスト0件のファイルとして通るが無害）。

注意: サンドボックス内で生成されたオブジェクト/配列は別レルムのため、
`assert.deepEqual`（strict）に渡す前に `helpers.plain()` でプレーン化すること。

> [!IMPORTANT]
> 切替ロジックは「式ビルダー（expressions/lab/blink.jsx）」と「ベイクエンジン
> （core/bake.jsx のスクリプト再実装）」の**二重管理**になっている。さらに逆パーサ
> （`parseEmoContext` / `parseLabMapContext` / `parseBlinkContext`）が式の文面に依存する。
> **式の挙動や埋め込み変数の書式を変えたら、bake.jsx とパーサも更新すること。**
> 片方だけ変えると `bake.test.js` の同値テストが落ちて検出される。

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
