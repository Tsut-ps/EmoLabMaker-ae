// ════════════════════════════════════════════════════════════════
// ベイクの同値テスト: 「ベイクした KF の階段値 ＝ 実際の式の評価値」
// ════════════════════════════════════════════════════════════════
// core/bake.jsx は式ロジックのスクリプト再実装（二重管理）なので、
// このテストが両者の乖離を検出する安全網になる。式（expressions/lab/blink）
// またはベイク（bake.jsx）のどちらかだけを変更するとここが落ちる。
// 比較は時間軸全域のサンプリング（等間隔＋KF 境界の直前直後）で行う。
var nodeTest = require("node:test");
var describe = nodeTest.describe;
var it = nodeTest.it;
var assert = require("node:assert/strict");
var h = require("./helpers");

var sandbox = h.loadSandbox();

// ベイク結果と式評価を比較（境界前後 + 等間隔サンプル）。不一致で throw
function assertBakedEqualsExpr(prop, evalFn, endTime) {
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
    assert.equal(h.steppedValue(prop, t), evalFn(t), "t=" + t + " でベイク値と式評価が不一致");
  }
}

describe("表情式のベイク同値", function () {
  var DUR = 12;
  // 制御レイヤーが 0-6 / 6-12 で分割されているケースも含める
  var ctrlA = h.makeLayer("[Emo] 顔", {
    inPoint: 0,
    outPoint: 6,
    markers: [
      { time: 1, comment: "口あ,目開き" },
      { time: 4.5, comment: "口ん,目閉じ" },
    ],
  });
  var ctrlB = h.makeLayer("[Emo] 顔", {
    inPoint: 6,
    outPoint: 12,
    markers: [
      { time: 7, comment: "口あ" },
      { time: 10, comment: "" },
    ],
  });
  var ctrlComp = h.makeComp("制御", [ctrlA, ctrlB, h.makeLayer("無関係")], DUR);
  var expr = sandbox.buildOpacityExpression("制御", "顔");
  var names = ["口あ", "口ん", "目開き"];
  names.forEach(function (name) {
    it(name + ": ベイクして式評価と全域一致", function () {
      h.registerComps(sandbox, [ctrlComp]);
      var ly = h.makeLayer(name, { expression: expr });
      var targetComp = h.makeComp("顔", [ly], DUR);
      var n = sandbox.bakeEmoLayer(ly, targetComp, {});
      assert.ok(n !== null && n >= 1, "KF が書かれること (n=" + n + ")");
      assert.equal(ly.transform.opacity.expressionEnabled, false, "式は無効化される");
      assertBakedEqualsExpr(
        ly.transform.opacity,
        h.makeExprEvaluator(expr, { 制御: ctrlComp }, name),
        DUR,
      );
    });
  });
});

