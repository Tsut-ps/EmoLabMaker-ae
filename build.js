#!/usr/bin/env node
/**
 * build.js — EmoLabMaker.jsx をソース分割版から組み立てる。
 *
 * After Effects は単一の .jsx しか読めず、本体は1つの IIFE クロージャ内で
 * 共有変数(win/tabs/各UIウィジェット)を参照し合う構造のため、ES module 分割は
 * できない。そこで src/*.jsx を「決められた順」に**そのまま連結**して
 * dist/EmoLabMaker.jsx を生成する（連結＝同一クロージャが保たれる）。
 *
 * 重要:
 *   - 生成物は dist/EmoLabMaker.jsx（**gitignore 対象・コミットしない**）。
 *     配布は GitHub Releases に添付する（.github/workflows/release.yml）。
 *   - 編集は src/ 側で行い、`node build.js` で再生成する。
 *   - IIFE のラッパー (function(){ … })(this) は本スクリプトが付ける。よって
 *     src/*.jsx は全て括弧が閉じた断片で、単体でも `node --check` が通る。
 *     ただし共有変数(win/tabs 等)は連結後に同一クロージャへ入る前提なので、
 *     エディタの「変数未定義」警告は出る（構文エラーではない）。
 *   - 連結順は実行順: 00_header(IIFEの外) → [05_open=定数/win・tabs生成 →
 *     core/*・ui/*=共通基盤 → 20/30/40=各タブ → 99=リサイズ/init] → IIFE終了。
 */
var fs = require("fs");
var path = require("path");

var SRC_DIR = path.join(__dirname, "src");
var OUT_DIR = path.join(__dirname, "dist");
var OUT_FILE = path.join(OUT_DIR, "EmoLabMaker.jsx");

// IIFE のラッパー（(function(){ … })(this)）は build.js 側で付ける。
// こうすると src/*.jsx は全て括弧が閉じた断片になり、単体でも `node --check` が
// 通る（00 が開き 99 が閉じる、で構文エラーになる問題を解消）。
//
// 構成:
//   HEADER … IIFE の外（ファイル冒頭のドキュメントコメント）
//   IIFE_OPEN + BODY(各断片) + IIFE_CLOSE … 共有クロージャ本体
var HEADER = ["00_header.jsx"];
var BODY = [
  "05_open.jsx",
  // 共通基盤（旧 10_core.jsx を意味単位に分割。すべて関数宣言/定数で順序自由）
  "core/layers.jsx",
  "core/expressions.jsx",
  "core/markers.jsx",
  "core/emoset.jsx",
  "ui/scriptui.jsx",
  "ui/dialogs.jsx",
  // 各タブ（UI 構築＋ハンドラ。即時実行なので実行順を保つ）
  "20_tab_lab.jsx",
  "30_tab_psd.jsx",
  "40_tab_stage.jsx",
  "99_close.jsx"
];
var IIFE_OPEN = Buffer.from("(function emoLabMaker(thisObj) {\n");
var IIFE_CLOSE = Buffer.from("})(this);\n");

function readParts(names) {
  var bufs = [];
  for (var i = 0; i < names.length; i++) {
    var p = path.join(SRC_DIR, names[i]);
    if (!fs.existsSync(p)) {
      console.error("ERROR: 部品が見つかりません: " + p);
      process.exit(1);
    }
    bufs.push(fs.readFileSync(p)); // バイト連結（エンコード変換しない）
  }
  return Buffer.concat(bufs);
}

var out = Buffer.concat([
  readParts(HEADER),
  IIFE_OPEN,
  readParts(BODY),
  IIFE_CLOSE
]);
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}
fs.writeFileSync(OUT_FILE, out);

var lineCount = out.toString("utf8").split("\n").length;
var partCount = HEADER.length + BODY.length;
console.log(
  "Built dist/" + path.basename(OUT_FILE) + " from " + partCount +
  " parts (" + lineCount + " lines, " + out.length + " bytes)."
);
