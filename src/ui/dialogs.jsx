// ── 表情セット ───────────────────────────────────────────────────

function promptForSetName(defaultName) {
  var dialog = new Window("dialog", "表情セット名");
  dialog.orientation = "column";
  dialog.alignChildren = ["fill", "top"];
  dialog.margins = 16;
  dialog.spacing = 8;

  dialog.add("statictext", undefined, "セット名（同名があれば上書き）:");
  var input = dialog.add("edittext", undefined, defaultName || "");
  input.preferredSize = [220, BUTTON_HEIGHT];
  input.active = true;

  var btns = dialog.add("group");
  btns.alignment = ["right", "top"];
  btns.add("button", undefined, "OK", { name: "ok" });
  btns.add("button", undefined, "キャンセル", { name: "cancel" });

  if (dialog.show() !== 1) return null;
  var name = input.text.replace(/^\s+|\s+$/g, "");
  return name.length > 0 ? name : null;
}

// ── 口パク関連のダイアログ（20_tab_lab.jsx から抽出） ──

/**
 * 音素レイヤー（[Lab]）のあるコンポを選ばせるダイアログ。
 * compNames を渡せばその候補だけ（検証済み）から選ばせる。
 * 確定したらコンポ名、キャンセルなら null を返す。
 */
function promptForPhonemeComp(defaultName, compNames) {
  if (!compNames) {
    compNames = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem) {
        compNames.push(item.name);
      }
    }
  }

  var dialog = new Window("dialog", "コンポジションを選択");
  dialog.orientation = "column";
  dialog.alignChildren = ["fill", "top"];

  dialog.add(
    "statictext",
    undefined,
    "[Lab] 音素レイヤーのある場所（未配置なら配置予定のコンポ）:",
  );
  var compDropdown = dialog.add("dropdownlist", undefined, compNames);

  for (var j = 0; j < compNames.length; j++) {
    if (compNames[j] === defaultName) {
      compDropdown.selection = j;
      break;
    }
  }
  if (!compDropdown.selection && compNames.length > 0) {
    compDropdown.selection = 0;
  }

  var dialogBtnGroup = dialog.add("group");
  dialogBtnGroup.add("button", undefined, "OK", { name: "ok" });
  dialogBtnGroup.add("button", undefined, "キャンセル", { name: "cancel" });

  if (dialog.show() !== 1) return null;
  if (!compDropdown.selection) {
    alert("コンポジションを選択してください");
    return null;
  }
  return compDropdown.selection.text;
}

// 1つの口形（行）に複数の口パクレイヤーが一致したとき、使う 1 枚を選ばせる。
// （「<口パク1>,<口パク2>」のように 2 枚割り当てると口が二重表示になるため）
// 戻り値: 選んだ layer / スキップ(割り当てない)なら null。
function pickMouthLayerDialog(rowLabel, candidateLayers) {
  var dlg = new Window("dialog", "口パクレイヤーを選択");
  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];
  dlg.spacing = 8;
  dlg.margins = 14;

  var msg = dlg.add(
    "statictext",
    undefined,
    "「" +
      rowLabel +
      "」に使う口パクレイヤーを 1 つ選んでください（2 つ割り当てると口が二重表示になります）。",
    { multiline: true },
  );
  msg.preferredSize = [340, 40];

  var listGroup = dlg.add("group");
  listGroup.orientation = "column";
  listGroup.alignChildren = ["fill", "top"];
  var dd = listGroup.add("dropdownlist");
  dd.alignment = ["fill", "top"];
  for (var i = 0; i < candidateLayers.length; i++) {
    dd.add("item", candidateLayers[i].name);
  }
  dd.selection = 0;

  var btnRow = dlg.add("group");
  btnRow.orientation = "row";
  btnRow.alignment = ["right", "top"];
  var skipBtn = btnRow.add("button", undefined, "割り当てない");
  var okBtn = btnRow.add("button", undefined, "割当", { name: "ok" });

  var result = { chosen: null };
  okBtn.onClick = function () {
    result.chosen =
      dd.selection !== null ? candidateLayers[dd.selection.index] : null;
    dlg.close();
  };
  skipBtn.onClick = function () {
    result.chosen = null;
    dlg.close();
  };
  dlg.show();
  return result.chosen;
}

// ── PSD 関連のダイアログ（30_tab_psd.jsx から抽出） ──

/**
 * 走査結果の確認ダイアログ。
 * セットアップするグループを選ばせる（誤検出の確認画面を兼ねる）。
 * OK なら選択されたグループ配列、キャンセルなら null を返す
 */
function showPsdScanDialog(rootComp, groups) {
  var dialog = new Window("dialog", "PSD 解析結果 - " + rootComp.name);
  dialog.orientation = "column";
  dialog.alignChildren = ["fill", "top"];
  dialog.margins = 16;
  dialog.spacing = 6;

  dialog.add(
    "statictext",
    undefined,
    "セットアップするグループを選択してください:",
  );

  var listGroup = dialog.add("group");
  listGroup.orientation = "column";
  listGroup.alignChildren = ["fill", "top"];
  listGroup.spacing = 2;

  var checkboxes = [];
  for (var i = 0; i < groups.length; i++) {
    var group = groups[i];
    var defaultLayer = group.defaultLayer;
    var label =
      group.comp.name +
      "（排他 " +
      group.exclusiveLayers.length +
      " / 任意 " +
      group.optionalLayers.length +
      " / 強制 " +
      group.forcedLayers.length +
      (group.flipVariants.length > 0
        ? " / 反転 " + group.flipVariants.length
        : "") +
      (defaultLayer
        ? " / 既定: " + parsePsdLayerName(defaultLayer.name).base
        : "") +
      "）";
    var cb = listGroup.add("checkbox", undefined, label);
    // 排他または任意指定があるグループを既定で ON（強制のみのグループも選択は可能）
    cb.value =
      group.exclusiveLayers.length > 0 || group.optionalLayers.length > 0;
    checkboxes.push(cb);
  }

  var noteText = dialog.add(
    "statictext",
    undefined,
    "グループコンポは「" + rootComp.name + "_◯◯」に改名されます",
  );
  noteText.graphics.foregroundColor = noteText.graphics.newPen(
    noteText.graphics.PenType.SOLID_COLOR,
    [0.6, 0.6, 0.6, 1],
    1,
  );

  var btnGroup = dialog.add("group");
  btnGroup.alignment = ["right", "bottom"];
  btnGroup.add("button", undefined, "セットアップ", { name: "ok" });
  btnGroup.add("button", undefined, "キャンセル", { name: "cancel" });

  if (dialog.show() !== 1) return null;

  var selected = [];
  for (var j = 0; j < groups.length; j++) {
    if (checkboxes[j].value) selected.push(groups[j]);
  }
  return selected;
}

