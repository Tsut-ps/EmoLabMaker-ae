#!/usr/bin/env node
/**
 * build.js — EmoLabMaker.jsx をソース分割版から組み立てる。
 *
 * After Effects は単一の .jsx しか読めず、本体は1つの IIFE クロージャ内で
 * 共有変数(win/tabs/各UIウィジェット)を参照し合う構造のため、ES module 分割は
 * できない。そこで src/*.jsxinc を「決められた順」に**そのまま連結**して
 * dist/EmoLabMaker.jsx を生成する（連結＝同一クロージャが保たれる）。
 *
 * 重要:
 *   - 生成物は dist/EmoLabMaker.jsx（**gitignore 対象・コミットしない**）。
 *     配布は GitHub Releases に添付する（.github/workflows/release.yml）。
 *   - 編集は src/ 側で行い、`node build.js` で再生成する。
 *   - 各 .jsxinc は単体では不完全な断片（00 が IIFE を開き 99 が閉じる）。
 *     構文チェック/テストは生成後の dist/EmoLabMaker.jsx に対して行う。
 *   - 連結順は実行順: 00=IIFE開始/定数/win・tabs生成 → 10=共通基盤 →
 *     20/30/40=各タブ → 99=リサイズ/init/IIFE終了。
 */
var fs = require("fs");
var path = require("path");

var SRC_DIR = path.join(__dirname, "src");
var OUT_DIR = path.join(__dirname, "dist");
var OUT_FILE = path.join(OUT_DIR, "EmoLabMaker.jsx");

// 連結順（明示マニフェスト。番号順ソート任せにせず、ここで順序を一元管理する）
var ORDER = [
  "00_open.jsxinc",
  "10_core.jsxinc",
  "20_tab_lab.jsxinc",
  "30_tab_psd.jsxinc",
  "40_tab_stage.jsxinc",
  "99_close.jsxinc"
];

var buffers = [];
for (var i = 0; i < ORDER.length; i++) {
  var p = path.join(SRC_DIR, ORDER[i]);
  if (!fs.existsSync(p)) {
    console.error("ERROR: 部品が見つかりません: " + p);
    process.exit(1);
  }
  buffers.push(fs.readFileSync(p)); // バイト連結（エンコード変換しない）
}

var out = Buffer.concat(buffers);
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}
fs.writeFileSync(OUT_FILE, out);

var lineCount = out.toString("utf8").split("\n").length;
console.log(
  "Built dist/" + path.basename(OUT_FILE) + " from " + ORDER.length +
  " parts (" + lineCount + " lines, " + out.length + " bytes)."
);