describe("口形マッピング式のベイク同値", function () {
  var DUR = 14;
  var ctrl = h.makeLayer("[Emo] 顔", {
    markers: [
      { time: 0.5, comment: "口あ,目開き" },
      { time: 9, comment: "口ん" },
    ],
  });
  var ctrlComp = h.makeComp("制御", [ctrl], DUR);
  var lab1 = h.makeLayer("[Lab] voice01 ゆかり", {
    inPoint: 1,
    outPoint: 5,
    markers: [
      { time: 1.2, comment: "a" },
      { time: 1.9, comment: "k" },
      { time: 2.6, comment: "o" },
      { time: 4.0, comment: "N" },
    ],
  });
  var lab2 = h.makeLayer("[Lab] voice02 ゆかり", {
    inPoint: 6,
    outPoint: 10,
    markers: [
      { time: 6.5, comment: "e" },
      { time: 8.2, comment: "pau" },
    ],
  });
  var labOther = h.makeLayer("[Lab] voice03 あかり", {
    inPoint: 0,
    outPoint: 14,
    markers: [{ time: 0.2, comment: "i" }],
  });
  var timeline = h.makeComp("タイムライン", [h.makeLayer("音声"), lab1, lab2, labOther], DUR);

  var emoCtx = { ctrlCompName: "制御", targetCompName: "顔" };
  var cases = [
    { label: "口あ(a,e)+emo", name: "口あ", my: "a,e", closed: false, emo: emoCtx, tag: "ゆかり" },
    { label: "口ん(N)閉じ+emo", name: "口ん", my: "N", closed: true, emo: emoCtx, tag: "ゆかり" },
    { label: "口お(o) emoなし", name: "口お", my: "o", closed: false, emo: null, tag: "ゆかり" },
    { label: "口ん(N)閉じ emoなし", name: "口ん", my: "N", closed: true, emo: null, tag: "ゆかり" },
  ];
  cases.forEach(function (cs) {
    it(cs.label + ": ベイクして式評価と全域一致", function () {
      h.registerComps(sandbox, [ctrlComp, timeline]);
      var expr = sandbox.buildLabMappedExpression(
        "タイムライン",
        cs.my,
        "a,i,u,e,o,N",
        cs.closed,
        cs.emo,
        cs.tag,
      );
      var ly = h.makeLayer(cs.name, { expression: expr });
      var comp = h.makeComp("口コンポ", [ly], DUR);
      var n = sandbox.bakeLabLayer(ly, comp, {}, {});
      assert.ok(n !== null && n >= 1, "KF が書かれること (n=" + n + ")");
      assertBakedEqualsExpr(
        ly.transform.opacity,
        h.makeExprEvaluator(expr, { タイムライン: timeline, 制御: ctrlComp }, cs.name),
        DUR,
      );
    });
  });
});

describe("目パチ式のベイク同値", function () {
  var DUR = 13;
  var ctrl = h.makeLayer("[Emo] 顔", {
    markers: [
      { time: 0.5, comment: "目開き,口あ" },
      { time: 5, comment: "目笑い" },
      { time: 9, comment: "目閉じ" },
    ],
  });
  var ctrlComp = h.makeComp("制御", [ctrl], DUR);
  var params = { interval: 1.0, speed: 0.07, hold: 0.035, jitter: 0.4 };
  var emoCtx = { ctrlCompName: "制御", targetCompName: "顔" };
  var cases = [
    { label: "開き emoなし", role: "open", name: "目開き", hasMid: true, emo: null },
    { label: "中間 emoなし", role: "mid", name: "目中間", hasMid: true, emo: null },
    { label: "閉じ emoなし midなし", role: "closed", name: "目閉じ", hasMid: false, emo: null },
    { label: "開き emoあり", role: "open", name: "目開き", hasMid: true, emo: emoCtx },
    { label: "閉じ emoあり", role: "closed", name: "目閉じ", hasMid: true, emo: emoCtx },
    { label: "中間 emoあり", role: "mid", name: "目中間", hasMid: true, emo: emoCtx },
  ];
  cases.forEach(function (cs) {
    it(cs.label + ": ベイクして式評価と全域一致", function () {
      h.registerComps(sandbox, [ctrlComp]);
      var expr = sandbox.buildBlinkExpression(params, cs.role, cs.hasMid, "目開き", cs.emo);
      var ly = h.makeLayer(cs.name, { expression: expr });
      var comp = h.makeComp("目コンポ", [ly], DUR);
      var n = sandbox.bakeBlinkLayer(ly, comp, {});
      assert.ok(n !== null && n >= 1, "KF が書かれること (n=" + n + ")");
      assertBakedEqualsExpr(
        ly.transform.opacity,
        h.makeExprEvaluator(expr, { 制御: ctrlComp }, cs.name),
        DUR,
      );
    });
  });
});

