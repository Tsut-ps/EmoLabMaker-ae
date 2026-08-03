// ════════════════════════════════════════════════════════════════
// セットアップ（scanPsdCompTree / autoSetupPsd）のテスト
// ════════════════════════════════════════════════════════════════
// 新方式: セットアップ＝名前の正規化（全グループ・選択なし）＋使用中グループの
// 式更新。式の登録は立ち絵タブのクリック時（ensureCtrlLayerForNode）。
// AE の実挙動「コンポをリネームすると参照フォルダレイヤー名が追従する」を
// makeFolderLayer で再現し、リネーム移行（マーカー・表情セット）を検証する。
var nodeTest = require("node:test");
var describe = nodeTest.describe;
var it = nodeTest.it;
var assert = require("node:assert/strict");
var h = require("./helpers");

var sandbox = h.loadSandbox();

// ユーザー報告のツリー相当:
//   ゆかり(root) > 目 > { *開き目 > {*通常, *ジト}, *簡易 > {*開1, *閉1} }
function buildProject() {
  var lyTsujo = h.makeLayer("*通常"); // PSD で表示状態
  var lyJito = h.makeLayer("*ジト");
  lyJito.enabled = false;
  var openComp = h.makeComp("*開き目", [lyTsujo, lyJito], 30);

  var lyOpen1 = h.makeLayer("*開1");
  var lyClose1 = h.makeLayer("*閉1");
  lyClose1.enabled = false;
  var kaniComp = h.makeComp("*簡易", [lyOpen1, lyClose1], 30);

  var flOpen = h.makeFolderLayer(openComp); // 表示状態
  var flKani = h.makeFolderLayer(kaniComp);
  flKani.enabled = false;
  var eyeComp = h.makeComp("目", [flOpen, flKani], 30);

  var flEye = h.makeFolderLayer(eyeComp);
  var rootComp = h.makeComp("ゆかり", [flEye], 30);

  h.registerComps(sandbox, [rootComp, eyeComp, openComp, kaniComp]);
  return {
    root: rootComp,
    eye: eyeComp,
    open: openComp,
    kani: kaniComp,
    flOpen: flOpen,
    flKani: flKani,
    lyTsujo: lyTsujo,
    lyJito: lyJito,
  };
}

describe("hasDuplicateCompName", function () {
  it("同名コンポが複数ある場合だけ true を返す", function () {
    var rootA = h.makeComp("立ち絵", [], 30);
    var rootB = h.makeComp("立ち絵", [], 30);
    var ctrl = h.makeComp("制御", [], 30);
    h.registerComps(sandbox, [rootA, rootB, ctrl]);

    assert.equal(sandbox.hasDuplicateCompName("立ち絵"), true);
    assert.equal(sandbox.hasDuplicateCompName("制御"), false);
    assert.equal(sandbox.hasDuplicateCompName("存在しない"), false);
  });
});

describe("scanPsdCompTree", function () {
  it("子グループが親より先に並ぶ（リネーム順序の前提）", function () {
    var p = buildProject();
    var groups = sandbox.scanPsdCompTree(p.root);
    var names = [];
    for (var i = 0; i < groups.length; i++) names.push(groups[i].comp.name);
    assert.ok(names.indexOf("*開き目") < names.indexOf("目"), JSON.stringify(names));
    assert.ok(names.indexOf("*簡易") < names.indexOf("目"), JSON.stringify(names));
    assert.ok(names.indexOf("目") < names.indexOf("ゆかり"), JSON.stringify(names));
  });
});

