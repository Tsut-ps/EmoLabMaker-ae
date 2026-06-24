// ════════════════════════════════════════════════════════════════
//
//  タブ「PSD」: PSD セットアップ (PSDToolKit互換)
//
// ════════════════════════════════════════════════════════════════
// PSD の読み込み自体は AE 標準のインポートに任せる（バグ防止のため
// スクリプトからは importFile しない）。読み込み済みのコンポを走査し、
// PSDToolKit の命名規則 (* = 排他 / ! = 強制表示 / :flipx = 反転) を
// 解釈して表情切替をセットアップする。再実行しても壊れない（冪等）

// ══════════════════════════════════════════════════════════════════
// タブ「PSD」UI
// ══════════════════════════════════════════════════════════════════

var psdGuide = tabPsd.add("group");
psdGuide.orientation = "column";
psdGuide.alignChildren = ["fill", "top"];
psdGuide.spacing = 2;
psdGuide.add(
  "statictext",
  undefined,
  "PSD は AE 標準の読み込みで追加してください:",
);
psdGuide.add(
  "statictext",
  undefined,
  "ファイル > 読み込み > 「コンポジション - レイヤーサイズを維持」推奨",
);

function addPsdCompRow(labelText) {
  var row = tabPsd.add("group");
  row.orientation = "row";
  row.alignment = ["fill", "top"];
  row.alignChildren = ["left", "center"];
  row.spacing = 6;

  var lbl = row.add("statictext", undefined, labelText);
  lbl.preferredSize = [LABEL_WIDTH, BUTTON_HEIGHT];

  var dropdown = row.add("dropdownlist", undefined, []);
  dropdown.alignment = ["fill", "center"];
  dropdown.minimumSize = [DROPDOWN_MIN_W, BUTTON_HEIGHT];
  dropdown.preferredSize.height = BUTTON_HEIGHT;

  return { row: row, dropdown: dropdown };
}

var psdRootRow = addPsdCompRow("ルート");
psdRootRow.dropdown.helpTip =
  "PSD から読み込んだ立ち絵ルートコンポ（プロジェクト直下の PSD 由来/設定済みコンポのみ表示）";

var psdRefreshBtn = psdRootRow.row.add("button", undefined, "↺");
psdRefreshBtn.preferredSize = [24, BUTTON_HEIGHT];
psdRefreshBtn.helpTip = "コンポ一覧を再取得";

var psdCtrlRow = addPsdCompRow("制御");
psdCtrlRow.dropdown.helpTip =
  "表情マーカーを書き込むコンポ（全体設定）。通常はルートと同じでOK。立ち絵ルートより下の部品コンポ（口・目など）やレイヤーフォルダ内は候補に出ません";

var psdSetupBtn = tabPsd.add(
  "button",
  undefined,
  "解析してセットアップ / 更新",
);
psdSetupBtn.alignment = ["fill", "top"];
psdSetupBtn.preferredSize.height = BUTTON_HEIGHT;
psdSetupBtn.helpTip =
  "PSDToolKit の命名規則 (* = 排他 / ! = 強制表示 / :flipx = 反転ペア) を解釈して表情切替を自動セットアップ。再実行で更新";

// ── レイヤー名 prefix ショートカット（セットアップ前の下準備）(#F) ──
var psdPrefixPanel = tabPsd.add("panel", undefined, "命名ショートカット");
psdPrefixPanel.orientation = "column";
psdPrefixPanel.alignChildren = ["fill", "top"];
psdPrefixPanel.alignment = ["fill", "top"];
psdPrefixPanel.margins = 8;
psdPrefixPanel.spacing = 4;
var psdPrefixHint = psdPrefixPanel.add(
  "statictext",
  undefined,
  "アクティブコンポで選択中のレイヤー名に * / ! を付与します（付与後は再セットアップ）",
);
psdPrefixHint.alignment = ["fill", "top"];
var psdPrefixRow = psdPrefixPanel.add("group");
psdPrefixRow.orientation = "row";
psdPrefixRow.alignChildren = ["left", "center"];
psdPrefixRow.spacing = 5;
// 3 ボタンは同じ固定幅・同じ高さで揃える（一番長い「* 排他(ラジオ)」が収まる幅）
var PREFIX_BTN_W = 116;
var psdAddStarBtn = psdPrefixRow.add("button", undefined, "* 排他(ラジオ)");
psdAddStarBtn.preferredSize = [PREFIX_BTN_W, BUTTON_HEIGHT];
psdAddStarBtn.helpTip =
  "選択レイヤーに * を付与（兄弟内で排他＝ラジオ選択）。既存の * / ! は置換";