describe("bakeAll / unbakeAll / 再適用の後片付け", function () {
  var DUR = 8;
  var ctrl = h.makeLayer("[Emo] 顔", { markers: [{ time: 1, comment: "口あ" }] });
  var ctrlComp = h.makeComp("制御", [ctrl], DUR);
  var emoExpr = sandbox.buildOpacityExpression("制御", "顔");

  it("bakeAll: 種別集計・解析不能スキップ・unbakeAll 復元", function () {
    var lyA = h.makeLayer("口あ", { expression: emoExpr });
    var lyBroken = h.makeLayer("壊れた式", {
      expression: "// emo2layerCtrlMarker\nこれは解析できない",
    });
    var lyPlain = h.makeLayer("無関係", { expression: "" });
    var faceComp = h.makeComp("顔", [lyA, lyBroken, lyPlain], DUR);
    h.registerComps(sandbox, [ctrlComp, faceComp]);

    var rep = sandbox.bakeAllExpressions();
    assert.equal(rep.emo, 1);
    assert.equal(rep.skipped, 1, "解析不能はスキップされる");
    assert.equal(lyBroken.transform.opacity.expressionEnabled, true, "スキップ層の式は有効なまま");
    assert.ok(lyA.transform.opacity.numKeys >= 1);

    var rep2 = sandbox.unbakeAllExpressions();
    assert.equal(rep2.restored, 1);
    assert.equal(lyA.transform.opacity.numKeys, 0);
    assert.equal(lyA.transform.opacity.expressionEnabled, true);
    assert.equal(lyA.transform.opacity._static, 100);
  });

  it("再適用: ベイク済みレイヤーは新しい式で自動再ベイク", function () {
    h.registerComps(sandbox, [ctrlComp]);
    var ly = h.makeLayer("口あ", { expression: emoExpr });
    h.makeComp("顔2", [ly], DUR);
    sandbox.bakeEmoLayer(ly, ly.containingComp, {});
    assert.equal(ly.transform.opacity.expressionEnabled, false);

    sandbox.setOpacityExpression(ly, emoExpr);
    assert.equal(ly.transform.opacity.expressionEnabled, false, "ベイク状態を維持");
    assert.ok(ly.transform.opacity.numKeys >= 1);

    // ベイク済み emo レイヤーへ目パチを適用 → 目パチ式で再ベイクされ、値も一致
    var blinkExpr = sandbox.buildBlinkExpression(
      { interval: 1.0, speed: 0.07, hold: 0.035, jitter: 0.4 },
      "open",
      false,
      "口あ",
      { ctrlCompName: "制御", targetCompName: "顔" },
    );
    sandbox.setOpacityExpression(ly, blinkExpr);
    assert.equal(ly.transform.opacity.expressionEnabled, false, "ベイク状態を維持");
    assertBakedEqualsExpr(
      ly.transform.opacity,
      h.makeExprEvaluator(blinkExpr, { 制御: ctrlComp }, ly.name),
      DUR,
    );
  });

  it("未ベイクのレイヤーへの適用はライブ式のまま", function () {
    h.registerComps(sandbox, [ctrlComp]);
    var ly = h.makeLayer("口え", { expression: "" });
    h.makeComp("顔4", [ly], DUR);
    sandbox.setOpacityExpression(ly, emoExpr);
    assert.equal(ly.transform.opacity.expressionEnabled, true);
    assert.equal(ly.transform.opacity.numKeys, 0);
  });

  it("clearOpacityExpression はベイク状態からでも素へ戻す", function () {
    h.registerComps(sandbox, [ctrlComp]);
    var ly = h.makeLayer("口う", { expression: emoExpr });
    h.makeComp("顔3", [ly], DUR);
    sandbox.bakeEmoLayer(ly, ly.containingComp, {});
    sandbox.clearOpacityExpression(ly);
    assert.equal(ly.transform.opacity.numKeys, 0);
    assert.equal(ly.transform.opacity.expression, "");
    assert.equal(ly.transform.opacity._static, 100);
  });
});

