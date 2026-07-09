// ════════════════════════════════════════════════════════════════
// 立ち絵タブのクリック時保証（ensureNodeRegistered）のテスト
// ════════════════════════════════════════════════════════════════
// セットアップ未実行のグループを立ち絵タブで触ったとき、制御ヌルの自動作成・
// 既定マーカー（初期表示の保存）・式の登録が正しく行われ、その後のマーカー
// 切替が実際に式へ反映されることを検証する。
var nodeTest = require("node:test");
var describe = nodeTest.describe;
var it = nodeTest.it;
var assert = require("node:assert/strict");
var h = require("./helpers");

var sandbox = h.loadSandbox();

function choice(layer, flips) {
  return { fullName: layer.name, label: layer.name, layer: layer, flips: flips || [] };
}
function makeNode(comp, ctrlComp, radio, optional, isRoot) {
  return {
    comp: comp,
    ctrlComp: ctrlComp,
    isRoot: !!isRoot,
    radioChoices: radio || [],
    optionalChoices: optional || [],
    forcedChoices: [],
  };
}

describe("ensureNodeRegistered: 制御ヌルの自動作成", function () {
  it("制御ヌルが無ければ作成し、既定マーカー・式登録まで整える", function () {
    var ctrlComp = h.makeComp("制御", [h.makeLayer("背景")], 30);
    var lyA = h.makeLayer("*口あ"); // PSD で表示状態
    var lyI = h.makeLayer("*口い");
    lyI.enabled = false; // PSD で非表示
    var lyMeg = h.makeLayer("メガネ"); // 任意指定・表示状態
    var comp = h.makeComp("口", [lyA, lyI, lyMeg], 30);
    h.registerComps(sandbox, [ctrlComp, comp]);
    var node = makeNode(comp, ctrlComp, [choice(lyA), choice(lyI)], [choice(lyMeg)]);

    sandbox.ensureNodeRegistered(node);

    // 制御ヌルが作られ、隠されている
    var ctrl = sandbox.findCtrlLayerInComp(ctrlComp, "口", 0);
    assert.ok(ctrl !== null, "制御ヌルが作られる");
    assert.equal(ctrl.name, "[Emo] 口");
    assert.equal(ctrl.enabled, false, "制御ヌルは隠される");

    // 既定マーカー = 登録前に表示状態だったもの（排他1つ＋任意すべて）
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 0), "*口あ,メガネ");

    // 式が登録され、目が点いている
    assert.ok(sandbox.isRegistered(lyA) && sandbox.isRegistered(lyI) && sandbox.isRegistered(lyMeg));
    assert.equal(lyI.enabled, true, "非表示レイヤーも登録で目が点く");

    // 既定マーカーの下で式が正しく評価される（初期表示の保存）
    var comps = { 制御: ctrlComp };
    assert.equal(h.makeExprEvaluator(lyA.transform.opacity.expression, comps, "*口あ")(1), 100);
    assert.equal(h.makeExprEvaluator(lyI.transform.opacity.expression, comps, "*口い")(1), 0);
    assert.equal(h.makeExprEvaluator(lyMeg.transform.opacity.expression, comps, "メガネ")(1), 100);

    // マーカー書き込みが無言失敗しない（＝クリックが効く）
    assert.equal(sandbox.writeMarkerNameAtTime(ctrlComp, "口", 2, "*口い,メガネ"), true);
    assert.equal(h.makeExprEvaluator(lyI.transform.opacity.expression, comps, "*口い")(3), 100);
    assert.equal(h.makeExprEvaluator(lyA.transform.opacity.expression, comps, "*口あ")(3), 0);
  });

  it("排他が base 非表示・flip 表示なら flip 名を既定にする", function () {
    var ctrlComp = h.makeComp("制御F", [], 30);
    var base = h.makeLayer("*右向き");
    base.enabled = false;
    var flip = h.makeLayer("*右向き:flipx");
    var comp = h.makeComp("体", [base, flip], 30);
    h.registerComps(sandbox, [ctrlComp, comp]);
    var node = makeNode(comp, ctrlComp, [choice(base, [{ suffix: ":flipx", fullName: flip.name, layer: flip }])], []);

    sandbox.ensureNodeRegistered(node);
    var ctrl = sandbox.findCtrlLayerInComp(ctrlComp, "体", 0);
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 0), "*右向き:flipx");
  });

  it("既に制御ヌルがあれば何もしない（冪等・既存マーカー保持）", function () {
    var ctrlComp = h.makeComp("制御2", [
      h.makeLayer("[Emo] 目", { markers: [{ time: 0, comment: "*目開き" }] }),
    ], 30);
    var lyOpen = h.makeLayer("*目開き", {
      expression: null,
    });
    var comp = h.makeComp("目", [lyOpen], 30);
    h.registerComps(sandbox, [ctrlComp, comp]);
    var layersBefore = ctrlComp.numLayers;
    var node = makeNode(comp, ctrlComp, [choice(lyOpen)], []);

    sandbox.ensureNodeRegistered(node);
    assert.equal(ctrlComp.numLayers, layersBefore, "制御ヌルを重複作成しない");
    var ctrl = sandbox.findCtrlLayerInComp(ctrlComp, "目", 0);
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 0), "*目開き", "既存マーカーを上書きしない");
  });

  it("コンポ名が衝突していれば改名してから制御ヌルを作る", function () {
    var otherMouth = h.makeComp("口", [h.makeLayer("*別キャラの口")], 30);
    var ctrlComp = h.makeComp("制御3", [], 30);
    var lyA = h.makeLayer("*口あ");
    var comp = h.makeComp("口", [lyA], 30);
    h.registerComps(sandbox, [otherMouth, ctrlComp, comp]);
    var node = makeNode(comp, ctrlComp, [choice(lyA)], []);

    sandbox.ensureNodeRegistered(node);
    assert.equal(comp.name, "口 2", "衝突時は「 (n)」形式で一意化");
    var ctrl = sandbox.findCtrlLayerInComp(ctrlComp, "口 2", 0);
    assert.ok(ctrl !== null, "新しい名前で制御ヌルが作られる");
    // 式も新しい名前で登録されている（parseEmoContext で復元して確認）
    var ctx = sandbox.parseEmoContext(lyA);
    assert.equal(h.plain(ctx).targetCompName, "口 2");
  });

  it("自コンポ＝制御コンポなら衝突していても改名しない", function () {
    var other = h.makeComp("シーン", [], 30);
    var lyA = h.makeLayer("*立ち絵A");
    var comp = h.makeComp("シーン", [lyA], 30);
    h.registerComps(sandbox, [other, comp]);
    var node = makeNode(comp, comp, [choice(lyA)], []); // ctrlComp = 自分

    sandbox.ensureNodeRegistered(node);
    assert.equal(comp.name, "シーン", "制御コンポ自身は改名しない");
    assert.ok(sandbox.findCtrlLayerInComp(comp, "シーン", 0) !== null);
  });
});