/** セットアップ結果のレポートダイアログ */
function showPsdReportDialog(report) {
  var dialog = new Window("dialog", "PSD セットアップ結果");
  dialog.orientation = "column";
  dialog.alignChildren = ["fill", "top"];
  dialog.margins = 16;
  dialog.spacing = 6;

  var summaryLines = [
    "グループ: " + report.groupCount,
    "新規登録: " + report.registered + " レイヤー",
    "更新: " + report.updated + " レイヤー",
  ];
  if (report.kept > 0) {
    summaryLines.push(
      "保持（口パク/目パチ設定済み）: " + report.kept + " レイヤー",
    );
  }
  if (report.forced > 0) {
    summaryLines.push("強制表示 (!): " + report.forced + " レイヤー");
  }
  if (report.flipPaired > 0) {
    summaryLines.push(
      "反転ペア登録 (:flipx 等): " + report.flipPaired + " レイヤー",
    );
  }
  if (report.markersWritten > 0) {
    summaryLines.push(
      "デフォルト表情マーカー: " + report.markersWritten + " 件",
    );
  }
  for (var i = 0; i < summaryLines.length; i++) {
    dialog.add("statictext", undefined, summaryLines[i]);
  }

  var detailLines = [];
  if (report.renamedComps.length > 0) {
    detailLines.push("【コンポ名の一意化】");
    detailLines = detailLines.concat(report.renamedComps);
    detailLines.push("");
  }
  if (report.renamedLayers.length > 0) {
    detailLines.push("【レイヤーのリネーム】");
    detailLines = detailLines.concat(report.renamedLayers);
    detailLines.push("");
  }
  if (report.flipVariants.length > 0) {
    detailLines.push(
      "【反転バリエーション (:flipx/:flipy)】ペアは登録、ペアなしはスキップ",
    );
    detailLines = detailLines.concat(report.flipVariants);
    detailLines.push("");
  }
  if (report.commaNames.length > 0) {
    detailLines.push(
      "【警告: レイヤー名にカンマ「,」】表示中集合が壊れる恐れ。リネーム推奨",
    );
    detailLines = detailLines.concat(report.commaNames);
  }

  if (detailLines.length > 0) {
    var detailBox = dialog.add("edittext", undefined, detailLines.join("\n"), {
      multiline: true,
      scrolling: true,
      readonly: true,
    });
    detailBox.preferredSize = [380, 160];
  }

  dialog.add("button", undefined, "閉じる", { name: "ok" });
  dialog.show();
}

// ── 立ち絵タブのヘルプ（40_tab_stage.jsx から抽出） ──

function showStageHelpDialog() {
  var dlg = new Window("dialog", "立ち絵タブの使い方");
  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];
  dlg.margins = 16;
  dlg.spacing = 6;
  var lines = [
    "【立ち絵タブ】PSDToolKit 立ち絵の階層をまとめて切り替えます。",
    "1. 設定済みの立ち絵ルートコンポを選ぶ（セットアップタブでセットアップ済みのもののみ表示）",
    "2. 目/口/服などの階層がインデントで並びます",
    "   - ラジオ（* レイヤー/コンポ）= ボタン（1つだけ表示）",
    "   - 任意指定（無印レイヤー）= チェックボックス（独立 ON/OFF）",
    "   - 常時表示（! レイヤー）= 常に出るので UI には出しません",
    "3. ∇ / ▸ でサブ階層を折りたためます。選択肢は幅に応じて折り返します",
    "4. 上位コンポが選択されていない階層はグレーアウトします",
    "5. 切り替えは制御コンポの現在時刻にマーカーとして書き込まれます",
    "",
    "【反転】「左右反転 / 上下反転」のチェックで立ち絵全体を Scale ミラーします",
    "  - ルートコンポの最上位レイヤーを中心線でミラー（Scale 反転＋位置を中心線で反転）",
    "    静的な値の書き換えだけなので描画は重くなりません（負荷ゼロ）。各軸は独立トグル",
    "  - 反転状態はルートコンポのコメントに記録（再読込しても保持）",
    "  ※ 最上位レイヤーにキーフレーム/式/親子付けがあると正しくミラーできない場合あり",
    "",
    "再生ヘッドを動かした後はパネルをクリックすると自動更新します",
    "（取れない場合は「更新」。ScriptUI は再生ヘッド移動を直接検知できません）。",
    "",
    "「表情セット」で全階層の表示状態をまとめて保存/適用できます。",
  ];
  for (var i = 0; i < lines.length; i++) {
    dlg.add("statictext", undefined, lines[i]);
  }
  dlg.add("button", undefined, "閉じる", { name: "ok" });
  dlg.show();
}
