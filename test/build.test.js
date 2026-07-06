// ════════════════════════════════════════════════════════════════
// ビルドテスト: build.js が dist を生成し、生成物の構文が正しいこと
// ════════════════════════════════════════════════════════════════
var nodeTest = require("node:test");
var test = nodeTest.test;
var assert = require("node:assert/strict");
var cp = require("child_process");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var DIST = path.join(ROOT, "dist", "EmoLabMaker.jsx");

test("build.js が dist/EmoLabMaker.jsx を生成する", function () {
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, "build.js")], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.ok(fs.existsSync(DIST), "dist/EmoLabMaker.jsx が存在する");
});

test("生成物の構文が正しい（vm.Script でコンパイルのみ＝実行しない）", function () {
  var src = fs.readFileSync(DIST, "utf8");
  assert.ok(src.length > 0);
  // 構文エラーがあればここで throw する
  new vm.Script(src, { filename: DIST });
});
