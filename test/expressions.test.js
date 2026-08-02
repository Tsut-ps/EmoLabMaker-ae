// ════════════════════════════════════════════════════════════════
// 式の挙動テスト: 生成されたエクスプレッションを vm で評価して検証する
// ════════════════════════════════════════════════════════════════
// 表情（マーカー集合 membership）・口形マッピング・目パチの各式について、
// マーカー/時刻/レイヤー名ごとの表示判定が仕様どおりかを確認する。
// 式ロジックを変更したら、core/bake.jsx のスクリプト版と bake.test.js の
// 同値テストもあわせて更新すること（二重管理の乖離はテストで検出される）。
var nodeTest = require("node:test");
var describe = nodeTest.describe;
var it = nodeTest.it;
var assert = require("node:assert/strict");
var h = require("./helpers");

var sandbox = h.loadSandbox();

function evalExpr(expr, env) {
  return h.makeExprEvaluator(expr, env.comps || {}, env.thisLayer.name)(env.time);
}

// 制御コンポ: [Emo] 顔 レイヤーにマーカー（表示中集合）
function ctrlCompWith(markers) {
  return h.makeComp(
    "制御",
    [h.makeLayer("[Emo] 顔", { markers: markers || [] }), h.makeLayer("無関係")],
    60,
  );
}
var MARKERS = [
  { time: 1, comment: "口あ,目開き" },
  { time: 5, comment: "口ん,目閉じ" },
];

describe("表情式", function () {
  var opExpr = sandbox.buildOpacityExpression("制御", "顔");
  function emoEnv(markers, layerName, t) {
    return {
      time: t,
      thisLayer: { name: layerName },
      comps: { 制御: ctrlCompWith(markers) },
    };
  }
  it("集合に含まれる → 100", function () {
    assert.equal(evalExpr(opExpr, emoEnv(MARKERS, "口あ", 2)), 100);
  });
  it("含まれない → 0", function () {
    assert.equal(evalExpr(opExpr, emoEnv(MARKERS, "口い", 2)), 0);
  });
  it("区間2で切替", function () {
    assert.equal(evalExpr(opExpr, emoEnv(MARKERS, "口ん", 6)), 100);
  });
  it("部分一致しない(口あ2) → 0", function () {
    assert.equal(evalExpr(opExpr, emoEnv([{ time: 1, comment: "口あ2" }], "口あ", 2)), 0);
  });
  it("最初のマーカーより前 → 0", function () {
    assert.equal(evalExpr(opExpr, emoEnv(MARKERS, "口あ", 0.5)), 0);
  });
  it("マーカー無し → 0", function () {
    assert.equal(evalExpr(opExpr, emoEnv([], "口あ", 2)), 0);
  });
});

describe("口形マッピング式", function () {
  var emoCtx = { ctrlCompName: "制御", targetCompName: "顔" };
  var mapExpr = sandbox.buildLabMappedExpression("タイムライン", "a,e", "a,i,u,e,o,N", false, emoCtx, "");
  var mapExprClosed = sandbox.buildLabMappedExpression("タイムライン", "N", "a,i,u,e,o,N", true, emoCtx, "");
  function mapEnv(labMarkers, ctrlMarkers, layerName, t) {
    var labLayer = h.makeLayer("[Lab] voice01", {
      inPoint: 0,
      outPoint: 10,
      markers: labMarkers,
    });
    return {
      time: t,
      thisLayer: { name: layerName },
      comps: {
        タイムライン: h.makeComp("タイムライン", [h.makeLayer("音声など"), labLayer], 60),
        制御: ctrlCompWith(ctrlMarkers),
      },
    };
  }
  var LAB = [
    { time: 1, comment: "a" },
    { time: 2, comment: "k" },
    { time: 3, comment: "o" },
  ];
  it("自分の音素 → 100", function () {
    assert.equal(evalExpr(mapExpr, mapEnv(LAB, MARKERS, "口あ", 1.5)), 100);
  });
  it("他の口形の音素 → 0", function () {
    assert.equal(evalExpr(mapExpr, mapEnv(LAB, MARKERS, "口あ", 3.5)), 0);
  });
  // time=20: [Lab] レイヤー(out=10)の範囲外=非発話。表情は時刻5の「口ん,目閉じ」が有効
  it("非発話 → 表情に従い表示", function () {
    assert.equal(evalExpr(mapExpr, mapEnv(LAB, MARKERS, "口ん", 20)), 100);
  });
  it("非発話 → 表情集合外は非表示", function () {
    assert.equal(evalExpr(mapExpr, mapEnv(LAB, MARKERS, "口あ", 20)), 0);
  });
  it("閉じ口は未割当音素(子音)でも表示", function () {
    assert.equal(evalExpr(mapExprClosed, mapEnv(LAB, MARKERS, "口ん", 2.5)), 100);
  });
  it("閉じ口も他口形の音素では非表示", function () {
    assert.equal(evalExpr(mapExprClosed, mapEnv(LAB, MARKERS, "口ん", 1.5)), 0);
  });
  it("タグ不一致の[Lab]は無視(非発話扱い)", function () {
    // 時刻1.5の表情は「口あ,目開き」→ 表情フォールバックで表示
    var mapTagged = sandbox.buildLabMappedExpression("タイムライン", "a,e", "a,i,u,e,o,N", false, emoCtx, "ゆかり");
    assert.equal(evalExpr(mapTagged, mapEnv(LAB, MARKERS, "口あ", 1.5)), 100);
  });
});

