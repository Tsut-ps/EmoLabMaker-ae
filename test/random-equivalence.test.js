// ════════════════════════════════════════════════════════════════
// ランダムシナリオの同値テスト（プロパティベース・シード固定）
// ════════════════════════════════════════════════════════════════
// マーカー配置・レイヤー in/out・目パチパラメータを疑似乱数（シード固定＝
// 毎回同じ列で再現可能）で大量生成し、「ベイクした KF の階段値 ＝ 式の評価値」
// を検証する。手書きシナリオ（bake.test.js）が思いつかない組み合わせを叩く。
// 失敗時はテスト名の scenario 番号から同じ入力を再現できる。
//
// 注意: マーカー時刻は 0.01 秒グリッドで生成する。MARKER_EPSILON(1e-4) 未満の
// 近接マーカーはベイクがイベントを丸めるため式と乖離し得る（既知の許容差）。
var nodeTest = require("node:test");
var describe = nodeTest.describe;
var it = nodeTest.it;
var assert = require("node:assert/strict");
var h = require("./helpers");

var sandbox = h.loadSandbox();

// ── シード固定 PRNG（mulberry32） ───────────────────────────────
function makeRng(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
// 0.01 グリッドの時刻（近接マーカーの epsilon 丸め乖離を避ける）
function gridTime(rng, max) {
  return Math.round(rng() * max * 100) / 100;
}
function uniqueGridTimes(rng, count, max) {
  var seen = {};
  var out = [];
  for (var i = 0; i < count * 3 && out.length < count; i++) {
    var t = gridTime(rng, max);
    if (seen[t]) continue;
    seen[t] = true;
    out.push(t);
  }
  out.sort(function (a, b) {
    return a - b;
  });
  return out;
}
function randomSubset(rng, arr) {
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    if (rng() < 0.5) out.push(arr[i]);
  }
  return out;
}

var NAMES = ["口あ", "口い", "口ん", "目開き", "目閉じ", "眉普通", "ほほ赤"];
var PHONEMES = ["a", "i", "u", "e", "o", "N", "k", "s", "pau"];

function randomMarkers(rng, count, maxT, commentFn) {
  var times = uniqueGridTimes(rng, count, maxT);
  var out = [];
  for (var i = 0; i < times.length; i++) {
    out.push({ time: times[i], comment: commentFn() });
  }
  return out;
}

// ランダムな制御コンポ: 同名制御レイヤー 1〜3 本（時間分割）＋各レイヤーにマーカー
function randomCtrlComp(rng, dur) {
  var segCount = randInt(rng, 1, 3);
  var bounds = uniqueGridTimes(rng, segCount - 1, dur);
  bounds.unshift(0);
  bounds.push(dur);
  var layers = [];
  for (var s = 0; s < segCount; s++) {
    if (bounds[s + 1] - bounds[s] < 0.05) continue; // 幅ゼロ級のセグメントは除外
    layers.push(
      h.makeLayer("[Emo] 顔", {
        inPoint: bounds[s],
        outPoint: bounds[s + 1],
        // マーカー時刻はレイヤー範囲外にも置く（floor 検索が全キーを見る仕様の検証）
        markers: randomMarkers(rng, randInt(rng, 0, 6), dur + 1, function () {
          return randomSubset(rng, NAMES).join(",");
        }),
      }),
    );
  }
  layers.push(h.makeLayer("無関係"));
  return h.makeComp("制御", layers, dur);
}

function assertBakedEqualsExpr(prop, evalFn, endTime, label) {
  var ts = [];
  var t;
  for (t = 0; t <= endTime; t += 0.0371) ts.push(t);
  for (var i = 0; i < prop._t.length; i++) {
    if (prop._t[i] > 0.001) ts.push(prop._t[i] - 0.001);
    ts.push(prop._t[i] + 0.001);
    ts.push(prop._t[i]);
  }
  for (var s = 0; s < ts.length; s++) {
    t = ts[s];
    if (t < 0 || t > endTime) continue;
    assert.equal(
      h.steppedValue(prop, t),
      evalFn(t),
      label + " t=" + t + " でベイク値と式評価が不一致",
    );
  }
}