var psdAddBangBtn = psdPrefixRow.add("button", undefined, "! 強制表示");
psdAddBangBtn.preferredSize = [PREFIX_BTN_W, BUTTON_HEIGHT];
psdAddBangBtn.helpTip =
  "選択レイヤーに ! を付与（常に表示）。既存の * / ! は置換";
var psdStripBtn = psdPrefixRow.add("button", undefined, "prefix除去");
psdStripBtn.preferredSize = [PREFIX_BTN_W, BUTTON_HEIGHT];
psdStripBtn.helpTip = "選択レイヤーの先頭の * / ! を除去（無印＝任意指定に）";

// 選択レイヤーの先頭 prefix を mode("*"/"!"/"") に付け替える
function applyPsdPrefix(mode) {
  var comp = getActiveComp();
  if (!comp || comp.selectedLayers.length === 0) {
    alert("名前を変更するレイヤーを選択してください。");
    return;
  }
  var count = 0;
  beginUndo("emo2layer: レイヤー名 prefix 付与");
  try {
    for (var i = 0; i < comp.selectedLayers.length; i++) {
      var L = comp.selectedLayers[i];
      var nm = L.name;
      // 先頭の * / ! をすべて剥がす（:flip サフィックスは保持）
      while (nm.length > 0 && (nm.charAt(0) === "*" || nm.charAt(0) === "!")) {
        nm = nm.substring(1);
      }
      // ネストした三項演算子は ExtendScript で誤評価され得るので if/else で明示する
      var newName;
      if (mode === "*") {
        newName = "*" + nm;
      } else if (mode === "!") {
        newName = "!" + nm;
      } else {
        newName = nm;
      }
      if (newName !== L.name) {
        try {
          L.name = newName;
          count++;
        } catch (eN) {}
      }
    }
  } finally {
    endUndo();
  }
  psdStatusText.text =
    count +
    " レイヤーの名前を変更しました。表情切替へ反映するには「解析してセットアップ / 更新」を実行してください。";
}
psdAddStarBtn.onClick = function () {
  applyPsdPrefix("*");
};
psdAddBangBtn.onClick = function () {
  applyPsdPrefix("!");
};
psdStripBtn.onClick = function () {
  applyPsdPrefix("");
};

// ══════════════════════════════════════════════════════════════════
// 尺を伸ばす（選択レイヤーとその参照コンポを引き伸ばす）
// ══════════════════════════════════════════════════════════════════

var psdExtendPanel = tabPsd.add("panel", undefined, "尺を伸ばす（選択）");
psdExtendPanel.orientation = "column";
psdExtendPanel.alignChildren = ["fill", "top"];
psdExtendPanel.alignment = ["fill", "top"];
psdExtendPanel.margins = 8;
psdExtendPanel.spacing = 4;
var psdExtendHint = psdExtendPanel.add(
  "statictext",
  undefined,
  "選択したレイヤーと、その参照コンポ・配下の尺を指定の長さまで伸ばします（縮めません／未選択時は何もしません）",
);
psdExtendHint.alignment = ["fill", "top"];
var psdExtendRow = psdExtendPanel.add("group");
psdExtendRow.orientation = "row";
psdExtendRow.alignChildren = ["left", "center"];
psdExtendRow.spacing = 5;
psdExtendRow.add("statictext", undefined, "長さ(秒)");
var psdExtendInput = psdExtendRow.add("edittext", undefined, "");
psdExtendInput.preferredSize = [70, BUTTON_HEIGHT];
psdExtendInput.helpTip = "伸ばしたい長さ（秒）。既定はアクティブなコンポの長さ";
var psdExtendActiveBtn = psdExtendRow.add("button", undefined, "アクティブの長さ");
psdExtendActiveBtn.preferredSize = [104, BUTTON_HEIGHT];
psdExtendActiveBtn.helpTip = "アクティブなコンポの長さを入力欄に入れる";
var psdExtendBtn = psdExtendRow.add("button", undefined, "適用");
psdExtendBtn.preferredSize = [56, BUTTON_HEIGHT];
psdExtendBtn.helpTip =
  "選択レイヤーの outPoint と、参照先コンポ・配下の尺をこの長さまで伸ばす（未選択時は何もしない）";

// 起動時にアクティブコンポの長さを既定値として入れておく
(function () {
  var ac = getActiveComp();
  if (ac && ac.duration) {
    psdExtendInput.text = String(Math.round(ac.duration * 1000) / 1000);
  }
})();