describe("目パチ式", function () {
  var params = { interval: 4, speed: 0.07, hold: 0.035, jitter: 0.4 };
  var emoCtx = { ctrlCompName: "制御", targetCompName: "顔" };
  var blinkExpr = sandbox.buildBlinkExpression(params, "open", true, "目開き", emoCtx);
  function blinkEnv(ctrlMarkers, layerName, t) {
    return {
      time: t,
      thisLayer: { name: layerName },
      comps: { 制御: ctrlCompWith(ctrlMarkers) },
    };
  }
  // time=0 は瞬きサイクル外 → 開き目=100
  it("開き目表情中は位相制御(開き表示)", function () {
    assert.equal(evalExpr(blinkExpr, blinkEnv([{ time: 0, comment: "目開き,口あ" }], "目開き", 0)), 100);
  });
  it("マーカー無しは位相制御", function () {
    assert.equal(evalExpr(blinkExpr, blinkEnv([], "目開き", 0)), 100);
  });
  it("他表情中は表情に従う(非表示)", function () {
    assert.equal(evalExpr(blinkExpr, blinkEnv([{ time: 0, comment: "目笑い,口あ" }], "目開き", 0)), 0);
  });
  it("他表情中でも集合に居れば表示", function () {
    var blinkClosed = sandbox.buildBlinkExpression(params, "closed", true, "目開き", emoCtx);
    assert.equal(evalExpr(blinkClosed, blinkEnv([{ time: 0, comment: "目閉じ" }], "目閉じ", 0)), 100);
  });
  it("emo無し単独は位相制御", function () {
    var blinkSolo = sandbox.buildBlinkExpression(params, "open", true, "目開き", null);
    assert.equal(evalExpr(blinkSolo, { time: 0, thisLayer: { name: "目開き" } }), 100);
  });
});

describe("parseEmoContext ラウンドトリップ", function () {
  function mockExprLayer(expr) {
    return { transform: { opacity: { expression: expr } } };
  }
  var emoCtx = { ctrlCompName: "制御", targetCompName: "顔" };
  it("emo式から復元", function () {
    var expr = sandbox.buildOpacityExpression("制御", "顔");
    assert.deepEqual(h.plain(sandbox.parseEmoContext(mockExprLayer(expr))), emoCtx);
  });
  it("口形合成式から復元", function () {
    var expr = sandbox.buildLabMappedExpression("タイムライン", "a,e", "a,i,u,e,o,N", false, emoCtx, "");
    assert.deepEqual(h.plain(sandbox.parseEmoContext(mockExprLayer(expr))), emoCtx);
  });
  it("目パチ合成式から復元", function () {
    var expr = sandbox.buildBlinkExpression(
      { interval: 4, speed: 0.07, hold: 0.035, jitter: 0.4 },
      "open",
      true,
      "目開き",
      emoCtx,
    );
    assert.deepEqual(h.plain(sandbox.parseEmoContext(mockExprLayer(expr))), emoCtx);
  });
  it("引用符/バックスラッシュ入り名も復元", function () {
    var trickyCtx = { ctrlCompName: 'A"B\\C', targetCompName: '顔"逆\\' };
    var expr = sandbox.buildOpacityExpression(trickyCtx.ctrlCompName, trickyCtx.targetCompName);
    assert.deepEqual(h.plain(sandbox.parseEmoContext(mockExprLayer(expr))), trickyCtx);
  });
});

describe("システムレイヤー判定", function () {
  it("[Emo] / [EmoSet] / [Lab] は対象", function () {
    assert.equal(sandbox.isSystemLayerName("[Emo] 顔"), true);
    assert.equal(sandbox.isSystemLayerName("[EmoSet] 通常"), true);
    assert.equal(sandbox.isSystemLayerName("[Lab] voice"), true);
  });
  it("通常レイヤーは対象外", function () {
    assert.equal(sandbox.isSystemLayerName("*口あ"), false);
  });
});

describe("字幕式の上書き判定", function () {
  function textLayerWithExpression(expr) {
    var sourceText = { expression: expr };
    return {
      property: function (name) {
        if (name === "ADBE Text Properties") {
          return {
            property: function () {
              return sourceText;
            },
          };
        }
        return null;
      },
    };
  }

  it("式なし・字幕式は上書き確認の対象外", function () {
    assert.equal(sandbox.hasUnmanagedSubtitleExpression(textLayerWithExpression("")), false);
    assert.equal(
      sandbox.hasUnmanagedSubtitleExpression(
        textLayerWithExpression(sandbox.buildSubtitleExpression()),
      ),
      false,
    );
  });

  it("既存の別Source Text式は上書き確認の対象", function () {
    assert.equal(
      sandbox.hasUnmanagedSubtitleExpression(textLayerWithExpression("timeToFrames(time);")),
      true,
    );
  });
});