describe("既存マーカーへの静的表示レイヤーの合流", function () {
  it("任意: 表示中の未登録レイヤーが全マーカー集合へ合流し、登録後も消えない", function () {
    // 既にマーカー運用が始まっている制御（カチューシャを知らない）
    var ctrlComp = h.makeComp("制御M", [
      h.makeLayer("[Emo] 服", {
        markers: [
          { time: 0, comment: "*服A" },
          { time: 5, comment: "*服B" },
        ],
      }),
    ], 30);
    var lyA = h.makeLayer("*服A", {
      expression: sandbox.buildOpacityExpression("制御M", "服"),
    });
    var lyB = h.makeLayer("*服B", {
      expression: sandbox.buildOpacityExpression("制御M", "服"),
    });
    var lyKachu = h.makeLayer("カチューシャ"); // 未登録・目ON（静的に表示中）
    var comp = h.makeComp("服", [lyA, lyB, lyKachu], 30);
    h.registerComps(sandbox, [ctrlComp, comp]);
    var node = makeNode(comp, ctrlComp, [choice(lyA), choice(lyB)], [choice(lyKachu)]);

    sandbox.ensureNodeRegistered(node);

    var ctrl = sandbox.findCtrlLayerInComp(ctrlComp, "服", 0);
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 0), "*服A,カチューシャ");
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 6), "*服B,カチューシャ");
    // 登録後の式評価でも表示が保たれる
    var comps = { 制御M: ctrlComp };
    var evalK = h.makeExprEvaluator(lyKachu.transform.opacity.expression, comps, "カチューシャ");
    assert.equal(evalK(1), 100);
    assert.equal(evalK(6), 100);
  });

  it("排他: グループ未代表の集合にだけ追加（別の排他が居る区間はマーカーが真実）", function () {
    var ctrlComp = h.makeComp("制御R", [
      h.makeLayer("[Emo] 髪", {
        markers: [
          { time: 0, comment: "メガネ" }, // 排他はどれも未代表
          { time: 5, comment: "*髪B,メガネ" }, // 別の排他が代表済み
        ],
      }),
    ], 30);
    var lyA = h.makeLayer("*髪A"); // 未登録・目ON
    var lyB = h.makeLayer("*髪B");
    lyB.enabled = false;
    var comp = h.makeComp("髪", [lyA, lyB], 30);
    h.registerComps(sandbox, [ctrlComp, comp]);
    var node = makeNode(comp, ctrlComp, [choice(lyA), choice(lyB)], []);

    sandbox.ensureNodeRegistered(node);

    var ctrl = sandbox.findCtrlLayerInComp(ctrlComp, "髪", 0);
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 0), "メガネ,*髪A", "未代表の集合には追加");
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 6), "*髪B,メガネ", "代表済みの集合は不変（二重表示の解消）");
  });

  it("制御はあるがマーカー皆無なら既定マーカーを補う", function () {
    var ctrlComp = h.makeComp("制御E", [h.makeLayer("[Emo] 眉", { markers: [] })], 30);
    var lyA = h.makeLayer("*眉普通");
    var comp = h.makeComp("眉", [lyA], 30);
    h.registerComps(sandbox, [ctrlComp, comp]);
    var node = makeNode(comp, ctrlComp, [choice(lyA)], []);

    sandbox.ensureNodeRegistered(node);
    var ctrl = sandbox.findCtrlLayerInComp(ctrlComp, "眉", 0);
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 0), "*眉普通");
  });
});

