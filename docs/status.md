# EmoLabMaker 開発ステータス & 引き継ぎメモ

このファイルは「いま何が出来ていて・何が残っていて・どんなルールで開発するか」を
1 枚にまとめた最新の引き継ぎ資料。新しいセッションを始めるときは**まずこれを読む**。
（設計の経緯・ビルドの詳細は [DEVELOPMENT.md](../DEVELOPMENT.md) と
[docs/psdtoolkit-compatibility-plan.md](psdtoolkit-compatibility-plan.md) を参照）

- 現行バージョン: **2.8.3**
- 開発ブランチ: **`claude/psdtoolkit-compatibility-plan-qbn4fy`**
- 配布: GitHub Releases（`v*` タグ push で自動ビルド＆`dist/EmoLabMaker.jsx` を添付）

---

## 1. 進行中タスク（最優先・未着手）

### 音素選択のダイアログ化（口パクタブ）

**依頼**: 口パクタブの「音素を選択」インラインパネルを、**ボタン → モーダルダイアログ**方式に変える。

**ユーザーからの追加指示**:
1. パネル内の「**追加:**」行（`phonemeAddRow`）は**不要**。ダイアログに持ち込まない。
2. 「ここの追加は**下の音素の追加**を指していた」
   → **要確認の論点**。有力解釈: 音素を足したいときは下の「ファイル一括読み込み」パネルの
   『音素:』欄（`bulkPhonemeInput` ＋ 母音+ん/子音/すべて）で行う想定だった、ということ。
   **着手前にユーザーへ確認**（ダイアログに追加系を一切置かないでよいか）。

**対象コード**: `src/tabs/lab.jsx`
- インライン本体: `phonemeListPanel`（"音素を選択"）。中身:
  - `phonemeCheckboxGroup`（動的チェックボックス・3列）
  - `phonemeSelectorGroup`（`selectAllBtn`"すべて" / `selectCommonBtn`"母音+ん" / `selectConsonantBtn`"子音" / `deselectAllBtn`"解除"）
  - `phonemeAddRow`（`phonemeAddInput` + `phonemeAddBtn`"＋"）← **撤去対象**
- ビルド/再構築: `rebuildPhonemeChecklist(list)` / `refreshPhonemeChecklist()` / `setPhonemeSelection(selector)`
- 状態: `phonemeData = [{checkbox, phoneme, data}]` / `labFileEntries` / `extraPhonemes` /
  `baselinePhonemes()` / `buildMergedPhonemeList()`（`src/core/lab.jsx`）

**設計上の肝（refactor 必須）**:
現状 `phonemeData` は**ライブな ScriptUI チェックボックスを保持**しており、次が直接それを読む:
- `createBtn.onClick`（音素配置）: `phonemeData[i].checkbox.value` と `.data.times`
- `collectUsedPhonemes()`: チェック中の音素 ∪ 一括入力（⚠カバレッジ用）
- `refreshMouthCoverage()`

ダイアログ化すると widget は開閉のたびに生成/破棄されるので、**選択状態を widget の外に永続化**する:
- `phonemeChecked = {}`（音素名→bool）で選択状態を保持。
- 候補一覧 `phonemeCandidates`（`buildMergedPhonemeList` の結果）を保持し、lab 読込時に再構築。
  新規候補の既定チェックは `isCommonPhoneme(name)`。
- ダイアログは開くたびに `phonemeCandidates` + `phonemeChecked` から再描画、OK で書き戻し（Cancel で破棄）。
- `createBtn` / `collectUsedPhonemes` / `refreshMouthCoverage` を「ライブ widget 参照」から
  「`phonemeChecked` / `phonemeCandidates` 参照」へ書き換える。
- インライン panel の代わりに「**音素を選択…**」ボタン＋選択中サマリ statictext（例: `選択: a,i,u,e,o,N (6)`）。
- ダイアログ関数は **`lab.jsx` 内のクロージャ**で実装（`ui/dialogs.jsx` は lab 状態にアクセスできない）。
- `refreshPhonemeChecklist()` の呼び出し元（`browseBtn.onClick`、`src/99_close.jsx` の init）も新方式に更新。

**版上げ目安**: UI 機能変更なので **y バンプ → 2.9.0**。

---

## 2. 未実装・今後の候補

| 項目 | 状況・メモ |
|---|---|
| 音素選択のダイアログ化 | **進行中**（上記） |
| txt（字幕）と lab/音声のタイミング連携 | 未対応。現状は txt をそのまま字幕テキストレイヤー化するだけ（`src/tabs/lab.jsx` の「連携は今後対応」コメント） |
| `:flipx/:flipy` の自動生成 | 未対応。**全体反転（キャンバスミラー）とペアスワップは実装済み**（`applyStageFlip` / `mirrorLayersInComp`）。手描きペアが無いレイヤーを Scale 反転で自動生成する部分が未対応（孤立 flip はレポート警告のみ） |
| 中間目（mid）の複数コマ対応 | 未対応。現状は 開き / 中間1枚 / 閉じ の 3 役のみ（`buildBlinkExpression` の `hasMid`） |
| 口形マッピングの永続化 | 未対応。現状はエクスプレッションに焼き込み、「現在を取込」で各行へ復元する方式 |
| PSDTool お気に入り(.pfv) 読み込み | 未対応。読み込んで「表情セット（`[EmoSet]`）」に変換できると便利 |
| プレビュー軽量化の大物（音素ブロードキャスタ集約） | **保留**。口パク式は複数 [Lab] 前提で各口形レイヤーが毎フレーム [Lab] を走査する。1 枚に集約すれば軽くなるが、データモデル変更＝バグ増リスクが高く今は見送り（軽量・低リスク分は v2.8.1 で実施済み。焼き込み/グループ優先オプション化はワークフロー悪化のため却下済み） |

