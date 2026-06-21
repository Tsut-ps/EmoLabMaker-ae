// ══════════════════════════════════════════════════════════════════
// グリッドレイアウト計算
// ══════════════════════════════════════════════════════════════════

// panel 引数版（各タブのグリッド/ツリーで使う）
function getPanelMarginOf(panel) {
  var m = panel.margins;
  if (typeof m === "number") return m;
  if (m && typeof m.left === "number") return m.left;
  return PANEL_MARGIN;
}

function getGridColumnsOf(panel, availWidth) {
  var width = availWidth;
  if (width === undefined || width === null) {
    width = panel.size ? panel.size.width : 360;
  }
  var columns = Math.floor(width / (GRID_MIN_BTN_W + GRID_SPACING));
  if (columns < 1) columns = 1;
  if (columns > 4) columns = 4;
  return columns;
}

function getGridButtonWidthOf(panel, columns, availWidth) {
  var panelWidth = availWidth;
  if (panelWidth === undefined || panelWidth === null) {
    panelWidth = panel.size ? panel.size.width : 360;
    panelWidth -= getPanelMarginOf(panel) * 2;
  }
  var bw = Math.floor((panelWidth - (columns - 1) * GRID_SPACING) / columns);
  return bw < GRID_MIN_BTN_W ? GRID_MIN_BTN_W : bw;
}

// ══════════════════════════════════════════════════════════════════
// UI 構築
// ══════════════════════════════════════════════════════════════════

function setCheckColor(textNode, rgba) {
  if (!textNode || !textNode.graphics) return;
  var g = textNode.graphics;
  g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, rgba, 1);
}

function setCheckState(textNode, checked) {
  if (!textNode) return;
  textNode.text = "✓";
  // checked=true は緑、false は目立たないグレー
  setCheckColor(textNode, checked ? [0.1, 0.7, 0.2, 1] : [0.35, 0.35, 0.35, 1]);
}

// PSDタブ用: 候補コンポ(comps)をドロップダウンに並べる。
// comps 省略時は PSD 立ち絵ルート候補（ルート用）。
function rebuildPsdDropdown(dropdown, selectedName, comps) {
  if (!comps) comps = collectPsdRootCandidates();
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