describe("表情式のランダム同値", function () {
  var rng = makeRng(20260706);
  for (var sc = 0; sc < 10; sc++) {
    (function (sc) {
      it("scenario " + sc, function () {
        var dur = 4 + Math.round(rng() * 12 * 100) / 100;
        var ctrlComp = randomCtrlComp(rng, dur);
        h.registerComps(sandbox, [ctrlComp]);
        var expr = sandbox.buildOpacityExpression("制御", "顔");
        // レイヤー 3 枚ぶん検証
        for (var i = 0; i < 3; i++) {
          var name = pick(rng, NAMES);
          var ly = h.makeLayer(name, { expression: expr });
          h.makeComp("顔", [ly], dur);
          var n = sandbox.bakeEmoLayer(ly, ly.containingComp, {});
          assert.ok(n !== null, "ベイクできること");
          assertBakedEqualsExpr(
            ly.transform.opacity,
            h.makeExprEvaluator(expr, { 制御: ctrlComp }, name),
            dur,
            name,
          );
        }
      });
    })(sc);
  }
});

describe("口形マッピング式のランダム同値", function () {
  var rng = makeRng(19891124);
  for (var sc = 0; sc < 10; sc++) {
    (function (sc) {
      it("scenario " + sc, function () {
        var dur = 6 + Math.round(rng() * 10 * 100) / 100;
        var tag = rng() < 0.5 ? "" : "ゆかり";
        // [Lab] レイヤー 1〜4 本（in/out は重なってもよい＝スタック順先勝ちの検証）
        var labLayers = [];
        var count = randInt(rng, 1, 4);
        for (var i = 0; i < count; i++) {
          var inP = gridTime(rng, dur * 0.7);
          var outP = inP + 0.5 + gridTime(rng, dur - inP);
          var lyTag = rng() < 0.7 ? "ゆかり" : "あかり";
          labLayers.push(
            h.makeLayer("[Lab] v" + i + " " + lyTag, {
              inPoint: inP,
              outPoint: outP,
              markers: randomMarkers(rng, randInt(rng, 1, 6), dur, function () {
                return pick(rng, PHONEMES);
              }),
            }),
          );
        }
        var timeline = h.makeComp("タイムライン", [h.makeLayer("音声")].concat(labLayers), dur);
        var ctrlComp = randomCtrlComp(rng, dur);
        h.registerComps(sandbox, [ctrlComp, timeline]);

        var emoCtx = rng() < 0.5 ? null : { ctrlCompName: "制御", targetCompName: "顔" };
        var myCsv = randomSubset(rng, PHONEMES).join(",");
        var closed = rng() < 0.4;
        var expr = sandbox.buildLabMappedExpression(
          "タイムライン",
          myCsv,
          "a,i,u,e,o,N",
          closed,
          emoCtx,
          tag,
        );
        var name = pick(rng, NAMES);
        var ly = h.makeLayer(name, { expression: expr });
        h.makeComp("口コンポ", [ly], dur);
        var n = sandbox.bakeLabLayer(ly, ly.containingComp, {}, {});
        assert.ok(n !== null, "ベイクできること");
        assertBakedEqualsExpr(
          ly.transform.opacity,
          h.makeExprEvaluator(expr, { タイムライン: timeline, 制御: ctrlComp }, name),
          dur,
          name,
        );
      });
    })(sc);
  }
});

describe("目パチ式のランダム同値", function () {
  var rng = makeRng(41213);
  for (var sc = 0; sc < 12; sc++) {
    (function (sc) {
      it("scenario " + sc, function () {
        var dur = 5 + Math.round(rng() * 7 * 100) / 100;
        var params = {
          interval: 0.8 + Math.round(rng() * 4 * 100) / 100,
          speed: 0.02 + Math.round(rng() * 0.25 * 1000) / 1000,
          hold: Math.round(rng() * 0.15 * 1000) / 1000,
          jitter: Math.round(rng() * 0.9 * 100) / 100,
        };
        var role = pick(rng, ["open", "mid", "closed"]);
        var hasMid = rng() < 0.7;
        var emoCtx = rng() < 0.5 ? null : { ctrlCompName: "制御", targetCompName: "顔" };
        var ctrlComp = randomCtrlComp(rng, dur);
        h.registerComps(sandbox, [ctrlComp]);
        var openCsv = randomSubset(rng, NAMES).join(",");
        var expr = sandbox.buildBlinkExpression(params, role, hasMid, openCsv, emoCtx);
        var name = pick(rng, NAMES);
        var ly = h.makeLayer(name, { expression: expr });
        h.makeComp("目コンポ", [ly], dur);
        var n = sandbox.bakeBlinkLayer(ly, ly.containingComp, {});
        assert.ok(n !== null, "ベイクできること");
        assertBakedEqualsExpr(
          ly.transform.opacity,
          h.makeExprEvaluator(expr, { 制御: ctrlComp }, name),
          dur,
          name,
        );
      });
    })(sc);
  }
});