psdExtendActiveBtn.onClick = function () {
  var ac = getActiveComp();
  if (!ac) {
    alert("アクティブなコンポジションがありません。");
    return;
  }
  psdExtendInput.text = String(Math.round(ac.duration * 1000) / 1000);
};

psdExtendBtn.onClick = function () {
  var comp = getActiveComp();
  if (!comp) {
    alert("レイヤーを選択しているコンポをアクティブにしてください。");
    return;
  }
  var sel = comp.selectedLayers;
  if (!sel || sel.length === 0) {
    // 未選択時は何もしない（誤って全体を伸ばすのを防ぐ）
    alert("尺を伸ばすレイヤーを選択してください。");
    return;
  }
  var sec = parseFloat(psdExtendInput.text);
  if (!(sec > 0)) {
    alert("長さ(秒)に正の数を入力してください。");
    return;
  }
  var res;
  beginUndo("EmoLabMaker: 選択レイヤー/コンポの尺を伸ばす");
  try {
    res = extendSelectedLayers(sel, sec);
  } finally {
    endUndo();
  }
  psdStatusText.text =
    "尺を伸ばしました（" +
    sec +
    "秒）: レイヤー " +
    res.layers +
    " ・ コンポ " +
    res.comps +
    "（" +
    comp.name +
    "）。";
};

// ══════════════════════════════════════════════════════════════════
// 目パチ (自動まばたき)
// ══════════════════════════════════════════════════════════════════

var blinkPanel = tabBlink.add("panel", undefined, "目パチ (自動まばたき)");
blinkPanel.orientation = "column";
blinkPanel.alignChildren = ["fill", "top"];
blinkPanel.alignment = ["fill", "top"];
blinkPanel.spacing = 4;
blinkPanel.margins = 8;

var BLINK_ROLES = [
  { key: "open", label: "開き目" },
  { key: "mid", label: "中間(任意)" },
  { key: "closed", label: "閉じ目" },
];

var blinkRows = [];
for (var brIdx = 0; brIdx < BLINK_ROLES.length; brIdx++) {
  (function (roleInfo) {
    var row = blinkPanel.add("group");
    row.orientation = "row";
    row.alignment = ["fill", "top"];
    row.alignChildren = ["left", "center"];
    row.spacing = 4;

    var lbl = row.add("statictext", undefined, roleInfo.label);
    lbl.preferredSize = [72, BUTTON_HEIGHT];

    var assignBtn = row.add("button", undefined, "割当");
    assignBtn.preferredSize = [48, BUTTON_HEIGHT];
    assignBtn.helpTip =
      "アクティブコンポの選択レイヤーを「" + roleInfo.label + "」に割当";

    var clearBtn = row.add("button", undefined, "×");
    clearBtn.preferredSize = [24, BUTTON_HEIGHT];

    var namesText = row.add("statictext", undefined, "（未割当）");
    namesText.alignment = ["fill", "center"];

    var rowData = {
      role: roleInfo.key,
      namesText: namesText,
      layers: [],
    };
    blinkRows.push(rowData);

    assignBtn.onClick = function () {
      var comp = getActiveComp();
      if (!comp || comp.selectedLayers.length === 0) {
        alert("目のレイヤーを選択してください");
        return;
      }
      rowData.layers = [];
      for (var i = 0; i < comp.selectedLayers.length; i++) {
        rowData.layers.push(comp.selectedLayers[i]);
      }
      namesText.text = describeAssignedLayers(rowData.layers);
      namesText.helpTip = namesText.text;
    };

    clearBtn.onClick = function () {
      rowData.layers = [];
      namesText.text = "（未割当）";
      namesText.helpTip = "";
    };
  })(BLINK_ROLES[brIdx]);
}

var blinkParamRow = blinkPanel.add("group");
blinkParamRow.orientation = "row";
blinkParamRow.alignment = ["fill", "top"];
blinkParamRow.alignChildren = ["left", "center"];
blinkParamRow.spacing = 4;

blinkParamRow.add("statictext", undefined, "間隔(秒)");
var blinkIntervalInput = blinkParamRow.add("edittext", undefined, "4.0");
blinkIntervalInput.preferredSize = [44, BUTTON_HEIGHT];
blinkIntervalInput.helpTip = "まばたきの平均間隔";