describe("式パラメータの逆パーサ", function () {
  var emoCtx = { ctrlCompName: '制"御\\', targetCompName: "顔" };

  it("parseLabMapContext: 埋め込みパラメータを復元", function () {
    var expr = sandbox.buildLabMappedExpression("タイム,ライン", "a,e", "a,i,u,e,o,N", true, emoCtx, "ゆかり");
    var ctx = sandbox.parseLabMapContext(h.makeLayer("口", { expression: expr }));
    assert.ok(ctx !== null);
    assert.equal(ctx.phonemeCompName, "タイム,ライン");
    assert.equal(ctx.labTag, "ゆかり");
    assert.equal(ctx.isClosedFallback, true);
    assert.equal(ctx.myPhonemes, ",a,e,", "式と同じ前後カンマ付きで保持");
    assert.equal(ctx.allPhonemes, ",a,i,u,e,o,N,");
    assert.deepEqual(h.plain(ctx.emoCtx), emoCtx);
  });

  it("parseBlinkContext: 埋め込みパラメータを復元", function () {
    var expr = sandbox.buildBlinkExpression(
      { interval: 4, speed: 0.07, hold: 0.035, jitter: 0.4 },
      "mid",
      true,
      '目"開き,目\\開2',
      emoCtx,
    );
    var ctx = sandbox.parseBlinkContext(h.makeLayer("目", { expression: expr }));
    assert.ok(ctx !== null);
    assert.equal(ctx.role, "mid");
    assert.equal(ctx.hasMid, true);
    assert.deepEqual(
      [ctx.interval, ctx.speed, ctx.hold, ctx.jitter],
      [4, 0.07, 0.035, 0.4],
    );
    assert.deepEqual(h.plain(ctx.openNames), ['目"開き', "目\\開2"]);
    assert.deepEqual(h.plain(ctx.emoCtx), emoCtx);
  });

  it("parseBlinkContext: 旧形式(〜v2.13.2、CSV 文字列)の openNames も読める", function () {
    var expr = sandbox.buildBlinkExpression(
      { interval: 4, speed: 0.07, hold: 0.035, jitter: 0.4 },
      "mid",
      true,
      "目開き,目開2",
      emoCtx,
    );
    var oldExpr = expr.replace(/var openNames = \[.*\];/, 'var openNames = ",目開き,目開2,";');
    var ctx = sandbox.parseBlinkContext(h.makeLayer("目", { expression: oldExpr }));
    assert.ok(ctx !== null);
    assert.deepEqual(h.plain(ctx.openNames), ["目開き", "目開2"]);
  });
});