**実装済みで「今後候補」から外れたもの**（混乱防止のため明記）:
立ち絵タブの選択肢ボタン折返し（`rebuildStageTree` で実装済み）/ 目パチの [Emo] マーカー連動
（`buildBlinkExpression` の emoCtx で実装済み）/ 表情セット切替（`[EmoSet]`）/ 立ち絵タブ＋マーカー集合モデル。

---

## 3. ローカルルール（厳守）

### ソース構成・ビルド
- **単一配布 `.jsx`** を `src/` の分割ファイルから `build.js` で連結生成する。出力は
  **`dist/EmoLabMaker.jsx`**（`.gitignore` 済み・**絶対にコミットしない**）。
- ビルド: `node build.js`
- 連結順（`build.js` の BODY）:
  `00_header.jsx`(IIFE外) → IIFE_OPEN → `01_version` `05_open`
  `core/layers` `core/expressions` `core/markers` `core/emoset` `core/lab` `core/psd`
  `core/blink` `core/stage-model` `ui/scriptui` `ui/dialogs` `tabs/lab` `tabs/psd`
  `tabs/stage` `99_close` → IIFE_CLOSE。BODY は build.js が +2 スペース字下げして整形する。
- 役割: `core/` = UI 非依存ロジック（テスト可能） / `ui/` = ScriptUI 部品・ダイアログ /
  `tabs/` = 各タブの UI 構築とイベント / `00`,`01`,`05`,`99` = IIFE の枠・共有定数・初期化。

### ExtendScript 制約（ES3）
- `var` のみ。**`const` / `let` / アロー関数 / モダン配列メソッド禁止**。
- **ネスト三項演算子は禁止**（ExtendScript が誤評価する）。必ず `if/else` で書く。
- レイヤー名に **カンマ `,` を使わない**（マーカーの「表示中集合」がカンマ区切りのため）。

### 検証（AE 実機は使えない）
- 構文チェック: `dist/EmoLabMaker.jsx` を `.js` にコピーして `node --check`（`.jsx` は直接不可）。
- テストハーネス: **`/tmp/test_emolab.js`**（現在 **319 件** passing）。`dist` を読むので
  先に `node build.js`。実行: `node /tmp/test_emolab.js`。
  - ⚠ **重要**: このテストは `/tmp` にあり**リポジトリ外**。新しいコンテナでは消える可能性が高い。
    無ければ前セッションの内容から作り直すか、ユーザーに確認すること（リポジトリ化の検討余地あり）。
  - `mockLayer(name, enabled, source, expr)` は expr 対応済み。
    `isManagedStageLayer` / `isRegistered` / `hasOpacitySignature` は抽出済み。

### バージョニング
- セマンティック風 `x.y.z`（x=破壊的 / y=機能追加 / z=修正）。
- 上げる場所は **3 箇所**: `src/01_version.jsx`(`EMO_VERSION`) ＋ `src/00_header.jsx`(`@version`)
  ＋ `CHANGELOG.md`（先頭に追記）。
- `EMO_VERSION` を独立ファイルにしているのは、版上げ時の差分・コンテキスト消費を小さく保つため。

### Git / コミット
- 開発・push は **`claude/psdtoolkit-compatibility-plan-qbn4fy`** ブランチのみ。無ければ作る。
  指示なく別ブランチへ push しない。
- **push 前に必ず** `git fetch origin <branch>` で乖離確認（ユーザーが README 等を直接コミットする）。
  乖離があれば rebase。
- push: `git push -u origin <branch>`。ネットワーク失敗時のみ指数バックオフ（2s/4s/8s/16s）で最大4回。
- **PR はユーザーが明示的に頼んだときだけ**作る。
- コミットメッセージ末尾に必ず付ける:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: <そのセッションの Claude-Session URL>
  ```
  （`Claude-Session` URL はセッションごとに異なる。各セッションのシステム指示の値を使う）
- **モデル ID（claude-opus-4-8 等）を成果物に書かない**（commit / PR / コード / コメント）。チャット内のみ。

### リリース
- `.github/workflows/release.yml` が `v*` タグ push（または手動 dispatch）で `node build.js` →
  `dist/EmoLabMaker.jsx` を Release に添付する。

---

## 4. 完了済みの主要機能（参照用）

- セットアップタブ: PSDToolKit 命名規則（`*`排他 / `!`強制 / 無印=任意 / `:flipx`反転ペア）の自動解析・
  セットアップ（冪等）。命名ショートカット、尺を伸ばす（選択ベース）、設定。
- 立ち絵タブ: 任意深さの階層をインデント表示、ラジオ=ボタン/任意=チェックボックスで独立切替、
  折返し・縦スクロール、全体反転、表情セット（`[EmoSet]`）。マーカー＝「表示中レイヤー名の集合」モデル。
- 口パクタブ: lab 解析・音素配置、ファイル一括読み込み(wav/txt/lab)、口形状マッピング
  （音素→口形を式に焼き込み）、カバレッジ警告(⚠)。
- 目パチタブ: 自動まばたき（time ベース・レイヤー間同期）、開き目表情中のみ発動（emo 連動）。

### 直近の変更履歴（このブランチ）
- v2.8.3 立ち絵ルート直下のシーン装飾レイヤー（カメラ/図形/手置きテキスト等）を除外
- v2.8.2 ボタン・入力欄の高さ統一(22px)＋セットアップのボタン幅整列
- v2.8.1 立ち絵タブの同期・起動を軽量化
- v2.8.0 パネル全体を少しコンパクト化
- v2.7.0 「音素を選択」を一般音素ベース＋追加方式に刷新