blinkParamRow.add("statictext", undefined, "速度(秒)");
var blinkSpeedInput = blinkParamRow.add("edittext", undefined, "0.07");
blinkSpeedInput.preferredSize = [44, BUTTON_HEIGHT];
blinkSpeedInput.helpTip = "閉じる/開くのそれぞれにかかる時間";

blinkParamRow.add("statictext", undefined, "ランダム%");
var blinkJitterInput = blinkParamRow.add("edittext", undefined, "40");
blinkJitterInput.preferredSize = [36, BUTTON_HEIGHT];
blinkJitterInput.helpTip = "間隔のばらつき (0-90)";

var blinkBtnRow = blinkPanel.add("group");
blinkBtnRow.orientation = "row";
blinkBtnRow.alignment = ["fill", "top"];
blinkBtnRow.alignChildren = ["fill", "center"];
blinkBtnRow.spacing = 5;

var blinkApplyBtn = blinkBtnRow.add("button", undefined, "目パチ設定");
blinkApplyBtn.preferredSize.height = BUTTON_HEIGHT;
blinkApplyBtn.helpTip =
  "割当レイヤーに自動まばたきを設定（表情登録済みなら開き目表情中のみまばたき）";
var blinkRemoveBtn = blinkBtnRow.add("button", undefined, "解除(コンポ)");
blinkRemoveBtn.preferredSize.height = BUTTON_HEIGHT;
blinkRemoveBtn.helpTip =
  "アクティブコンポ内の目パチを一括解除（開き/中間/閉じをまとめて。表情登録済みなら表情切替に戻す）";
var blinkRemoveListBtn = blinkBtnRow.add("button", undefined, "解除(一覧)");
blinkRemoveListBtn.preferredSize.height = BUTTON_HEIGHT;
blinkRemoveListBtn.helpTip =
  "プロジェクト内の目パチ設定済みコンポを一覧から選んで一括解除（レイヤー選択不要）";

blinkApplyBtn.onClick = function () {
  var openRow = blinkRows[0];
  var midRow = blinkRows[1];
  var closedRow = blinkRows[2];

  if (openRow.layers.length === 0 || closedRow.layers.length === 0) {
    alert("「開き目」と「閉じ目」の割当が必要です。");
    return;
  }

  var interval = parseFloat(blinkIntervalInput.text);
  var speed = parseFloat(blinkSpeedInput.text);
  var jitterPct = parseFloat(blinkJitterInput.text);
  if (isNaN(interval) || interval < 0.5) interval = 4.0;
  if (isNaN(speed) || speed < 0.01) speed = 0.07;
  if (isNaN(jitterPct) || jitterPct < 0) jitterPct = 40;
  if (jitterPct > 90) jitterPct = 90;

  var params = {
    interval: interval,
    speed: speed,
    hold: speed * 0.5,
    jitter: jitterPct / 100,
  };
  var hasMid = midRow.layers.length > 0;

  // 開き目レイヤー名（このマーカー表情のときだけまばたきする）
  var openNames = [];
  for (var o = openRow.layers.length - 1; o >= 0; o--) {
    try {
      openNames.unshift(openRow.layers[o].name);
    } catch (e) {
      openRow.layers.splice(o, 1);
    }
  }
  var openNamesCsv = openNames.join(",");

  var appliedCount = 0;
  var emoLinkedCount = 0;
  var skippedCount = 0;

  beginUndo("EmoLabMaker: 目パチ設定");
  try {
    for (var r = 0; r < blinkRows.length; r++) {
      var rowData = blinkRows[r];
      for (var i = 0; i < rowData.layers.length; i++) {
        var layer = rowData.layers[i];
        try {
          if (hasOpacitySignature(layer, LAB_MAP_SIGNATURE)) {
            // 口パク設定済みのレイヤーには適用しない（不透明度の競合）
            skippedCount++;
            continue;
          }
          var emoCtx = parseEmoContext(layer);
          layer.transform.opacity.expression = buildBlinkExpression(
            params,
            rowData.role,
            hasMid,
            openNamesCsv,
            emoCtx,
          );
          layer.enabled = true;
          appliedCount++;
          if (emoCtx) emoLinkedCount++;
        } catch (err) {
          skippedCount++;
        }
      }
    }
  } finally {
    endUndo();
  }

  var message = "完了: " + appliedCount + " レイヤーに目パチを設定しました。";
  if (emoLinkedCount > 0) {
    message +=
      "\n表情切替と共存: " +
      emoLinkedCount +
      " レイヤー（開き目表情中のみまばたき）";
  }
  if (skippedCount > 0) {
    message +=
      "\nスキップ: " +
      skippedCount +
      " レイヤー（口パク設定済み、または削除済み）";
  }
  alert(message);
};