describe("buildStageNodes: シーンルートの無関係コンポ除外", function () {
  it("シーン直下は立ち絵関連（タグ/制御/式持ち）だけ辿る", function () {
    // セットアップ済みの立ち絵（emoSetup タグ）
    var yukari = h.makeComp("ゆかり", [h.makeLayer("*口あ")], 30);
    yukari.comment = "emoSetup\nemoCtrl=コンポ1";
    // 旧バージョンの立ち絵（タグ無しだが式で管理下）
    var akari = h.makeComp("あかり", [
      h.makeLayer("*口あ", {
        expression: sandbox.buildOpacityExpression("コンポ1", "あかり"),
      }),
    ], 30);
    // 無関係の背景コンポ
    var bg = h.makeComp("背景", [h.makeLayer("空"), h.makeLayer("山")], 30);
    var scene = h.makeComp("コンポ1", [
      h.makeFolderLayer(yukari),
      h.makeFolderLayer(akari),
      h.makeFolderLayer(bg),
      h.makeLayer("テロップ"), // 非フォルダの装飾（従来から除外）
    ], 30);
    h.registerComps(sandbox, [scene, yukari, akari, bg]);

    var nodes = sandbox.buildStageNodes(scene);
    var compNames = [];
    for (var i = 0; i < nodes.length; i++) compNames.push(nodes[i].comp.name);
    assert.ok(compNames.indexOf("ゆかり") >= 0, "タグ持ちの立ち絵は出る");
    assert.ok(compNames.indexOf("あかり") >= 0, "式で管理下の旧立ち絵も出る");
    assert.equal(compNames.indexOf("背景"), -1, "無関係コンポは出ない");
    // ルートノードの選択肢からも背景・テロップは除外されている
    var rootNode = nodes[0];
    var choiceNames = [];
    for (var c = 0; c < rootNode.optionalChoices.length; c++) {
      choiceNames.push(rootNode.optionalChoices[c].fullName);
    }
    assert.equal(choiceNames.indexOf("背景"), -1);
    assert.equal(choiceNames.indexOf("テロップ"), -1);
  });

  it("立ち絵ルート自身を選んだときは直下フォルダを全部辿る（従来どおり）", function () {
    var mouth = h.makeComp("口Z", [h.makeLayer("*口あ")], 30); // タグ無し・式無し
    var root = h.makeComp("ルートZ", [h.makeFolderLayer(mouth)], 30);
    root.comment = "emoSetup";
    h.registerComps(sandbox, [root, mouth]);

    var nodes = sandbox.buildStageNodes(root);
    var compNames = [];
    for (var i = 0; i < nodes.length; i++) compNames.push(nodes[i].comp.name);
    assert.ok(compNames.indexOf("口Z") >= 0, "未使用パーツも立ち絵ルート配下なら出る");
  });
});