describe("autoSetupPsd（新方式: 名前の正規化＋使用中のみ更新）", function () {
  it("全コンポを一括で正規化し、未使用グループには式を張らない", function () {
    var p = buildProject();
    var report = sandbox.autoSetupPsd(p.root, p.root, sandbox.scanPsdCompTree(p.root));

    // 名前は全件正規化（選択に依存しない）
    assert.equal(p.eye.name, "ゆかり_目");
    assert.equal(p.open.name, "ゆかり_*開き目");
    assert.equal(p.kani.name, "ゆかり_*簡易");
    // フォルダレイヤー名はソース名に追従
    assert.equal(p.flOpen.name, "ゆかり_*開き目");
    assert.equal(p.flKani.name, "ゆかり_*簡易");

    // 式は 1 本も張られない（未使用＝パス）
    assert.equal(sandbox.isRegistered(p.flOpen), false);
    assert.equal(sandbox.isRegistered(p.lyTsujo), false);
    assert.equal(report.groupCount, 0, "更新グループなし");
    assert.ok(report.passed >= 3, "未使用グループがパスとして数えられる: " + report.passed);
    assert.equal(sandbox.findCtrlLayerInComp(p.root, "ゆかり_目", 0), null, "制御ヌルも作らない");
  });

  it("再実行しても変化しない（冪等）", function () {
    var p = buildProject();
    sandbox.autoSetupPsd(p.root, p.root, sandbox.scanPsdCompTree(p.root));
    var report2 = sandbox.autoSetupPsd(p.root, p.root, sandbox.scanPsdCompTree(p.root));
    assert.deepEqual(h.plain(report2.renamedComps), [], "2 回目のリネームなし");
    assert.equal(p.eye.name, "ゆかり_目");
  });

  it("クリック先行 → 後から全体セットアップで参照が全て移行される", function () {
    var p = buildProject();

    // 1. セットアップ前に立ち絵タブで「目」グループを使い始める（v2.14.1 の挙動）
    var node = {
      comp: p.eye,
      ctrlComp: p.root,
      isRoot: false,
      radioChoices: [
        { fullName: p.flOpen.name, label: "開き目", layer: p.flOpen, flips: [] },
        { fullName: p.flKani.name, label: "簡易", layer: p.flKani, flips: [] },
      ],
      optionalChoices: [],
      forcedChoices: [],
    };
    sandbox.ensureNodeRegistered(node);
    // 無 prefix の名前で制御ヌルとマーカーが作られている
    var ctrl = sandbox.findCtrlLayerInComp(p.root, "目", 0);
    assert.ok(ctrl !== null);
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 0), "*開き目", "既定マーカー");
    // 2. ユーザーが時刻 2 で「簡易」を選ぶ
    assert.equal(sandbox.writeMarkerNameAtTime(p.root, "目", 2, "*簡易"), true);
    // 3. 表情セットも保存されている想定（移行はプロジェクト全体走査なので
    //    制御コンポ以外に置かれていても対象になることを兼ねて別コンポに置く）
    var setLayer = h.makeLayer("[EmoSet] お気に入り");
    setLayer.comment = "目=*簡易";
    var setComp = h.makeComp("セット置き場", [setLayer], 30);
    h.registerComps(sandbox, [p.root, p.eye, p.open, p.kani, setComp]);

    // 4. 全体セットアップ
    sandbox.autoSetupPsd(p.root, p.root, sandbox.scanPsdCompTree(p.root));

    // コンポは正規化され、制御ヌルは新名でマーカーを保持したまま引き継がれる
    assert.equal(p.eye.name, "ゆかり_目");
    assert.equal(sandbox.findCtrlLayerInComp(p.root, "目", 0), null, "旧名の制御ヌルは残らない");
    var ctrl2 = sandbox.findCtrlLayerInComp(p.root, "ゆかり_目", 0);
    assert.ok(ctrl2 !== null, "新名の制御ヌルに引き継がれる");

    // マーカー内容が追従リネーム後のレイヤー名へ移行されている
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl2, 0), "ゆかり_*開き目");
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl2, 2), "ゆかり_*簡易");

    // 表情セットも移行されている（対象コンポ名・集合の両方）
    assert.equal(setLayer.comment, "ゆかり_目=ゆかり_*簡易");

    // 使用中グループ（目）の式は新名で更新されている
    var ctx = sandbox.parseEmoContext(p.flKani);
    assert.equal(h.plain(ctx).targetCompName, "ゆかり_目");

    // 挙動の同値: 時刻 1 は開き目、時刻 3 は簡易が表示される
    var comps = { ゆかり: p.root };
    assert.equal(
      h.makeExprEvaluator(p.flOpen.transform.opacity.expression, comps, p.flOpen.name)(1),
      100,
    );
    assert.equal(
      h.makeExprEvaluator(p.flKani.transform.opacity.expression, comps, p.flKani.name)(1),
      0,
    );
    assert.equal(
      h.makeExprEvaluator(p.flKani.transform.opacity.expression, comps, p.flKani.name)(3),
      100,
    );
    assert.equal(
      h.makeExprEvaluator(p.flOpen.transform.opacity.expression, comps, p.flOpen.name)(3),
      0,
    );
  });

  it("セットアップ済みタグをルートコンポに書く（冪等・立ち絵タブの表示ゲート）", function () {
    var p = buildProject();
    assert.equal(sandbox.hasSetupTag(p.root), false, "セットアップ前はタグ無し");
    sandbox.autoSetupPsd(p.root, p.root, sandbox.scanPsdCompTree(p.root));
    assert.equal(sandbox.hasSetupTag(p.root), true);
    var c1 = p.root.comment;
    sandbox.autoSetupPsd(p.root, p.root, sandbox.scanPsdCompTree(p.root));
    assert.equal(p.root.comment, c1, "再実行でタグが重複しない");
  });

  it("制御コンポの指定をルートの comment タグに記録し、読み戻せる", function () {
    var p = buildProject();
    var ctrlComp = h.makeComp("シーン 1", [], 30); // 空白入りの名前
    h.registerComps(sandbox, [p.root, p.eye, p.open, p.kani, ctrlComp]);
    p.root.comment = "emoFlip:flipx"; // 既存タグと共存できること

    sandbox.autoSetupPsd(p.root, ctrlComp, sandbox.scanPsdCompTree(p.root));

    assert.equal(sandbox.readCtrlCompTag(p.root), "シーン 1");
    assert.ok(String(p.root.comment).indexOf("emoFlip:flipx") >= 0, "既存タグを保持");
    assert.ok(sandbox.hasSetupTag(p.root));

    // 制御を変えて再セットアップ → 指定が置き換わる（重複しない）
    var ctrl2 = h.makeComp("シーン 2", [], 30);
    h.registerComps(sandbox, [p.root, p.eye, p.open, p.kani, ctrlComp, ctrl2]);
    sandbox.autoSetupPsd(p.root, ctrl2, sandbox.scanPsdCompTree(p.root));
    assert.equal(sandbox.readCtrlCompTag(p.root), "シーン 2");
    assert.equal(String(p.root.comment).match(/emoCtrl=/g).length, 1, "emoCtrl 行は 1 つだけ");
  });

  it("強制(!)の反転ペアは base 表示 / flip 非表示に正規化される", function () {
    var lyBody = h.makeLayer("!身体");
    var lyBodyFlip = h.makeLayer("!身体:flipx"); // 両方 ON の事故状態
    var bodyComp = h.makeComp("体", [lyBody, lyBodyFlip], 30);
    var flBody = h.makeFolderLayer(bodyComp);
    var rootComp = h.makeComp("あかり", [flBody], 30);
    h.registerComps(sandbox, [rootComp, bodyComp]);

    sandbox.autoSetupPsd(rootComp, rootComp, sandbox.scanPsdCompTree(rootComp));

    assert.equal(lyBody.enabled, true, "base は強制表示");
    assert.equal(lyBodyFlip.enabled, false, "flip は非表示に正規化");
  });

  it("制御コンポの移行: 再セットアップで制御レイヤーがマーカーごと引っ越す", function () {
    var p = buildProject();
    var ctrl2 = h.makeComp("シーン2", [], 30);
    h.registerComps(sandbox, [p.root, p.eye, p.open, p.kani, ctrl2]);

    // 目グループを使用開始（制御=ルート「ゆかり」）し、マーカーも打つ
    var node = {
      comp: p.eye,
      ctrlComp: p.root,
      isRoot: false,
      radioChoices: [
        { fullName: p.flOpen.name, label: "開き目", layer: p.flOpen, flips: [] },
        { fullName: p.flKani.name, label: "簡易", layer: p.flKani, flips: [] },
      ],
      optionalChoices: [],
      forcedChoices: [],
    };
    sandbox.ensureNodeRegistered(node);
    sandbox.writeMarkerNameAtTime(p.root, "目", 2, "*簡易");
    // 開き目グループも使用開始（複数グループの移行と整列を検証する）
    sandbox.ensureNodeRegistered({
      comp: p.open,
      ctrlComp: p.root,
      isRoot: false,
      radioChoices: [
        { fullName: p.lyTsujo.name, label: "通常", layer: p.lyTsujo, flips: [] },
        { fullName: p.lyJito.name, label: "ジト", layer: p.lyJito, flips: [] },
      ],
      optionalChoices: [],
      forcedChoices: [],
    });
    // 目パチ合成式のレイヤー（保持対象）。openNames に旧制御名「ゆかり」を
    // 部分文字列として含む名前を入れ、置換の巻き添えが無いことも検証する
    var lyBlink = h.makeLayer("*目パチ層", {
      expression: sandbox.buildBlinkExpression(
        { interval: 1.0, speed: 0.07, hold: 0.035, jitter: 0.4 },
        "open",
        true,
        "ゆかり_*開き目",
        { ctrlCompName: "ゆかり", targetCompName: "目" },
      ),
    });
    p.eye._insertTop(lyBlink);
    // 口パク合成式のレイヤー（保持対象）。旧制御「ゆかり」が音素コンポを
    // 兼ねているケース＝制御参照だけ引っ越し、音素参照は残ることを検証する
    p.root._insertTop(
      h.makeLayer("[Lab] voice", {
        inPoint: 0,
        outPoint: 10,
        markers: [{ time: 1, comment: "a" }],
      }),
    );
    var lyMouth = h.makeLayer("*口パク層", {
      expression: sandbox.buildLabMappedExpression(
        "ゆかり",
        "a",
        "a,i,u,e,o,N",
        false,
        { ctrlCompName: "ゆかり", targetCompName: "目" },
        "",
      ),
    });
    p.eye._insertTop(lyMouth);

    // 制御を「シーン2」に変えて全体セットアップ
    sandbox.__confirmCalls.length = 0;
    sandbox.__confirmResult = true;
    var report = sandbox.autoSetupPsd(p.root, ctrl2, sandbox.scanPsdCompTree(p.root));

    assert.equal(sandbox.__confirmCalls.length, 1, "移行の確認が出る");
    assert.equal(report.ctrlMigrated, 2);
    assert.equal(sandbox.findCtrlLayerInComp(p.root, "ゆかり_目", 0), null, "旧側から消える");
    var ctrl = sandbox.findCtrlLayerInComp(ctrl2, "ゆかり_目", 0);
    assert.ok(ctrl !== null, "新側へ移動");
    // 移行した制御ヌルは作成順に整列（交互配置にならない）
    assert.equal(ctrl2.layer(1).name, "[Emo] ゆかり_*開き目");
    assert.equal(ctrl2.layer(2).name, "[Emo] ゆかり_目");
    // 開き目グループのマーカーも保持（*通常 はアートレイヤー名なので不変）
    var ctrlOpen = sandbox.findCtrlLayerInComp(ctrl2, "ゆかり_*開き目", 0);
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrlOpen, 0), "*通常");
    // マーカーはリネーム移行込みで保持
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 0), "ゆかり_*開き目");
    assert.equal(sandbox.getCurrentMarkerNameAt(ctrl, 2), "ゆかり_*簡易");
    // 表情式は新制御を参照して再登録
    var ctx = h.plain(sandbox.parseEmoContext(p.flOpen));
    assert.equal(ctx.ctrlCompName, "シーン2");
    assert.equal(ctx.targetCompName, "ゆかり_目");
    // 合成式は保持されつつ参照だけ切替。openNames は巻き添えを受けない
    var bctx = sandbox.parseBlinkContext(lyBlink);
    assert.equal(h.plain(bctx.emoCtx).ctrlCompName, "シーン2");
    assert.deepEqual(h.plain(bctx.openNames), ["ゆかり_*開き目"], "レイヤー名リテラルは不変");
    var lctx = h.plain(sandbox.parseLabMapContext(lyMouth));
    assert.equal(lctx.phonemeCompName, "ゆかり", "音素コンポ参照は旧 [Lab] 側のまま");
    assert.equal(lctx.emoCtx.ctrlCompName, "シーン2", "制御コンポ参照だけ新制御へ移行");
    assert.equal(lctx.emoCtx.targetCompName, "ゆかり_目");
    assert.equal(
      h.makeExprEvaluator(
        lyMouth.transform.opacity.expression,
        { ゆかり: p.root, シーン2: ctrl2 },
        lyMouth.name,
      )(1),
      100,
      "旧 [Lab] コンポの音素を読んで口パクが動く",
    );
    // 挙動: 時刻 3 は簡易が表示
    assert.equal(
      h.makeExprEvaluator(p.flKani.transform.opacity.expression, { シーン2: ctrl2 }, p.flKani.name)(3),
      100,
    );
  });

  it("制御コンポの移行: キャンセルすると何も動かさない", function () {
    var p = buildProject();
    var ctrl2 = h.makeComp("シーン3", [], 30);
    h.registerComps(sandbox, [p.root, p.eye, p.open, p.kani, ctrl2]);
    var node = {
      comp: p.eye,
      ctrlComp: p.root,
      isRoot: false,
      radioChoices: [
        { fullName: p.flOpen.name, label: "開き目", layer: p.flOpen, flips: [] },
      ],
      optionalChoices: [],
      forcedChoices: [],
    };
    sandbox.ensureNodeRegistered(node);
    var rootCommentBefore = p.root.comment;
    var eyeNameBefore = p.eye.name;
    var expressionBefore = p.flOpen.transform.opacity.expression;

    sandbox.__confirmResult = false; // キャンセル
    var report = sandbox.autoSetupPsd(p.root, ctrl2, sandbox.scanPsdCompTree(p.root));
    sandbox.__confirmResult = true; // 後続テストへ戻す

    assert.equal(report, null, "セットアップ全体がキャンセルされる");
    assert.equal(p.root.comment, rootCommentBefore, "セットアップタグを変更しない");
    assert.equal(p.eye.name, eyeNameBefore, "コンポ名を変更しない");
    assert.ok(
      sandbox.findCtrlLayerInComp(p.root, eyeNameBefore, 0) !== null,
      "制御レイヤーは旧側に残る",
    );
    assert.equal(p.flOpen.transform.opacity.expression, expressionBefore, "式も従来のまま");
  });

  it("replaceSetToken: 完全一致トークンのみ置換する", function () {
    assert.equal(sandbox.replaceSetToken("*開1,*開12,xx*開1", "*開1", "新"), "新,*開12,xx*開1");
    assert.equal(sandbox.replaceSetToken("*開12", "*開1", "新"), null, "部分一致は置換しない");
  });
});