blinkRemoveBtn.onClick = function () {
  var comp = getActiveComp();
  if (!comp) {
    alert(
      "目パチを解除するコンポをアクティブにしてください（または「解除(一覧)」を使用）",
    );
    return;
  }
  // コンポグループ単位で解除: 選択レイヤーだけでなく、アクティブコンポ内の
  // 目パチレイヤーをすべて解除する（開きだけ解除されて中間/閉じが残る不整合を防ぐ）(#E)
  if (!hasBlinkLayer(comp)) {
    alert("このコンポには目パチ設定済みのレイヤーがありません。");
    return;
  }
  var res;
  beginUndo("EmoLabMaker: 目パチ解除（コンポ）");
  try {
    res = removeBlinkFromComp(comp);
  } finally {
    endUndo();
  }

  var message =
    "「" +
    comp.name +
    "」の目パチを解除しました（" +
    res.removed +
    " レイヤー）。";
  if (res.restored > 0) {
    message += "\nうち " + res.restored + " レイヤーは表情切替に戻しました。";
  }
  alert(message);
};

// 一覧から目パチを解除（コンポグループ単位・どこからでも）(#E)
blinkRemoveListBtn.onClick = function () {
  var groups = findBlinkComps();
  if (groups.length === 0) {
    alert("目パチ設定済みのレイヤーが見つかりませんでした。");
    return;
  }
  var dlg = new Window("dialog", "目パチ解除（コンポ単位で選択）");
  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];
  dlg.margins = 12;
  dlg.spacing = 4;
  dlg.add(
    "statictext",
    undefined,
    "解除するコンポを選択（そのコンポ内の目パチを一括解除）:",
  );

  var listGrp = dlg.add("group");
  listGrp.orientation = "column";
  listGrp.alignChildren = ["fill", "top"];
  listGrp.spacing = 1;
  var checks = [];
  for (var i = 0; i < groups.length; i++) {
    var cb = listGrp.add(
      "checkbox",
      undefined,
      groups[i].comp.name + "（" + groups[i].layers.length + " レイヤー）",
    );
    cb.value = true;
    var tipNames = [];
    for (var t = 0; t < groups[i].layers.length; t++) {
      try {
        tipNames.push(groups[i].layers[t].name);
      } catch (eT) {}
    }
    cb.helpTip = tipNames.join(", ");
    checks.push(cb);
  }

  var selRow = dlg.add("group");
  selRow.orientation = "row";
  var allBtn = selRow.add("button", undefined, "全選択");
  var noneBtn = selRow.add("button", undefined, "全解除");
  allBtn.onClick = function () {
    for (var k = 0; k < checks.length; k++) checks[k].value = true;
  };
  noneBtn.onClick = function () {
    for (var k = 0; k < checks.length; k++) checks[k].value = false;
  };

  var btnRow = dlg.add("group");
  btnRow.alignment = ["right", "bottom"];
  btnRow.add("button", undefined, "解除", { name: "ok" });
  btnRow.add("button", undefined, "キャンセル", { name: "cancel" });
  if (dlg.show() !== 1) return;

  var removedCount = 0;
  var restoredCount = 0;
  var compCount = 0;
  beginUndo("EmoLabMaker: 目パチ解除（コンポ単位）");
  try {
    for (var j = 0; j < groups.length; j++) {
      if (!checks[j].value) continue;
      var res = removeBlinkFromComp(groups[j].comp);
      removedCount += res.removed;
      restoredCount += res.restored;
      compCount++;
    }
  } finally {
    endUndo();
  }
  var msg =
    compCount +
    " コンポ・計 " +
    removedCount +
    " レイヤーの目パチを解除しました。";
  if (restoredCount > 0) {
    msg += "\nうち " + restoredCount + " レイヤーは表情切替に戻しました。";
  }
  alert(msg);
};

// ── 設定（立ち絵タブの表示・挙動。app.settings で永続化） ──
var settingsPanel = tabPsd.add("panel", undefined, "設定");
settingsPanel.orientation = "column";
settingsPanel.alignChildren = ["left", "top"];
settingsPanel.alignment = ["fill", "bottom"];
settingsPanel.spacing = 4;
settingsPanel.margins = 8;

var cbFollow = settingsPanel.add(
  "checkbox",
  undefined,
  "再生ヘッド追従（立ち絵タブを触ると現在状態に同期）",
);
cbFollow.value = cfgFollowPlayhead;
cbFollow.onClick = function () {
  cfgFollowPlayhead = cbFollow.value;
  setSettingBool("followPlayhead", cfgFollowPlayhead);
};