describe("エッジケース", function () {
  var emoCtx = { ctrlCompName: "制御", targetCompName: "顔" };

  it("同タグの [Lab] が時間的に重なる（スタック順先勝ち）", function () {
    var DUR = 12;
    var labA = h.makeLayer("[Lab] vA ゆかり", {
      inPoint: 0,
      outPoint: 8,
      markers: [
        { time: 1, comment: "a" },
        { time: 6, comment: "o" },
      ],
    });
    var labB = h.makeLayer("[Lab] vB ゆかり", {
      inPoint: 4,
      outPoint: 12,
      markers: [
        { time: 4.5, comment: "e" },
        { time: 9, comment: "N" },
      ],
    });
    var timeline = h.makeComp("タイムライン", [labA, labB], DUR);
    var ctrlComp = h.makeComp(
      "制御",
      [h.makeLayer("[Emo] 顔", { markers: [{ time: 0, comment: "口あ" }] })],
      DUR,
    );
    h.registerComps(sandbox, [ctrlComp, timeline]);
    var expr = sandbox.buildLabMappedExpression("タイムライン", "a,e", "a,i,u,e,o,N", false, emoCtx, "ゆかり");
    var ly = h.makeLayer("口あ", { expression: expr });
    h.makeComp("口コンポ", [ly], DUR);
    assert.ok(sandbox.bakeLabLayer(ly, ly.containingComp, {}, {}) !== null);
    // 重なり区間（4-8 秒）は上にある labA が勝つ、が式・ベイク双方で一致すること
    var evalFn = h.makeExprEvaluator(expr, { タイムライン: timeline, 制御: ctrlComp }, "口あ");
    for (var t = 0; t <= DUR; t += 0.05) {
      assert.equal(h.steppedValue(ly.transform.opacity, t), evalFn(t), "t=" + t);
    }
  });

  it("空の音素割り当て（グループ優先サプレス相当: 発話中は常に非表示）", function () {
    var DUR = 10;
    var lab = h.makeLayer("[Lab] v", {
      inPoint: 0,
      outPoint: 6,
      markers: [{ time: 1, comment: "a" }],
    });
    var timeline = h.makeComp("タイムライン", [lab], DUR);
    var ctrlComp = h.makeComp(
      "制御",
      [h.makeLayer("[Emo] 顔", { markers: [{ time: 0, comment: "服A" }] })],
      DUR,
    );
    h.registerComps(sandbox, [ctrlComp, timeline]);
    // tabs/lab.jsx のサプレスは myCsv="" isClosedFallback=false で登録される
    var expr = sandbox.buildLabMappedExpression("タイムライン", "", "a,i,u,e,o,N", false, emoCtx, "");
    var ly = h.makeLayer("服A", { expression: expr });
    h.makeComp("服コンポ", [ly], DUR);
    assert.ok(sandbox.bakeLabLayer(ly, ly.containingComp, {}, {}) !== null);
    var evalFn = h.makeExprEvaluator(expr, { タイムライン: timeline, 制御: ctrlComp }, "服A");
    assert.equal(h.steppedValue(ly.transform.opacity, 2), 0, "発話中は非表示");
    assert.equal(h.steppedValue(ly.transform.opacity, 8), 100, "非発話中は表情に従い表示");
    for (var t = 0; t <= DUR; t += 0.05) {
      assert.equal(h.steppedValue(ly.transform.opacity, t), evalFn(t), "t=" + t);
    }
  });

  it("マーカーがコンプ尺ちょうど / 尺超過にある", function () {
    var DUR = 6;
    var ctrlComp = h.makeComp(
      "制御",
      [
        h.makeLayer("[Emo] 顔", {
          markers: [
            { time: 1, comment: "口あ" },
            { time: 6, comment: "口ん" }, // 尺ちょうど
            { time: 8, comment: "口あ" }, // 尺超過（ベイク範囲外だが式は参照し得ない）
          ],
        }),
      ],
      DUR,
    );
    h.registerComps(sandbox, [ctrlComp]);
    var expr = sandbox.buildOpacityExpression("制御", "顔");
    var ly = h.makeLayer("口ん", { expression: expr });
    h.makeComp("顔", [ly], DUR);
    assert.ok(sandbox.bakeEmoLayer(ly, ly.containingComp, {}) !== null);
    var evalFn = h.makeExprEvaluator(expr, { 制御: ctrlComp }, "口ん");
    for (var t = 0; t <= DUR; t += 0.05) {
      assert.equal(h.steppedValue(ly.transform.opacity, t), evalFn(t), "t=" + t);
    }
  });

  it("目パチの極値パラメータ（hold=0・jitter=0.9・短い interval）", function () {
    var DUR = 8;
    var ctrlComp = h.makeComp(
      "制御",
      [h.makeLayer("[Emo] 顔", { markers: [] })],
      DUR,
    );
    h.registerComps(sandbox, [ctrlComp]);
    var params = { interval: 0.5, speed: 0.03, hold: 0, jitter: 0.9 };
    var roles = ["open", "mid", "closed"];
    for (var r = 0; r < roles.length; r++) {
      var expr = sandbox.buildBlinkExpression(params, roles[r], true, "目開き", null);
      var ly = h.makeLayer("目" + roles[r], { expression: expr });
      h.makeComp("目コンポ", [ly], DUR);
      assert.ok(sandbox.bakeBlinkLayer(ly, ly.containingComp, {}) !== null);
      var evalFn = h.makeExprEvaluator(expr, {}, ly.name);
      for (var t = 0; t <= DUR; t += 0.013) {
        assert.equal(h.steppedValue(ly.transform.opacity, t), evalFn(t), roles[r] + " t=" + t);
      }
    }
  });
});
