/**
 * EmoLabMaker.jsx
 * @version 1.3.0
 * @description レイヤー選択 + 口パク 統合パネル
 *   Tab 1 "レイヤー選択" : 指定レイヤーを登録し、任意の場所のマーカーで排他的に表示を切り替える
 *   Tab 2 "口パク"      : labファイルを解析して音素レイヤーを生成 + 不透明度エクスプレッションを設定するツール
 *                         口形状マッピング (PSDToolKit互換) で あ/い/う/え/お/ん への音素割当も可能
 */

(function emoLabMaker(thisObj) {
  // ════════════════════════════════════════════════════════════════
  // 共通定数
  // ════════════════════════════════════════════════════════════════
  var BUTTON_HEIGHT = 24;
  var LAB_MAP_SIGNATURE = "lab2layerPhonemeMap";

  // ════════════════════════════════════════════════════════════════
  // 共通ユーティリティ
  // ════════════════════════════════════════════════════════════════

  function getActiveComp() {
    var item = app.project ? app.project.activeItem : null;
    return item && item instanceof CompItem ? item : null;
  }

  function getProjectComps() {
    var comps = [];
    if (!app.project) return comps;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem) comps.push(item);
    }
    return comps;
  }

  function findCompByName(name) {
    if (!name) return null;
    var comps = getProjectComps();
    for (var i = 0; i < comps.length; i++) {
      if (comps[i].name === name) return comps[i];
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  // ウィンドウ / タブ
  // ════════════════════════════════════════════════════════════════

  var win =
    thisObj instanceof Panel
      ? thisObj
      : new Window("palette", "emoLabMaker", undefined, { resizeable: true });

  win.orientation = "column";
  win.alignChildren = ["fill", "fill"];
  win.spacing = 0;
  win.margins = 6;

  var tabs = win.add("tabbedpanel");
  tabs.alignment = ["fill", "fill"];

  var tabSelector = tabs.add("tab", undefined, "レイヤー選択");
  var tabLab = tabs.add("tab", undefined, "口パク");

  tabSelector.orientation = "column";
  tabSelector.alignChildren = ["fill", "top"];
  tabSelector.spacing = 8;
  tabSelector.margins = 8;

  tabLab.orientation = "column";
  tabLab.alignChildren = ["fill", "top"];
  tabLab.spacing = 8;
  tabLab.margins = 8;

  tabs.selection = 0;

  // ════════════════════════════════════════════════════════════════
  //
  //  TAB 1 : emo2layer
  //
  // ════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════
  // 定数
  // ══════════════════════════════════════════════════════════════════
  var CTRL_PREFIX = "[Emo] ";
  var EXPR_SIGNATURE = "emo2layerCtrlMarker";
  var LABEL_WIDTH = 40;
  var DROPDOWN_MIN_W = 140;
  var GRID_MIN_BTN_W = 60;
  var GRID_SPACING = 6;
  var MARKER_EPSILON = 0.0001;
  var PANEL_MARGIN = 8;

  // ══════════════════════════════════════════════════════════════════
  // コンポ ユーティリティ
  // ══════════════════════════════════════════════════════════════════

  function getSelectedComp(dropdown) {
    return dropdown.selection ? findCompByName(dropdown.selection.text) : null;
  }

  // ══════════════════════════════════════════════════════════════════
  // 制御レイヤー ユーティリティ
  // ══════════════════════════════════════════════════════════════════

  function getCtrlLayerName(targetCompName) {
    return CTRL_PREFIX + targetCompName;
  }

  /**
   * ctrlComp 内で time に有効な制御レイヤーを探す。
   * 時刻に合うものがなければ最初に見つかったもの（フォールバック）を返す。
   */
  function findCtrlLayerInComp(ctrlComp, targetCompName, time) {
    if (!ctrlComp) return null;
    var ctrlName = getCtrlLayerName(targetCompName);
    var fallback = null;
    for (var i = 1; i <= ctrlComp.numLayers; i++) {
      var layer = ctrlComp.layer(i);
      if (layer.name !== ctrlName) continue;
      if (!fallback) fallback = layer;
      if (time >= layer.inPoint && time < layer.outPoint) return layer;
    }
    return fallback;
  }

  /**
   * 制御レイヤーを作成する。
   * inPoint の直接代入は読み取り専用になるバージョンがあるため
   * startTime を操作してコンプ全体をカバーさせる。
   */
  function createCtrlLayer(ctrlComp, targetCompName) {
    var existing = findCtrlLayerInComp(ctrlComp, targetCompName, 0);
    if (existing) return existing;

    var layer = ctrlComp.layers.addNull(ctrlComp.duration);
    layer.name = getCtrlLayerName(targetCompName);
    layer.startTime = 0;
    // outPoint をコンプ末尾に合わせる（startTime 操作後に設定）
    try {
      layer.outPoint = ctrlComp.duration;
    } catch (e) {}
    layer.shy = true;
    layer.guideLayer = true;
    layer.label = 11;
    return layer;
  }

  // ══════════════════════════════════════════════════════════════════
  // エクスプレッション
  // ══════════════════════════════════════════════════════════════════

  /**
   * 表情マーカーのロジック部分（制御レイヤー探索 + 現在マーカー名取得）。
   * emo 単独式と、口パク/目パチの合成式で共有する。
   */
  function buildEmoMarkerSnippet(ctrlCompName, targetCompName) {
    return [
      'var ctrlComp = comp("' + ctrlCompName + '");',
      'var ctrlName = "' + getCtrlLayerName(targetCompName) + '";',
      "function findCtrlLayer() {",
      "  var fallback = null;",
      "  for (var i = 1; i <= ctrlComp.numLayers; i++) {",
      "    var layer = ctrlComp.layer(i);",
      "    if (layer.name !== ctrlName) continue;",
      "    if (!fallback) fallback = layer;",
      "    if (time >= layer.inPoint && time < layer.outPoint) return layer;",
      "  }",
      "  return fallback;",
      "}",
      "function getCurrentMarkerName(ctrlLayer) {",
      "  if (!ctrlLayer) return null;",
      "  var marker = ctrlLayer.marker;",
      "  if (marker.numKeys === 0) return null;",
      "  var index = marker.nearestKey(time).index;",
      "  if (marker.key(index).time > time) index--;",
      "  if (index < 1) return null;",
      "  return marker.key(index).comment;",
      "}",
    ];
  }

  function buildOpacityExpression(ctrlCompName, targetCompName) {
    return ["// " + EXPR_SIGNATURE]
      .concat(buildEmoMarkerSnippet(ctrlCompName, targetCompName))
      .concat([
        "var ctrlLayer = findCtrlLayer();",
        "var markerName = getCurrentMarkerName(ctrlLayer);",
        "markerName !== null && thisLayer.name === markerName ? 100 : 0;",
      ])
      .join("\n");
  }

  function isRegistered(layer) {
    if (!layer) return false;
    try {
      return layer.transform.opacity.expression.indexOf(EXPR_SIGNATURE) >= 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * 登録済みレイヤーのエクスプレッションから emo の制御情報を読み取る。
   * 合成式（口パク/目パチ）適用時に表情切替の登録を引き継ぐために使う。
   */
  function parseEmoContext(layer) {
    var expr = "";
    try {
      expr = layer.transform.opacity.expression;
    } catch (e) {
      return null;
    }
    if (!expr || expr.indexOf(EXPR_SIGNATURE) < 0) return null;

    var compMatch = expr.match(/var ctrlComp = comp\("([\s\S]*?)"\);/);
    var nameMatch = expr.match(/var ctrlName = "([\s\S]*?)";/);
    if (!compMatch || !nameMatch) return null;
    if (nameMatch[1].indexOf(CTRL_PREFIX) !== 0) return null;

    return {
      ctrlCompName: compMatch[1],
      targetCompName: nameMatch[1].substring(CTRL_PREFIX.length),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // 登録 / 解除
  // ══════════════════════════════════════════════════════════════════

  function registerLayers(targetComp, ctrlCompName, layers, undoName) {
    if (!layers || layers.length === 0) return 0;

    var expression = buildOpacityExpression(ctrlCompName, targetComp.name);
    var count = 0;

    app.beginUndoGroup(undoName || "emo2layer: Register");
    try {
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        if (!layer) continue;
        layer.transform.opacity.expression = expression;
        layer.enabled = true;
        count++;
      }
    } finally {
      app.endUndoGroup();
    }
    return count;
  }

  function registerSelectedLayers(targetComp, ctrlCompName) {
    return registerLayers(targetComp, ctrlCompName, targetComp.selectedLayers);
  }

  function unregisterSelectedLayers(targetComp) {
    var selected = targetComp.selectedLayers;
    if (!selected || selected.length === 0) return 0;

    var count = 0;
    app.beginUndoGroup("emo2layer: Unregister");
    try {
      for (var i = 0; i < selected.length; i++) {
        var layer = selected[i];
        if (!layer || !isRegistered(layer)) continue;
        layer.transform.opacity.expression = "";
        layer.transform.opacity.setValue(100);
        count++;
      }
    } finally {
      app.endUndoGroup();
    }
    return count;
  }

  /**
   * 指定シグネチャを含むエクスプレッションを除去して不透明度を 100 に戻す。
   * undo group は呼び出し側で管理する。
   */
  function removeExpressionBySignature(layers, signature) {
    var count = 0;
    if (!layers) return 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!layer) continue;
      var expr = "";
      try {
        expr = layer.transform.opacity.expression;
      } catch (e) {
        continue;
      }
      if (!expr || expr.indexOf(signature) < 0) continue;
      layer.transform.opacity.expression = "";
      layer.transform.opacity.setValue(100);
      count++;
    }
    return count;
  }

  // ══════════════════════════════════════════════════════════════════
  // 登録レイヤー名の収集
  // ══════════════════════════════════════════════════════════════════

  function collectMarkerNames(targetComp) {
    var names = [];
    var seen = {};
    if (!targetComp) return names;

    for (var i = 1; i <= targetComp.numLayers; i++) {
      var layer = targetComp.layer(i);
      if (!isRegistered(layer) || seen[layer.name]) continue;
      seen[layer.name] = true;
      names.push(layer.name);
    }
    return names;
  }

  function countRegisteredLayers(targetComp) {
    var count = 0;
    if (!targetComp) return 0;
    for (var i = 1; i <= targetComp.numLayers; i++) {
      if (isRegistered(targetComp.layer(i))) count++;
    }
    return count;
  }

  function isCtrlPrefixedLayerName(name) {
    if (!name) return false;
    return name.indexOf(CTRL_PREFIX) === 0 || name.indexOf("[Emo] ") === 0;
  }

  function hasCtrlPrefixedLayer(ctrlComp) {
    if (!ctrlComp) return false;
    for (var i = 1; i <= ctrlComp.numLayers; i++) {
      if (isCtrlPrefixedLayerName(ctrlComp.layer(i).name)) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════
  // マーカー書き込み
  // ══════════════════════════════════════════════════════════════════

  function removeMarkerAtTime(layer, time) {
    if (!layer) return;
    try {
      var marker = layer.property("Marker");
      for (var i = marker.numKeys; i >= 1; i--) {
        if (Math.abs(marker.keyTime(i) - time) < MARKER_EPSILON) {
          marker.removeKey(i);
        }
      }
    } catch (e) {}
  }

  function writeMarkerNameAtTime(ctrlComp, targetCompName, time, markerName) {
    var ctrlLayer = findCtrlLayerInComp(ctrlComp, targetCompName, time);
    if (!ctrlLayer) return false;

    app.beginUndoGroup("emo2layer: Write Marker");
    try {
      removeMarkerAtTime(ctrlLayer, time);
      ctrlLayer
        .property("Marker")
        .setValueAtTime(time, new MarkerValue(markerName));
    } finally {
      app.endUndoGroup();
    }
    return true;
  }

  function writeMarkerName(targetComp, ctrlComp, markerName) {
    return writeMarkerNameAtTime(
      ctrlComp,
      targetComp.name,
      targetComp.time,
      markerName,
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // グリッドレイアウト計算
  // ══════════════════════════════════════════════════════════════════

  /** markerGridPanel の内側マージンを安全に取得 */
  function getPanelMargin() {
    var m = markerGridPanel.margins;
    if (typeof m === "number") return m;
    if (m && typeof m.left === "number") return m.left;
    return PANEL_MARGIN;
  }

  function getGridColumns() {
    var width = markerGridPanel.size ? markerGridPanel.size.width : 360;
    var columns = Math.floor(width / (GRID_MIN_BTN_W + GRID_SPACING));
    if (columns < 1) columns = 1;
    if (columns > 4) columns = 4;
    return columns;
  }

  function getGridButtonWidth(columns) {
    var panelWidth = markerGridPanel.size ? markerGridPanel.size.width : 360;
    var margin = getPanelMargin();
    var innerWidth = panelWidth - margin * 2;
    var bw = Math.floor((innerWidth - (columns - 1) * GRID_SPACING) / columns);
    return bw < GRID_MIN_BTN_W ? GRID_MIN_BTN_W : bw;
  }

  // ══════════════════════════════════════════════════════════════════
  // UI 構築
  // ══════════════════════════════════════════════════════════════════

  // ── タイトル行 ──────────────────────────────────────────────────
  var topRow = tabSelector.add("group");
  topRow.orientation = "row";
  topRow.alignment = ["fill", "top"];
  topRow.alignChildren = ["left", "center"];
  topRow.spacing = 4;

  topRow.add("statictext", undefined, "対象");
  var targetStatusInfo = topRow.add("statictext", undefined, "");
  targetStatusInfo.preferredSize = [16, BUTTON_HEIGHT];

  topRow.add("statictext", undefined, "制御");
  var ctrlLayerInfo = topRow.add("statictext", undefined, "");
  ctrlLayerInfo.preferredSize = [16, BUTTON_HEIGHT];

  function setCheckColor(textNode, rgba) {
    if (!textNode || !textNode.graphics) return;
    var g = textNode.graphics;
    g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, rgba, 1);
  }

  function setCheckState(textNode, checked) {
    if (!textNode) return;
    textNode.text = "✓";
    // checked=true は緑、false は目立たないグレー
    setCheckColor(
      textNode,
      checked ? [0.1, 0.7, 0.2, 1] : [0.35, 0.35, 0.35, 1],
    );
  }

  setCheckState(targetStatusInfo, false);
  setCheckState(ctrlLayerInfo, false);

  var topSpacer = topRow.add("group");
  topSpacer.alignment = ["fill", "center"];

  var refreshAllBtn = topRow.add("button", undefined, "\u21BA");
  refreshAllBtn.alignment = ["right", "center"];
  refreshAllBtn.preferredSize = [24, BUTTON_HEIGHT];
  refreshAllBtn.helpTip = "コンポ一覧を両方再取得";

  var helpBtn = topRow.add("button", undefined, "ヘルプ");
  helpBtn.alignment = ["right", "center"];
  helpBtn.preferredSize = [52, BUTTON_HEIGHT];

  // ── コンポ選択行（共通ファクトリ） ──────────────────────────────
  function addCompRow(parent, labelText, btnText1, btnText2) {
    var row = parent.add("group");
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

    var btn1 = row.add("button", undefined, btnText1);
    btn1.preferredSize = [80, BUTTON_HEIGHT];

    var btn2 = null;
    if (btnText2) {
      btn2 = row.add("button", undefined, btnText2);
      btn2.preferredSize = [72, BUTTON_HEIGHT];
    }

    return { dropdown: dropdown, btn1: btn1, btn2: btn2 };
  }

  var targetRow = addCompRow(tabSelector, "対象", "登録", "解除");
  var ctrlRow = addCompRow(tabSelector, "制御", "制御レイヤー作成", null);

  // ── グリッドヘッダー ─────────────────────────────────────────────
  var markerHeaderRow = tabSelector.add("group");
  markerHeaderRow.orientation = "row";
  markerHeaderRow.alignChildren = ["left", "center"];
  markerHeaderRow.spacing = 10;

  var registeredCountInfo = markerHeaderRow.add(
    "statictext",
    undefined,
    "登録レイヤー: 0",
  );

  // ── マーカーグリッド ─────────────────────────────────────────────
  var markerGridPanel = tabSelector.add("panel");
  markerGridPanel.alignment = ["fill", "fill"];
  markerGridPanel.margins = PANEL_MARGIN;

  var markerGrid = markerGridPanel.add("group");
  markerGrid.orientation = "column";
  markerGrid.alignChildren = ["fill", "top"];
  markerGrid.alignment = ["fill", "fill"];
  markerGrid.spacing = GRID_SPACING;

  // ── ステータスバー ───────────────────────────────────────────────
  var statusText = tabSelector.add(
    "statictext",
    undefined,
    "対象コンポと制御コンポを選択してください。",
  );
  statusText.alignment = ["fill", "bottom"];

  // ══════════════════════════════════════════════════════════════════
  // 状態変数
  // ══════════════════════════════════════════════════════════════════
  var currentMarkerNames = [];
  var currentSelectedMarker = null;
  var isRebuildingGrid = false;

  // ══════════════════════════════════════════════════════════════════
  // ヘルパー UI 関数
  // ══════════════════════════════════════════════════════════════════

  function setStatus(text) {
    statusText.text = text;
  }

  function lockButton(btn, locked) {
    if (btn) btn.enabled = !locked;
  }

  /**
   * 前提条件に応じてボタンの有効・無効を更新する
   *   - 制御レイヤー作成: 対象＋制御コンポが揃っていること
   *   - レイヤー登録/解除: 対象＋制御コンポ＋アクティブコンプが対象と一致
   *   - マーカーボタン: 対象＋制御コンプ＋制御レイヤーが揃っていること
   */
  function updateButtonStates() {
    var targetComp = getSelectedComp(targetRow.dropdown);
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    var activeComp = getActiveComp();

    var hasTargetCtrl = targetComp && ctrlComp;
    var isTargetActive =
      targetComp && activeComp && activeComp.name === targetComp.name;
    var ctrlLayer = hasTargetCtrl
      ? findCtrlLayerInComp(ctrlComp, targetComp.name, targetComp.time)
      : null;
    var hasCtrlLayer = !!ctrlLayer;

    lockButton(ctrlRow.btn1, !hasTargetCtrl);
    lockButton(targetRow.btn1, !(hasTargetCtrl && isTargetActive));
    lockButton(targetRow.btn2, !(hasTargetCtrl && isTargetActive));

    // マーカーグリッド内のボタンは hasCtrlLayer で制御
    for (var i = 0; i < markerGrid.children.length; i++) {
      var row = markerGrid.children[i];
      for (var j = 0; j < row.children.length; j++) {
        row.children[j].enabled = hasCtrlLayer;
      }
    }
  }

  function updateInfo(targetComp) {
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    var hasCtrlLayer = hasCtrlPrefixedLayer(ctrlComp);

    setCheckState(targetStatusInfo, countRegisteredLayers(targetComp) > 0);
    setCheckState(ctrlLayerInfo, hasCtrlLayer);
    registeredCountInfo.text =
      "登録レイヤー: " + countRegisteredLayers(targetComp);
  }

  // ── ドロップダウン再構築 ─────────────────────────────────────────
  function rebuildDropdown(dropdown, selectedName) {
    var comps = getProjectComps();
    dropdown.removeAll();
    for (var i = 0; i < comps.length; i++) {
      dropdown.add("item", comps[i].name);
    }
    if (dropdown.items.length === 0) return;
    for (var j = 0; j < dropdown.items.length; j++) {
      if (dropdown.items[j].text === selectedName) {
        dropdown.selection = j;
        return;
      }
    }
    dropdown.selection = 0;
  }

  // ══════════════════════════════════════════════════════════════════
  // マーカーグリッド
  // ══════════════════════════════════════════════════════════════════

  /**
   * ボタンを行優先（row-major）で並べる。
   * 選択中のマーカー名には "✔ " prefix を表示。
   * 前提条件が満たされない場合はボタンを disabled にする。
   */
  function rebuildMarkerGrid() {
    if (isRebuildingGrid) return;
    isRebuildingGrid = true;

    try {
      // 既存ボタン行を全削除
      for (var d = markerGrid.children.length - 1; d >= 0; d--) {
        markerGrid.remove(markerGrid.children[d]);
      }

      var columns = getGridColumns();
      var total = currentMarkerNames.length;
      var rows = total > 0 ? Math.ceil(total / columns) : 0;
      var btnWidth = getGridButtonWidth(columns);

      // 行優先（row-major）: 左→右、上→下
      for (var r = 0; r < rows; r++) {
        var rowGroup = markerGrid.add("group");
        rowGroup.orientation = "row";
        rowGroup.alignment = ["fill", "top"];
        rowGroup.alignChildren = ["left", "center"];
        rowGroup.spacing = GRID_SPACING;

        for (var c = 0; c < columns; c++) {
          var idx = r * columns + c; // row-major index
          if (idx >= total) break;

          var markerName = currentMarkerNames[idx];
          var isSelected = currentSelectedMarker === markerName;
          var label = isSelected ? "\u2714 " + markerName : markerName;

          var btn = rowGroup.add("button", undefined, label);
          btn.size = [btnWidth, BUTTON_HEIGHT];
          btn.helpTip = markerName;

          // クロージャでマーカー名をキャプチャ
          btn.onClick = (function (name) {
            return function () {
              var targetComp = getSelectedComp(targetRow.dropdown);
              var ctrlComp = getSelectedComp(ctrlRow.dropdown);
              if (!targetComp || !ctrlComp) return;

              currentSelectedMarker =
                currentSelectedMarker === name ? null : name;

              if (currentSelectedMarker) {
                if (!writeMarkerName(targetComp, ctrlComp, name)) {
                  setStatus("マーカーの書き込みに失敗しました。");
                  currentSelectedMarker = null;
                } else {
                  setStatus("マーカー「" + name + "」を書き込みました。");
                }
              } else {
                setStatus("選択を解除しました。");
              }

              rebuildMarkerGrid();
            };
          })(markerName);
        }
      }

      markerGrid.layout.layout(true);
      markerGridPanel.layout.layout(true);
      updateButtonStates();
    } finally {
      isRebuildingGrid = false;
    }
  }

  /**
   * リサイズ時: ボタン幅と列数を再計算してグリッドを再構築する。
   * （列数が変わりうる Auto モードでは rebuildMarkerGrid が必要）
   */
  function resizeGrid() {
    rebuildMarkerGrid();
  }

  // ══════════════════════════════════════════════════════════════════
  // リスト全体の再構築
  // ══════════════════════════════════════════════════════════════════

  function rebuildList() {
    var targetComp = getSelectedComp(targetRow.dropdown);
    currentMarkerNames = collectMarkerNames(targetComp);

    // 選択中のマーカーが登録レイヤーから消えていたらリセット
    if (currentSelectedMarker) {
      var found = false;
      for (var i = 0; i < currentMarkerNames.length; i++) {
        if (currentMarkerNames[i] === currentSelectedMarker) {
          found = true;
          break;
        }
      }
      if (!found) currentSelectedMarker = null;
    }

    updateInfo(targetComp);
    rebuildMarkerGrid();

    if (!targetComp) setStatus("対象コンポを選択してください。");
  }

  // ══════════════════════════════════════════════════════════════════
  // ヘルプダイアログ
  // ══════════════════════════════════════════════════════════════════

  function showHelpDialog() {
    var dlg = new Window("dialog", "使い方 - EmoLabMaker");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 16;
    dlg.spacing = 6;
    var lines = [
      "【基本的な流れ】",
      "1. 対象コンポ: 切り替えたいレイヤーが入っているコンポを選択",
      "2. 制御コンポ: マーカーを書き込むコンポを選択（同じでも可）",
      "3. 「制御レイヤー作成」: 制御コンポに制御レイヤーを作成",
      "4. 対象コンポ内でレイヤーを選択して「レイヤー登録」",
      "   → Opacity にエクスプレッションが付きます",
      "5. マーカーボタンをクリック",
      "   → 現在の再生ヘッド位置に名前を書き込みます",
      "   → 再クリックで選択解除",
      "",
      "【登録解除】",
      "対象コンポ内で解除したいレイヤーを選択し「登録解除」",
      "→ Opacity を 100% に戻し、エクスプレッションを削除します",
      "",
      "【ドロップダウン更新】",
      "タイトル行の ↺ ボタンで対象・制御コンポ一覧を一括再取得します。",
    ];
    for (var i = 0; i < lines.length; i++) {
      dlg.add("statictext", undefined, lines[i]);
    }
    dlg.add("button", undefined, "閉じる", { name: "ok" });
    dlg.show();
  }

  // ══════════════════════════════════════════════════════════════════
  // イベントハンドラ
  // ══════════════════════════════════════════════════════════════════

  helpBtn.onClick = function () {
    showHelpDialog();
  };

  // コンポ一覧を両方まとめて再取得
  refreshAllBtn.onClick = function () {
    var tCur = targetRow.dropdown.selection
      ? targetRow.dropdown.selection.text
      : null;
    var cCur = ctrlRow.dropdown.selection
      ? ctrlRow.dropdown.selection.text
      : null;
    rebuildDropdown(targetRow.dropdown, tCur);
    rebuildDropdown(ctrlRow.dropdown, cCur);
    rebuildList();
    setStatus("コンポ一覧を更新しました。");
  };

  // 制御レイヤー作成
  ctrlRow.btn1.onClick = function () {
    var targetComp = getSelectedComp(targetRow.dropdown);
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    if (!targetComp) {
      setStatus("対象コンポを選択してください。");
      return;
    }
    if (!ctrlComp) {
      setStatus("制御コンポを選択してください。");
      return;
    }

    var ctrlLayer = createCtrlLayer(ctrlComp, targetComp.name);
    rebuildList();
    setStatus(
      "制御レイヤーを作成しました: " + ctrlComp.name + " / " + ctrlLayer.name,
    );
  };

  // レイヤー登録
  targetRow.btn1.onClick = function () {
    var targetComp = getSelectedComp(targetRow.dropdown);
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    if (!targetComp) {
      setStatus("対象コンポを選択してください。");
      return;
    }
    if (!ctrlComp) {
      setStatus("制御コンポを選択してください。");
      return;
    }

    var activeComp = getActiveComp();
    if (!activeComp || activeComp.name !== targetComp.name) {
      setStatus(
        "対象コンポをアクティブにしてから登録してください: " + targetComp.name,
      );
      return;
    }

    var count = registerSelectedLayers(targetComp, ctrlComp.name);
    rebuildList();
    setStatus(count + " レイヤーを登録しました。");
  };

  // 登録解除
  targetRow.btn2.onClick = function () {
    var targetComp = getSelectedComp(targetRow.dropdown);
    if (!targetComp) {
      setStatus("対象コンポを選択してください。");
      return;
    }

    var activeComp = getActiveComp();
    if (!activeComp || activeComp.name !== targetComp.name) {
      setStatus(
        "対象コンポをアクティブにしてから解除してください: " + targetComp.name,
      );
      return;
    }

    var count = unregisterSelectedLayers(targetComp);
    rebuildList();
    setStatus(count + " レイヤーの登録を解除しました。");
  };

  targetRow.dropdown.onChange = function () {
    rebuildList();
  };
  ctrlRow.dropdown.onChange = function () {
    rebuildList();
  };

  // ════════════════════════════════════════════════════════════════
  //
  //  TAB 2 : 口パク / 音素 (lab2layer)
  //
  // ════════════════════════════════════════════════════════════════

  // ========== ファイル選択グループ ==========
  var fileSelectGroup = tabLab.add("group");
  fileSelectGroup.orientation = "row";
  fileSelectGroup.alignChildren = ["left", "center"];
  fileSelectGroup.alignment = ["fill", "top"];

  fileSelectGroup.add("statictext", undefined, "labファイル");

  var filePathText = fileSelectGroup.add(
    "edittext",
    undefined,
    "ファイル未選択",
  );
  filePathText.alignment = ["fill", "center"];
  filePathText.enabled = false;

  var browseBtn = fileSelectGroup.add("button", undefined, "...");
  browseBtn.preferredSize = [30, 25];
  browseBtn.alignment = ["right", "center"];
  browseBtn.helpTip = "labファイルを選択";

  // ========== 音素リストグループ ==========
  var phonemeListPanel = tabLab.add("panel", undefined, "音素を選択");
  phonemeListPanel.orientation = "column";
  phonemeListPanel.alignChildren = ["fill", "top"];
  phonemeListPanel.alignment = ["fill", "top"];
  phonemeListPanel.spacing = 5;
  phonemeListPanel.margins = 10;
  phonemeListPanel.minimumSize = [200, 150];

  // ========== 音素チェックボックス ==========
  var phonemeCheckboxGroup = phonemeListPanel.add("group");
  phonemeCheckboxGroup.orientation = "column";
  phonemeCheckboxGroup.alignChildren = ["fill", "top"];
  phonemeCheckboxGroup.alignment = ["fill", "fill"];
  phonemeCheckboxGroup.spacing = 2;

  // 母音
  // a, i, u, e, o - 基本母音5つ

  // 特殊音素
  // N - 撥音（ん）
  // cl, Q - 促音（っ）
  // pau - ポーズ（休止）
  // sil - 無音（silence）
  // br - ブレス（息継ぎ）

  // 子音
  // k, g - か行、が行
  // s, z - さ行、ざ行
  // t, d - た行、だ行
  // n - な行
  // h, b, p - は行、ば行、ぱ行
  // m - ま行
  // y - や行
  // r - ら行
  // w - わ行

  // よく使う音素のリスト
  var commonPhonemes = [
    "a",
    "i",
    "u",
    "e",
    "o",
    "N",
    "pau",
    "sil",
    "cl",
    "Q",
    "br",
  ];

  var phonemeData = [];
  var labFile = null;

  // ExtendScript では記号キーを持つオブジェクト列挙が不安定なため、音素集合は配列ベースで保持
  function findPhonemeEntry(entries, name) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].phoneme === name) return entries[i];
    }
    return null;
  }

  function findOrCreatePhonemeEntry(entries, name) {
    var entry = findPhonemeEntry(entries, name);
    if (entry) return entry;

    entry = { phoneme: name, count: 0, times: [] };
    entries.push(entry);
    return entry;
  }

  function isCommonPhoneme(name) {
    for (var i = 0; i < commonPhonemes.length; i++) {
      if (commonPhonemes[i] === name) return true;
    }
    return false;
  }

  function parseLabPhonemeEntries(content) {
    var lines = content.split(/\r?\n/);
    var entries = [];

    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].replace(/^\s+|\s+$/g, "");
      if (trimmed.length === 0) continue;

      var parts = trimmed.split(/\s+/);
      if (parts.length < 3) continue;

      var startTime = parseFloat(parts[0]) / 10000000;
      var endTime = parseFloat(parts[1]) / 10000000;
      if (isNaN(startTime) || isNaN(endTime)) continue;

      var entry = findOrCreatePhonemeEntry(entries, parts[2]);
      entry.count++;
      entry.times.push({ start: startTime, end: endTime });
    }

    return entries;
  }

  // よく使う音素を先頭に並べ、それ以外は出現回数の多い順で続ける
  function buildSortedPhonemeList(entries) {
    var sorted = [];
    var otherPhonemes = [];

    for (var i = 0; i < commonPhonemes.length; i++) {
      var commonEntry = findPhonemeEntry(entries, commonPhonemes[i]);
      if (commonEntry && commonEntry.count > 0) {
        sorted.push({
          phoneme: commonEntry.phoneme,
          count: commonEntry.count,
          data: commonEntry,
        });
      }
    }

    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      if (entry.count <= 0 || isCommonPhoneme(entry.phoneme)) continue;

      otherPhonemes.push({
        phoneme: entry.phoneme,
        count: entry.count,
        data: entry,
      });
    }

    otherPhonemes.sort(function (a, b) {
      return b.count - a.count;
    });

    return sorted.concat(otherPhonemes);
  }

  function setPhonemeSelection(selector) {
    for (var i = 0; i < phonemeData.length; i++) {
      phonemeData[i].checkbox.value = selector(phonemeData[i]);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 口パク エクスプレッション
  // ══════════════════════════════════════════════════════════════════

  /**
   * 音素レイヤー探索 + 現在音素取得のロジック部分。
   * 名前マッチ式（従来）とマッピング式で共有する。
   */
  function buildPhonemeSnippet(targetCompName) {
    return [
      'var targetComp = comp("' + targetCompName + '");',
      "",
      "function findPhonemeLayer() {",
      "  for (var i = 1; i <= targetComp.numLayers; i++) {",
      "    var layer = targetComp.layer(i);",
      '    if (layer.name.indexOf("[Lab] ") !== 0) continue;',
      "    if (layer.marker.numKeys === 0) continue;",
      "    if (time < layer.inPoint || time >= layer.outPoint) continue;",
      "    return layer;",
      "  }",
      "  return null;",
      "}",
      "",
      "function getPhoneme(phonemeLayer) {",
      "  if (!phonemeLayer) return null;",
      "  var marker = phonemeLayer.marker;",
      "  var index = marker.nearestKey(time).index;",
      "  if (marker.key(index).time > time) index--;",
      "  if (index < 1) return null;",
      "  return marker.key(index).comment;",
      "}",
    ];
  }

  /** 従来の名前マッチ式（レイヤー名 = 音素名で表示判定） */
  function buildLabNameMatchExpression(targetCompName) {
    return buildPhonemeSnippet(targetCompName)
      .concat([
        "",
        "function matchesName(name) {",
        '  return (","+thisLayer.name+",").indexOf(","+name+",") >= 0;',
        "}",
        "",
        "var phonemeLayer = findPhonemeLayer();",
        "var phoneme = getPhoneme(phonemeLayer);",
        'phoneme !== null ? (matchesName(phoneme) ? 100 : 0) : (matchesName("def") ? 100 : 0);',
      ])
      .join("\n");
  }

  /**
   * マッピング式。レイヤー名は変えず、割り当てた音素リストを式に埋め込む。
   *   - 発話中（現在音素あり）: myPhonemes に一致したら表示。
   *     閉じ口（isClosedFallback）はどの口形にも属さない音素（=子音など）でも表示
   *   - 非発話中: emoCtx があれば表情マーカーのロジックに従い、
   *     なければ閉じ口のみ表示
   */
  function buildLabMappedExpression(
    phonemeCompName,
    myCsv,
    allCsv,
    isClosedFallback,
    emoCtx,
  ) {
    var lines = ["// " + LAB_MAP_SIGNATURE];
    if (emoCtx) lines.push("// " + EXPR_SIGNATURE);

    lines = lines
      .concat([
        'var myPhonemes = ",' + myCsv + ',";',
        'var allPhonemes = ",' + allCsv + ',";',
        "var isClosedFallback = " + (isClosedFallback ? "true" : "false") + ";",
      ])
      .concat(buildPhonemeSnippet(phonemeCompName))
      .concat([
        "",
        "var phonemeLayer = findPhonemeLayer();",
        "var phoneme = getPhoneme(phonemeLayer);",
        "var speaking = phoneme !== null;",
        "var shown = false;",
        'if (speaking && myPhonemes.indexOf("," + phoneme + ",") >= 0) shown = true;',
        'if (speaking && isClosedFallback && allPhonemes.indexOf("," + phoneme + ",") < 0) shown = true;',
      ]);

    if (emoCtx) {
      lines = lines
        .concat(
          buildEmoMarkerSnippet(emoCtx.ctrlCompName, emoCtx.targetCompName),
        )
        .concat([
          "var result;",
          "if (speaking) {",
          "  result = shown ? 100 : 0;",
          "} else {",
          "  var ctrlLayer = findCtrlLayer();",
          "  var markerName = getCurrentMarkerName(ctrlLayer);",
          "  result = markerName !== null && thisLayer.name === markerName ? 100 : 0;",
          "}",
          "result;",
        ]);
    } else {
      lines.push("speaking ? (shown ? 100 : 0) : (isClosedFallback ? 100 : 0);");
    }

    return lines.join("\n");
  }

  /**
   * 音素レイヤー（[Lab]）のあるコンポを選ばせるダイアログ。
   * 確定したらコンポ名、キャンセルなら null を返す。
   */
  function promptForPhonemeComp(defaultName) {
    var compNames = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem) {
        compNames.push(item.name);
      }
    }

    var dialog = new Window("dialog", "コンポジションを選択");
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];

    dialog.add("statictext", undefined, "制御レイヤーのある場所:");
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

  // ========== 一括選択ボタングループ ==========
  var phonemeSelectorGroup = phonemeListPanel.add("group");
  phonemeSelectorGroup.orientation = "row";
  phonemeSelectorGroup.alignment = ["fill", "bottom"];
  phonemeSelectorGroup.alignChildren = ["fill", "center"];
  phonemeSelectorGroup.spacing = 5;

  var selectAllBtn = phonemeSelectorGroup.add("button", undefined, "すべて");
  selectAllBtn.alignment = ["fill", "center"];
  var selectCommonBtn = phonemeSelectorGroup.add(
    "button",
    undefined,
    "かんたん",
  );
  selectCommonBtn.alignment = ["fill", "center"];
  var deselectAllBtn = phonemeSelectorGroup.add("button", undefined, "解除");
  deselectAllBtn.alignment = ["fill", "center"];

  // ========== オフセット設定グループ ==========
  var offsetGroup = tabLab.add("group");
  offsetGroup.orientation = "row";
  offsetGroup.alignment = ["fill", "top"];
  offsetGroup.alignChildren = ["left", "center"];
  offsetGroup.spacing = 5;

  var offsetLabel = offsetGroup.add(
    "statictext",
    undefined,
    "オフセット (ms):",
  );
  offsetLabel.alignment = ["left", "center"];

  var offsetInput = offsetGroup.add("edittext", undefined, "-67");
  offsetInput.alignment = ["fill", "center"];
  offsetInput.helpTip =
    "動画先行の法則: 映像は音声より数フレーム速いほうが自然に見えます（負の値=映像先行）";

  var frameMinus = offsetGroup.add("button", undefined, "<");
  frameMinus.preferredSize = [35, 25];
  frameMinus.alignment = ["right", "center"];
  frameMinus.helpTip = "1フレーム戻す（映像をさらに先行）";

  var framePlus = offsetGroup.add("button", undefined, ">");
  framePlus.preferredSize = [35, 25];
  framePlus.alignment = ["right", "center"];
  framePlus.helpTip = "1フレーム進める";

  // ========== 口形状マッピング (PSDToolKit互換) ==========
  // あ/い/う/え/お/ん の口形レイヤーに音素グループを割り当てる。
  // レイヤー名は変えずにエクスプレッションへ焼き込む方式

  var MOUTH_SHAPES = [
    { label: "あ", preset: "a" },
    { label: "い", preset: "i" },
    { label: "う", preset: "u,w" },
    { label: "え", preset: "e" },
    { label: "お", preset: "o" },
    { label: "ん(閉)", preset: "N,cl,Q,pau,sil,br", closedFallback: true },
  ];

  // 自動割当のヒューリスティック（先勝ち）。「閉」を「ん」より先に判定する
  var MOUTH_AUTO_RULES = [
    { ch: "閉", shapeIndex: 5 },
    { ch: "ん", shapeIndex: 5 },
    { ch: "あ", shapeIndex: 0 },
    { ch: "い", shapeIndex: 1 },
    { ch: "う", shapeIndex: 2 },
    { ch: "え", shapeIndex: 3 },
    { ch: "お", shapeIndex: 4 },
  ];

  function normalizeCsvTokens(text) {
    var parts = String(text || "").split(/[,、\s]+/);
    var tokens = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var token = parts[i].replace(/^\s+|\s+$/g, "");
      if (token.length === 0 || seen[token]) continue;
      seen[token] = true;
      tokens.push(token);
    }
    return tokens;
  }

  /** 削除済みレイヤーを除外しつつ名前一覧を返す */
  function describeAssignedLayers(layers) {
    var names = [];
    for (var i = layers.length - 1; i >= 0; i--) {
      try {
        names.unshift(layers[i].name);
      } catch (e) {
        layers.splice(i, 1); // 削除済みレイヤーを掃除
      }
    }
    return names.length > 0 ? names.join(", ") : "（未割当）";
  }

  var mouthMapPanel = tabLab.add(
    "panel",
    undefined,
    "口形状マッピング (PSDToolKit互換)",
  );
  mouthMapPanel.orientation = "column";
  mouthMapPanel.alignChildren = ["fill", "top"];
  mouthMapPanel.alignment = ["fill", "top"];
  mouthMapPanel.spacing = 4;
  mouthMapPanel.margins = 10;

  var mouthMapHint = mouthMapPanel.add(
    "statictext",
    undefined,
    "口コンポでレイヤーを選択して各行の「割当」→「適用」",
  );
  mouthMapHint.alignment = ["fill", "top"];

  var mouthRows = [];
  for (var msIdx = 0; msIdx < MOUTH_SHAPES.length; msIdx++) {
    (function (shape) {
      var row = mouthMapPanel.add("group");
      row.orientation = "row";
      row.alignment = ["fill", "top"];
      row.alignChildren = ["left", "center"];
      row.spacing = 4;

      var lbl = row.add("statictext", undefined, shape.label);
      lbl.preferredSize = [44, BUTTON_HEIGHT];

      var csvInput = row.add("edittext", undefined, shape.preset);
      csvInput.preferredSize = [104, BUTTON_HEIGHT];
      csvInput.helpTip = "この口形で表示する音素（カンマ区切り）";

      var assignBtn = row.add("button", undefined, "割当");
      assignBtn.preferredSize = [48, BUTTON_HEIGHT];
      assignBtn.helpTip = "アクティブコンポの選択レイヤーをこの口形に割当";

      var clearBtn = row.add("button", undefined, "×");
      clearBtn.preferredSize = [24, BUTTON_HEIGHT];
      clearBtn.helpTip = "この口形の割当をクリア";

      var namesText = row.add("statictext", undefined, "（未割当）");
      namesText.alignment = ["fill", "center"];

      var rowData = {
        shape: shape,
        csvInput: csvInput,
        namesText: namesText,
        layers: [],
      };
      mouthRows.push(rowData);

      assignBtn.onClick = function () {
        var comp = getActiveComp();
        if (!comp || comp.selectedLayers.length === 0) {
          alert("口形レイヤーを選択してください");
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
    })(MOUTH_SHAPES[msIdx]);
  }

  var mouthMapBtnRow = mouthMapPanel.add("group");
  mouthMapBtnRow.orientation = "row";
  mouthMapBtnRow.alignment = ["fill", "top"];
  mouthMapBtnRow.alignChildren = ["fill", "center"];
  mouthMapBtnRow.spacing = 5;

  var mouthAutoBtn = mouthMapBtnRow.add("button", undefined, "自動割当");
  mouthAutoBtn.helpTip =
    "選択レイヤー名に「あ/い/う/え/お/ん/閉」が含まれていれば自動で割当";
  var mouthPresetBtn = mouthMapBtnRow.add("button", undefined, "プリセット");
  mouthPresetBtn.helpTip = "音素リストを PSDToolKit 互換の初期値に戻す";
  var mouthApplyBtn = mouthMapBtnRow.add("button", undefined, "適用");
  mouthApplyBtn.helpTip =
    "割当済みレイヤーに不透明度エクスプレッションを設定（表情登録済みなら共存）";
  var mouthRemoveBtn = mouthMapBtnRow.add("button", undefined, "解除");
  mouthRemoveBtn.helpTip =
    "選択レイヤーのマッピングを解除（表情登録済みなら表情切替に戻す）";

  mouthAutoBtn.onClick = function () {
    var comp = getActiveComp();
    if (!comp || comp.selectedLayers.length === 0) {
      alert("口形レイヤーを選択してください");
      return;
    }

    var assignedCount = 0;
    for (var r = 0; r < mouthRows.length; r++) {
      mouthRows[r].layers = [];
    }

    for (var i = 0; i < comp.selectedLayers.length; i++) {
      var layer = comp.selectedLayers[i];
      for (var j = 0; j < MOUTH_AUTO_RULES.length; j++) {
        if (layer.name.indexOf(MOUTH_AUTO_RULES[j].ch) < 0) continue;
        mouthRows[MOUTH_AUTO_RULES[j].shapeIndex].layers.push(layer);
        assignedCount++;
        break;
      }
    }

    for (var k = 0; k < mouthRows.length; k++) {
      mouthRows[k].namesText.text = describeAssignedLayers(
        mouthRows[k].layers,
      );
      mouthRows[k].namesText.helpTip = mouthRows[k].namesText.text;
    }

    if (assignedCount === 0) {
      alert(
        "割当できるレイヤーがありませんでした。\nレイヤー名に あ/い/う/え/お/ん/閉 が含まれている必要があります。",
      );
    }
  };

  mouthPresetBtn.onClick = function () {
    for (var i = 0; i < mouthRows.length; i++) {
      mouthRows[i].csvInput.text = mouthRows[i].shape.preset;
    }
  };

  mouthApplyBtn.onClick = function () {
    // 全口形の音素を集約（閉じ口の「未割当音素→閉じ」判定に使用）
    var allTokens = [];
    var allSeen = {};
    var hasAssignment = false;

    for (var r = 0; r < mouthRows.length; r++) {
      var rowData = mouthRows[r];
      rowData.tokens = normalizeCsvTokens(rowData.csvInput.text);
      if (rowData.layers.length > 0) hasAssignment = true;
      for (var t = 0; t < rowData.tokens.length; t++) {
        if (allSeen[rowData.tokens[t]]) continue;
        allSeen[rowData.tokens[t]] = true;
        allTokens.push(rowData.tokens[t]);
      }
    }

    if (!hasAssignment) {
      alert(
        "口形レイヤーが割り当てられていません。\n各行の「割当」または「自動割当」で設定してください。",
      );
      return;
    }

    var activeComp = getActiveComp();
    var phonemeCompName = promptForPhonemeComp(
      activeComp ? activeComp.name : null,
    );
    if (!phonemeCompName) return;

    var allCsv = allTokens.join(",");
    var appliedCount = 0;
    var emoLinkedCount = 0;
    var staleCount = 0;

    app.beginUndoGroup("lab2layer: 口形状マッピング適用");
    try {
      for (var i = 0; i < mouthRows.length; i++) {
        var row = mouthRows[i];
        var myCsv = row.tokens.join(",");
        var isClosedFallback = !!row.shape.closedFallback;

        for (var j = 0; j < row.layers.length; j++) {
          var layer = row.layers[j];
          var emoCtx = null;
          try {
            emoCtx = parseEmoContext(layer);
            layer.transform.opacity.expression = buildLabMappedExpression(
              phonemeCompName,
              myCsv,
              allCsv,
              isClosedFallback,
              emoCtx,
            );
            layer.enabled = true;
          } catch (e) {
            staleCount++;
            continue;
          }
          appliedCount++;
          if (emoCtx) emoLinkedCount++;
        }
      }
    } finally {
      app.endUndoGroup();
    }

    var message =
      "完了: " +
      appliedCount +
      " レイヤーにマッピングを設定しました。\n音素ソース: " +
      phonemeCompName;
    if (emoLinkedCount > 0) {
      message +=
        "\n表情切替と共存: " + emoLinkedCount + " レイヤー（非発話中は表情に従います）";
    }
    if (staleCount > 0) {
      message +=
        "\n割当後に削除されたレイヤー: " + staleCount + "（スキップしました）";
    }
    alert(message);
  };

  mouthRemoveBtn.onClick = function () {
    var comp = getActiveComp();
    if (!comp || comp.selectedLayers.length === 0) {
      alert("解除するレイヤーを選択してください");
      return;
    }

    var removedCount = 0;
    var restoredCount = 0;

    app.beginUndoGroup("lab2layer: 口形状マッピング解除");
    try {
      var layers = comp.selectedLayers;
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var expr = "";
        try {
          expr = layer.transform.opacity.expression;
        } catch (e) {
          continue;
        }
        if (!expr || expr.indexOf(LAB_MAP_SIGNATURE) < 0) continue;

        var emoCtx = parseEmoContext(layer);
        if (emoCtx) {
          // 表情切替の登録に戻す
          layer.transform.opacity.expression = buildOpacityExpression(
            emoCtx.ctrlCompName,
            emoCtx.targetCompName,
          );
          restoredCount++;
        } else {
          layer.transform.opacity.expression = "";
          layer.transform.opacity.setValue(100);
        }
        removedCount++;
      }
    } finally {
      app.endUndoGroup();
    }

    var message = removedCount + " レイヤーのマッピングを解除しました。";
    if (restoredCount > 0) {
      message += "\nうち " + restoredCount + " レイヤーは表情切替に戻しました。";
    }
    alert(message);
  };

  // ========== 実行ボタン ==========
  var executeGroup = tabLab.add("group");
  executeGroup.orientation = "row";
  executeGroup.alignment = ["fill", "bottom"];
  executeGroup.alignChildren = ["fill", "center"];
  executeGroup.spacing = 10;

  var createBtn = executeGroup.add("button", undefined, "音素配置");
  createBtn.alignment = ["fill", "center"];
  createBtn.enabled = false;

  var deleteMarkersBtn = executeGroup.add("button", undefined, "一括削除");
  deleteMarkersBtn.alignment = ["fill", "center"];

  var setupOpacityBtn = executeGroup.add("button", undefined, "口パク設定");
  setupOpacityBtn.alignment = ["fill", "center"];

  // ========== イベントハンドラ ==========

  // フレーム調整ヘルパー関数（選択レイヤーのマーカーを移動）
  function adjustMarkersByFrames(frames) {
    var comp = app.project.activeItem;
    if (!comp) {
      alert("コンポジションを選択してください");
      return;
    }

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
      alert("マーカーのあるレイヤーを選択してください");
      return;
    }

    var frameSec = 1 / 30; // デフォルト30fps
    if (comp.frameRate) {
      frameSec = 1 / comp.frameRate;
    }
    var offsetSec = frames * frameSec;

    app.beginUndoGroup("lab2layer: Adjust Markers");

    var totalAdjusted = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var markers = layer.property("Marker");
      var numMarkers = markers.numKeys;

      if (numMarkers === 0) continue;

      // マーカー情報を一時保存
      var markerData = [];
      for (var j = 1; j <= numMarkers; j++) {
        markerData.push({
          time: markers.keyTime(j) + offsetSec,
          value: markers.keyValue(j),
        });
      }

      // 全マーカーを削除
      for (var j = numMarkers; j >= 1; j--) {
        markers.removeKey(j);
      }

      // 新しい時間で再配置
      for (var j = 0; j < markerData.length; j++) {
        markers.setValueAtTime(markerData[j].time, markerData[j].value);
      }

      totalAdjusted += numMarkers;
    }

    app.endUndoGroup();
  }

  // フレーム調整ボタン
  frameMinus.onClick = function () {
    adjustMarkersByFrames(-1);
  };

  framePlus.onClick = function () {
    adjustMarkersByFrames(1);
  };

  // ファイル選択
  browseBtn.onClick = function () {
    labFile = File.openDialog("labファイルを選択", "*.lab");
    if (!labFile) return;

    filePathText.text = decodeURI(labFile.name);

    // labファイルをパース
    labFile.open("r");
    var content = labFile.read();
    labFile.close();

    var phonemeEntries = parseLabPhonemeEntries(content);

    var sortedPhonemes = buildSortedPhonemeList(phonemeEntries);

    // UI更新：既存のチェックボックスをクリア
    phonemeData = [];
    for (var i = phonemeCheckboxGroup.children.length - 1; i >= 0; i--) {
      phonemeCheckboxGroup.remove(phonemeCheckboxGroup.children[i]);
    }

    // チェックボックスを横3列で配置
    var currentRow = null;
    var colCount = 0;

    for (var i = 0; i < sortedPhonemes.length; i++) {
      var item = sortedPhonemes[i];

      if (colCount === 0) {
        currentRow = phonemeCheckboxGroup.add("group");
        currentRow.orientation = "row";
        currentRow.alignment = ["fill", "top"];
        currentRow.alignChildren = ["fill", "center"];
        currentRow.spacing = 5;
      }

      var itemGroup = currentRow.add("group");
      itemGroup.orientation = "row";
      itemGroup.alignment = ["fill", "center"];
      itemGroup.alignChildren = ["left", "center"];
      itemGroup.spacing = 2;

      var cb = itemGroup.add("checkbox", undefined, "");
      cb.value = isCommonPhoneme(item.phoneme);

      var label = itemGroup.add(
        "statictext",
        undefined,
        item.phoneme + "(" + item.count + ")",
      );
      label.minimumSize.width = 50;

      phonemeData.push({
        checkbox: cb,
        phoneme: item.phoneme,
        // ここで元データ参照を保持しておくと、Create 時に再探索せず使える
        data: item.data,
      });

      colCount++;
      if (colCount >= 3) {
        colCount = 0;
      }
    }

    // レイアウトを更新
    phonemeCheckboxGroup.layout.layout(true);
    phonemeListPanel.layout.layout(true);
    tabLab.layout.layout(true);
    win.layout.layout(true);
    win.layout.resize();

    createBtn.enabled = sortedPhonemes.length > 0;
  };

  // 全選択
  selectAllBtn.onClick = function () {
    setPhonemeSelection(function () {
      return true;
    });
  };

  // 全解除
  deselectAllBtn.onClick = function () {
    setPhonemeSelection(function () {
      return false;
    });
  };

  // よく使うものを選択
  selectCommonBtn.onClick = function () {
    setPhonemeSelection(function (item) {
      return isCommonPhoneme(item.phoneme);
    });
  };

  // Phonemeレイヤー作成
  createBtn.onClick = function () {
    var comp = app.project.activeItem;
    if (!comp) {
      alert("コンポジションを選択してください");
      return;
    }

    // 選択された音素のみ抽出
    var selectedPhonemes = [];
    for (var i = 0; i < phonemeData.length; i++) {
      if (!phonemeData[i].checkbox.value) continue;

      for (var j = 0; j < phonemeData[i].data.times.length; j++) {
        selectedPhonemes.push({
          startTime: phonemeData[i].data.times[j].start,
          endTime: phonemeData[i].data.times[j].end,
          phoneme: phonemeData[i].phoneme,
        });
      }
    }

    if (selectedPhonemes.length === 0) {
      alert("少なくとも1つの音素を選択してください");
      return;
    }

    // 時間順にソート
    selectedPhonemes.sort(function (a, b) {
      return a.startTime - b.startTime;
    });

    // セリフの開始時間と終了時間を計算（labファイル内の相対時間）
    var labStartTime = selectedPhonemes[0].startTime;
    var labEndTime = selectedPhonemes[selectedPhonemes.length - 1].endTime;
    var duration = labEndTime - labStartTime;

    // 選択されたレイヤーがあればそれに直接マーカーを追加、なければヌルレイヤーを作成
    var selectedLayers = comp.selectedLayers;
    var targetLayer = null;
    var attachTime = comp.time;

    // 選択レイヤーから音声/映像レイヤーを探す
    for (var i = 0; i < selectedLayers.length; i++) {
      var layer = selectedLayers[i];
      // 音声レイヤーまたはAVレイヤー（映像付き音声）を探す
      if (layer.hasAudio || layer.source instanceof FootageItem) {
        targetLayer = layer;
        attachTime = layer.inPoint;
        break;
      }
    }

    app.beginUndoGroup("lab2layer: Create Phoneme Layer");

    // 音声レイヤーがなければヌルレイヤーを作成
    if (!targetLayer) {
      targetLayer = comp.layers.addNull(duration);
      // labファイル名から拡張子を除いた名前を使用
      var layerName = labFile
        ? decodeURI(labFile.name).replace(/\.lab$/i, "")
        : "音素";
      targetLayer.name = "[Lab] " + layerName;
      targetLayer.startTime = attachTime;
    } else {
      // 既存レイヤーに[Lab]プレフィックスがなければ追加
      if (targetLayer.name.indexOf("[Lab] ") !== 0) {
        targetLayer.name = "[Lab] " + targetLayer.name;
      }
    }

    // オフセット値を取得（ミリ秒→秒に変換）
    var offsetMs = parseFloat(offsetInput.text) || 0;
    var offsetSec = offsetMs / 1000;

    // 既存のマーカーを全て削除
    var markers = targetLayer.property("Marker");
    var numMarkers = markers.numKeys;
    for (var i = numMarkers; i >= 1; i--) {
      markers.removeKey(i);
    }

    // マーカー配置
    for (var i = 0; i < selectedPhonemes.length; i++) {
      var markerTime =
        attachTime + (selectedPhonemes[i].startTime - labStartTime) + offsetSec;
      var newMarker = new MarkerValue(selectedPhonemes[i].phoneme);
      targetLayer.property("Marker").setValueAtTime(markerTime, newMarker);
    }

    app.endUndoGroup();

    var message =
      "音素マーカーを追加: " +
      selectedPhonemes.length +
      "\n" +
      "長さ: " +
      duration.toFixed(2) +
      "s\n" +
      "対象: " +
      targetLayer.name;
    alert(message);
  };

  // 不透明度設定
  setupOpacityBtn.onClick = function () {
    var comp = app.project.activeItem;
    if (!comp) {
      alert("コンポジションを選択してください");
      return;
    }

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
      alert("画像レイヤーを選択してください");
      return;
    }

    var targetCompName = promptForPhonemeComp(comp.name);
    if (!targetCompName) return;

    app.beginUndoGroup("lab2layer: Setup Phoneme Opacity");

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];

      var expr = buildLabNameMatchExpression(targetCompName);
      layer
        .property("ADBE Transform Group")
        .property("ADBE Opacity").expression = expr;

      // レイヤーを表示状態にする
      layer.enabled = true;
    }

    app.endUndoGroup();
    alert(
      "完了: " +
        layers.length +
        " レイヤーにエクスプレッションを設定しました。\n音素ソース: " +
        targetCompName,
    );
  };

  // マーカー削除
  deleteMarkersBtn.onClick = function () {
    var comp = app.project.activeItem;
    if (!comp) {
      alert("コンポジションを選択してください");
      return;
    }

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
      alert("Please select a layer with markers");
      return;
    }

    var totalDeleted = 0;

    app.beginUndoGroup("lab2layer: Delete Markers");

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var markers = layer.property("Marker");
      var numMarkers = markers.numKeys;

      // マーカーを後ろから削除（インデックスがずれないように）
      for (var j = numMarkers; j >= 1; j--) {
        markers.removeKey(j);
        totalDeleted++;
      }

      // マーカーが全て削除されたら[Lab]プレフィックスを削除
      if (numMarkers > 0 && layer.name.indexOf("[Lab] ") === 0) {
        layer.name = layer.name.substring(4);
      }
    }

    app.endUndoGroup();

    if (totalDeleted > 0) {
      alert(
        "Deleted " +
          totalDeleted +
          " markers from " +
          layers.length +
          " layer(s).",
      );
    } else {
      alert("No markers found on selected layer(s).");
    }
  };

  // リサイズ対応
  win.onResizing = win.onResize = function () {
    this.layout.resize();
    if (tabs.selection === tabSelector) resizeGrid();
  };

  // ════════════════════════════════════════════════════════════════
  // 初期化
  // ════════════════════════════════════════════════════════════════

  (function init() {
    var activeComp = getActiveComp();
    var name = activeComp ? activeComp.name : null;
    rebuildDropdown(targetRow.dropdown, name);
    rebuildDropdown(ctrlRow.dropdown, name);
    rebuildList();
  })();

  if (win instanceof Window) {
    win.center();
    win.show();
  } else {
    win.layout.layout(true);
  }
})(this);
