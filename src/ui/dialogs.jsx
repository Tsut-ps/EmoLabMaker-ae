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
