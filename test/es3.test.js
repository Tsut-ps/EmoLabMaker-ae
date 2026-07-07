// ════════════════════════════════════════════════════════════════
// ES3 (ExtendScript) 互換 lint
// ════════════════════════════════════════════════════════════════
// 他のテストは Node(V8) 上で src を実行するため、ES3 に無い構文/API が
// 混入してもテストは通ってしまい、AE の ExtendScript 上で初めて壊れる。
// このテストが src/**/*.jsx を走査してモダン構文の混入を機械的に検出する
// （式として埋め込む文字列リテラルも走査対象＝レガシー式エンジン互換も兼ねる）。
var nodeTest = require("node:test");
var test = nodeTest.test;
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");

var SRC_DIR = path.join(__dirname, "..", "src");

// ES3 に存在しない構文・API（ExtendScript / レガシー式エンジンで死ぬもの）
var FORBIDDEN = [
  { re: /\bconst\s+[A-Za-z_$]/, label: "const 宣言" },
  { re: /\blet\s+[A-Za-z_$]/, label: "let 宣言" },
  { re: /=>/, label: "アロー関数" },
  { re: /`/, label: "テンプレートリテラル" },
  { re: /\bclass\s+[A-Za-z_$]/, label: "class 構文" },
  { re: /\bfor\s*\(\s*(?:var\s+)?[A-Za-z_$][\w$]*\s+of\s/, label: "for...of" },
  {
    re: /\.(forEach|map|filter|reduce|reduceRight|some|every|find|findIndex|includes|trim|trimStart|trimEnd|bind|padStart|padEnd|startsWith|endsWith|flat|flatMap|entries|keys|values)\s*\(/,
    label: "ES5+ のメソッド",
  },
  { re: /\bJSON\s*\./, label: "JSON（ES5。ExtendScript に無い）" },
  { re: /\bObject\s*\.\s*(keys|values|entries|assign|create|freeze|defineProperty|defineProperties|getPrototypeOf)\b/, label: "Object の ES5+ 静的メソッド" },
  { re: /\bArray\s*\.\s*(isArray|from|of)\b/, label: "Array の ES5+ 静的メソッド" },
];

function collectJsxFiles(dir, out) {
  var entries = fs.readdirSync(dir);
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(dir, entries[i]);
    var st = fs.statSync(full);
    if (st.isDirectory()) collectJsxFiles(full, out);
    else if (/\.jsx$/.test(entries[i])) out.push(full);
  }
  return out;
}

test("src/**/*.jsx に ES3 に無い構文/API が混入していない", function () {
  var files = collectJsxFiles(SRC_DIR, []);
  assert.ok(files.length > 0, "src/*.jsx が見つかること");
  var violations = [];
  for (var f = 0; f < files.length; f++) {
    var rel = path.relative(path.join(__dirname, ".."), files[f]);
    var lines = fs.readFileSync(files[f], "utf8").split("\n");
    for (var i = 0; i < lines.length; i++) {
      for (var p = 0; p < FORBIDDEN.length; p++) {
        if (FORBIDDEN[p].re.test(lines[i])) {
          violations.push(
            rel + ":" + (i + 1) + " [" + FORBIDDEN[p].label + "] " + lines[i].replace(/^\s+/, ""),
          );
        }
      }
    }
  }
  assert.deepEqual(violations, [], "ES3 非互換の構文/API が見つかった");
});
