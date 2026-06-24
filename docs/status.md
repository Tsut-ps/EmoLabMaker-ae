# EmoLabMaker 開発ステータス & 引き継ぎメモ

このファイルは「いま何が出来ていて・何が残っていて・どんなルールで開発するか」を
1 枚にまとめた最新の引き継ぎ資料。新しいセッションを始めるときは**まずこれを読む**。
（恒久的な開発ルール・ビルド・設計メモは [DEVELOPMENT.md](../DEVELOPMENT.md) を参照）

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
| 口形マッピングの永続化 | 未対応。現状はエクスプレッションに焼き込み、「現在を取込」で各行へ復元する方式 |

---

## 3. 検証メモ（セッション固有）

恒久的な開発ルール（ソース構成・ビルド・ES3 制約・バージョニング・リリース・設計メモ）は
[DEVELOPMENT.md](../DEVELOPMENT.md) に集約。ここには一時的な運用メモだけ残す。

- テストハーネス: **`/tmp/test_emolab.js`**（現在 **319 件** passing）。`dist` を読むので
  先に `node build.js`。実行: `node /tmp/test_emolab.js`。
  - ⚠ `/tmp` にあり**リポジトリ外**。新しいコンテナでは消える可能性が高い。無ければ前セッションの
    内容から作り直すか、ユーザーに確認すること（リポジトリ化の検討余地あり）。
  - `mockLayer(name, enabled, source, expr)` は expr 対応済み。
    `isManagedStageLayer` / `isRegistered` / `hasOpacitySignature` は抽出済み。

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