var cbForced = settingsPanel.add(
  "checkbox",
  undefined,
  "立ち絵タブで「!」常時表示レイヤーを表示",
);
cbForced.value = cfgShowForced;
cbForced.onClick = function () {
  cfgShowForced = cbForced.value;
  setSettingBool("showForced", cfgShowForced);
  refreshStage(false);
};

var cbHideInactive = settingsPanel.add(
  "checkbox",
  undefined,
  "非アクティブ階層を隠す（グレーアウトの代わりに非表示）",
);
cbHideInactive.value = cfgHideInactive;
cbHideInactive.onClick = function () {
  cfgHideInactive = cbHideInactive.value;
  setSettingBool("hideInactive", cfgHideInactive);
  refreshStage(false);
};

var indentRow = settingsPanel.add("group");
indentRow.orientation = "row";
indentRow.alignChildren = ["left", "center"];
indentRow.spacing = 4;
indentRow.add("statictext", undefined, "インデント幅(px)");
var indentInput = indentRow.add("edittext", undefined, String(cfgIndentWidth));
indentInput.preferredSize = [44, BUTTON_HEIGHT];
indentInput.onChange = function () {
  var v = parseFloat(indentInput.text);
  if (isNaN(v) || v < 0) v = 14;
  if (v > 60) v = 60;
  cfgIndentWidth = v;
  indentInput.text = String(v);
  setSettingNum("indentWidth", v);
  refreshStage(false);
};

var psdStatusText = tabPsd.add(
  "statictext",
  undefined,
  "PSD のルートコンポを選択してください。",
);
psdStatusText.alignment = ["fill", "bottom"];

function refreshPsdDropdowns() {
  var rootCur = psdRootRow.dropdown.selection
    ? psdRootRow.dropdown.selection.text
    : null;
  var ctrlCur = psdCtrlRow.dropdown.selection
    ? psdCtrlRow.dropdown.selection.text
    : null;
  rebuildPsdDropdown(psdRootRow.dropdown, rootCur);
  rebuildPsdDropdown(psdCtrlRow.dropdown, ctrlCur, collectCtrlCandidates());
  if (psdRootRow.dropdown.items.length === 0) {
    psdStatusText.text =
      "PSD 立ち絵コンポが見つかりません。PSD を「コンポジション」として読み込んでください。";
  }
}

psdRefreshBtn.onClick = function () {
  refreshPsdDropdowns();
  psdStatusText.text = "コンポ一覧を更新しました（PSD 立ち絵ルート候補のみ）。";
};

// ルート変更時は制御コンポも同じものをデフォルトにする
psdRootRow.dropdown.onChange = function () {
  if (!psdRootRow.dropdown.selection) return;
  var rootName = psdRootRow.dropdown.selection.text;
  for (var i = 0; i < psdCtrlRow.dropdown.items.length; i++) {
    if (psdCtrlRow.dropdown.items[i].text === rootName) {
      psdCtrlRow.dropdown.selection = i;
      break;
    }
  }
};

psdSetupBtn.onClick = function () {
  var rootComp = getSelectedComp(psdRootRow.dropdown);
  var ctrlComp = getSelectedComp(psdCtrlRow.dropdown);
  if (!rootComp) {
    psdStatusText.text = "ルートコンポを選択してください。";
    return;
  }
  if (!ctrlComp) {
    psdStatusText.text = "制御コンポを選択してください。";
    return;
  }

  var groups = scanPsdCompTree(rootComp);
  if (groups.length === 0) {
    alert(
      "PSDToolKit の命名規則 (* / !) に該当するレイヤーが見つかりませんでした。\n" +
        "PSD を「コンポジション」として読み込んだルートコンポを選択してください。",
    );
    return;
  }

  var selectedGroups = showPsdScanDialog(rootComp, groups);
  if (!selectedGroups) {
    psdStatusText.text = "キャンセルしました。";
    return;
  }
  if (selectedGroups.length === 0) {
    psdStatusText.text = "グループが選択されていません。";
    return;
  }

  var report = autoSetupPsd(rootComp, ctrlComp, selectedGroups);

  refreshPsdDropdowns();

  showPsdReportDialog(report);
  psdStatusText.text =
    "セットアップ完了: " +
    report.groupCount +
    " グループ / 新規 " +
    report.registered +
    " / 更新 " +
    report.updated;
};