describe("ensureCompRegisteredForApply（口パク/目パチ適用時の自動登録）", function () {
  it("既存の制御レイヤーから制御コンポを解決してグループ全体を登録する", function () {
    var ctrlComp = h.makeComp("制御X", [
      h.makeLayer("[Emo] 口", { markers: [{ time: 0, comment: "*口あ" }] }),
    ], 30);
    var lyA = h.makeLayer("*口あ");
    var lyI = h.makeLayer("*口い");
    lyI.enabled = false;
    var comp = h.makeComp("口", [lyA, lyI], 30);
    h.registerComps(sandbox, [ctrlComp, comp]);

    var count = sandbox.ensureCompRegisteredForApply(comp);
    assert.equal(count, 2, "グループの全選択肢が登録される");
    assert.ok(sandbox.isRegistered(lyA) && sandbox.isRegistered(lyI));
    // 制御は既存の [Emo] 口 を持つコンポに解決される
    assert.equal(h.plain(sandbox.parseEmoContext(lyA)).ctrlCompName, "制御X");
  });

  it("emoSetup/emoCtrl タグから制御コンポを解決する（セットアップ直後・未クリック）", function () {
    var sceneComp = h.makeComp("シーンY", [], 30);
    var lyA = h.makeLayer("*口あ");
    var mouthComp = h.makeComp("口Y", [lyA], 30);
    var flMouth = h.makeFolderLayer(mouthComp);
    var rootComp = h.makeComp("ルートY", [flMouth], 30);
    rootComp.comment = "emoSetup\nemoCtrl=シーンY";
    h.registerComps(sandbox, [rootComp, mouthComp, sceneComp]);

    var count = sandbox.ensureCompRegisteredForApply(mouthComp);
    assert.equal(count, 1);
    assert.ok(
      sandbox.findCtrlLayerInComp(sceneComp, "口Y", 0) !== null,
      "制御レイヤーは emoCtrl 指定のコンポに作られる",
    );
    assert.equal(h.plain(sandbox.parseEmoContext(lyA)).ctrlCompName, "シーンY");
  });

  it("制御が解決できなければ -1 を返して何もしない", function () {
    var lyA = h.makeLayer("*謎あ");
    var comp = h.makeComp("謎", [lyA], 30);
    h.registerComps(sandbox, [comp]);

    assert.equal(sandbox.ensureCompRegisteredForApply(comp), -1);
    assert.equal(sandbox.isRegistered(lyA), false);
  });
});

describe("augmentVisibleSetWithStatic（チェック表示の一致）", function () {
  it("未登録＋目ONの選択肢はマーカーに無くても表示中扱いになる", function () {
    var lyReg = h.makeLayer("*服A", {
      expression: sandbox.buildOpacityExpression("制御", "服"),
    });
    var lyKachu = h.makeLayer("カチューシャ"); // 未登録・目ON
    var lyOff = h.makeLayer("リボン");
    lyOff.enabled = false; // 未登録・目OFF
    var comp = h.makeComp("服2", [lyReg, lyKachu, lyOff], 30);
    var node = makeNode(comp, comp, [choice(lyReg)], [choice(lyKachu), choice(lyOff)]);

    var out = sandbox.augmentVisibleSetWithStatic(node, ["*服A"]);
    assert.deepEqual(h.plain(out), ["*服A", "カチューシャ"]);
  });

  it("登録済みレイヤーはマーカーの真実のまま（enabled では追加しない）", function () {
    var lyReg = h.makeLayer("*服A", {
      expression: sandbox.buildOpacityExpression("制御", "服"),
    });
    lyReg.enabled = true;
    var comp = h.makeComp("服3", [lyReg], 30);
    var node = makeNode(comp, comp, [choice(lyReg)], []);

    var out = sandbox.augmentVisibleSetWithStatic(node, []);
    assert.deepEqual(h.plain(out), []);
  });
});
