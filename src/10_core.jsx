// ════════════════════════════════════════════════════════════════
//
//  共通基盤: emo2layer マーカー/式・表情セット（各タブで共有）
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
// 制御ヌルを目立たなくする（マーカーは無効レイヤーでも式から読めるので動作に影響なし）。
//   enabled=false : プレビューに枠が出ない・描画されない
//   shy/guideLayer: タイムライン/書き出しから隠す
//   source 名も "[Emo] …" にしてプロジェクトの「ヌル N」散らかりを解消
function hideCtrlLayer(layer, name) {
  try {
    layer.shy = true;
  } catch (e) {}
  try {
    layer.guideLayer = true;
  } catch (e) {}
  try {
    layer.enabled = false;
  } catch (e) {}
  try {
    layer.label = 11;
  } catch (e) {}
  try {
    if (layer.source && layer.source.name !== name) layer.source.name = name;
  } catch (e) {}
}

function createCtrlLayer(ctrlComp, targetCompName, afterLayer) {
  var name = getCtrlLayerName(targetCompName);
  var existing = findCtrlLayerInComp(ctrlComp, targetCompName, 0);
  if (existing) {
    hideCtrlLayer(existing, name); // 既存も毎回隠す（過去に作った可視ヌルの掃除）
    return existing;
  }

  var layer = ctrlComp.layers.addNull(ctrlComp.duration);
  layer.name = name;
  layer.startTime = 0;
  // outPoint をコンプ末尾に合わせる（startTime 操作後に設定）
  try {
    layer.outPoint = ctrlComp.duration;
  } catch (e) {}
  // addNull は新規を最上位(index 1)に積むため、同一セットアップで複数作ると
  // 逆順になる。afterLayer（同じ実行で直前に作ったヌル）の直後へ移すと、
  // 元の「最上位に置く」配置を保ったまま作成順に並ぶ。afterLayer 省略時は
  // 最上位のまま（他の立ち絵の制御を挟まない）。
  if (afterLayer) {
    try {
      layer.moveAfter(afterLayer);
    } catch (eMove) {}
  }
  hideCtrlLayer(layer, name);
  return layer;
}

// ══════════════════════════════════════════════════════════════════
// エクスプレッション
// ══════════════════════════════════════════════════════════════════

// 式へ二重引用符文字列として埋め込む文字列をエスケープする。
// コンポ名・レイヤー名・CSV に " \ 改行 が含まれても式が壊れないようにする。
function escapeExprStr(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n");
}

/**
 * 表情マーカーのロジック部分（制御レイヤー探索 + 現在マーカー名取得）。
 * emo 単独式と、口パク/目パチの合成式で共有する。
 */
function buildEmoMarkerSnippet(ctrlCompName, targetCompName) {
  return [
    'var ctrlComp = comp("' + escapeExprStr(ctrlCompName) + '");',
    'var ctrlName = "' + escapeExprStr(getCtrlLayerName(targetCompName)) + '";',
    // 名前で直接アクセス（全レイヤー走査をやめて再生負荷を大幅に下げる）。
    // 名前一致レイヤーが現在時刻で有効ならそのまま使う（高速パス）。
    // in/out が切られている等で無効なときだけ time 有効な同名レイヤーを探す。
    "function findCtrlLayer() {",
    "  var byName = null;",
    "  try { byName = ctrlComp.layer(ctrlName); } catch (e) { byName = null; }",
    "  if (byName && time >= byName.inPoint && time < byName.outPoint) return byName;",
    "  for (var i = 1; i <= ctrlComp.numLayers; i++) {",
    "    var ly = ctrlComp.layer(i);",
    "    if (ly.name === ctrlName && time >= ly.inPoint && time < ly.outPoint) return ly;",
    "  }",
    "  return byName;",
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
      // markerName は「表示中レイヤー名の集合」(カンマ区切り)。単一名は1要素集合として一致
      'markerName !== null && ("," + markerName + ",").indexOf("," + thisLayer.name + ",") >= 0 ? 100 : 0;',
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
// escapeExprStr の逆変換（式リテラル → 実際の文字列）。
// 1文字ずつ走査して \\ \" \n を正しく復元する。
function unescapeExprStr(s) {
  var str = String(s);
  var out = "";
  for (var i = 0; i < str.length; i++) {
    var c = str.charAt(i);
    if (c === "\\" && i + 1 < str.length) {
      var nx = str.charAt(i + 1);
      if (nx === "n") out += "\n";
      else out += nx; // " や \ はそのまま、それ以外も次文字を採用
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

function parseEmoContext(layer) {
  var expr = "";
  try {
    expr = layer.transform.opacity.expression;
  } catch (e) {
    return null;
  }
  if (!expr || expr.indexOf(EXPR_SIGNATURE) < 0) return null;

  // エスケープ済みリテラル（\" \\ を含みうる）を正しく取り出すため、
  // \. または非"非\ の連続をキャプチャしてから unescape する。
  var compMatch = expr.match(/var ctrlComp = comp\("((?:\\.|[^"\\])*)"\);/);
  var nameMatch = expr.match(/var ctrlName = "((?:\\.|[^"\\])*)";/);
  if (!compMatch || !nameMatch) return null;

  var ctrlCompName = unescapeExprStr(compMatch[1]);
  var ctrlName = unescapeExprStr(nameMatch[1]);
  if (ctrlName.indexOf(CTRL_PREFIX) !== 0) return null;

  return {
    ctrlCompName: ctrlCompName,
    targetCompName: ctrlName.substring(CTRL_PREFIX.length),
  };
}

// ══════════════════════════════════════════════════════════════════
// 登録 / 解除
// ══════════════════════════════════════════════════════════════════

function registerLayers(targetComp, ctrlCompName, layers, undoName) {
  if (!layers || layers.length === 0) return 0;

  var expression = buildOpacityExpression(ctrlCompName, targetComp.name);
  var count = 0;

  beginUndo(undoName || "emo2layer: Register");
  try {
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!layer) continue;
      layer.transform.opacity.expression = expression;
      layer.enabled = true;
      count++;
    }
  } finally {
    endUndo();
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

  beginUndo("emo2layer: Write Marker");
  try {
    removeMarkerAtTime(ctrlLayer, time);
    ctrlLayer
      .property("Marker")
      .setValueAtTime(time, new MarkerValue(markerName));
  } finally {
    endUndo();
  }
  return true;
}

// ── 表示中集合（マーカー）の読み書き ──────────────────────────────
// マーカーコメント = 表示中レイヤー名の集合（カンマ区切り）。
// ラジオ（*）も任意指定（無印）も同じ集合で表現する。
// 名前はプレフィックス付きの完全名で扱う。

function parseSetString(str) {
  var out = [];
  var seen = {};
  if (str === null || str === undefined) return out;
  var parts = String(str).split(",");
  for (var i = 0; i < parts.length; i++) {
    // 手編集等でスペースが混入しても一致するようトリム。空・重複は除外
    var tok = parts[i].replace(/^\s+|\s+$/g, "");
    if (tok.length === 0 || seen[tok]) continue;
    seen[tok] = true;
    out.push(tok);
  }
  return out;
}

function indexOfName(arr, name) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === name) return i;
  }
  return -1;
}

function readVisibleSet(ctrlComp, targetCompName, time) {
  var ctrlLayer = findCtrlLayerInComp(ctrlComp, targetCompName, time);
  return parseSetString(getCurrentMarkerNameAt(ctrlLayer, time));
}

/** 同グループのラジオ候補を集合から除き chosenName のみにする（排他選択） */
function setRadioSelection(
  ctrlComp,
  targetCompName,
  time,
  chosenName,
  radioNames,
) {
  var set = readVisibleSet(ctrlComp, targetCompName, time);
  var next = [];
  for (var i = 0; i < set.length; i++) {
    if (indexOfName(radioNames, set[i]) < 0) next.push(set[i]);
  }
  next.push(chosenName);
  return writeMarkerNameAtTime(ctrlComp, targetCompName, time, next.join(","));
}

/** 指定した名前群を集合からすべて取り除く */
function removeNamesFromSet(ctrlComp, targetCompName, time, names) {
  var set = readVisibleSet(ctrlComp, targetCompName, time);
  var next = [];
  for (var i = 0; i < set.length; i++) {
    if (indexOfName(names, set[i]) < 0) next.push(set[i]);
  }
  return writeMarkerNameAtTime(ctrlComp, targetCompName, time, next.join(","));
}

/** layerName を集合からトグル（独立 ON/OFF） */
function toggleLayerInSet(ctrlComp, targetCompName, time, layerName) {
  var set = readVisibleSet(ctrlComp, targetCompName, time);
  var at = indexOfName(set, layerName);
  if (at >= 0) set.splice(at, 1);
  else set.push(layerName);
  return writeMarkerNameAtTime(ctrlComp, targetCompName, time, set.join(","));
}

// ── 反転バリエーション（:flipx 等）対応の選択肢ヘルパー（純粋・テスト可能） ──
// choice = { fullName(=base 完全名), label, layer, flips:[{suffix, fullName, layer}] }
// base と flip は「同じ要素の通常/反転」で相互排他。集合にはどれか1つだけ入る。

/** base + すべての flip の完全名一覧 */
function choiceAllNames(choice) {
  var out = [choice.fullName];
  if (choice.flips) {
    for (var i = 0; i < choice.flips.length; i++) {
      out.push(choice.flips[i].fullName);
    }
  }
  return out;
}

/** 集合内で現在表示中のバリエーション名（base か flip のどれか）。無ければ null */
function choiceVisibleName(choice, set) {
  var all = choiceAllNames(choice);
  for (var i = 0; i < all.length; i++) {
    if (indexOfName(set, all[i]) >= 0) return all[i];
  }
  return null;
}

/** この選択肢が（base/flip いずれかで）表示中か */
function choiceIsVisible(choice, set) {
  return choiceVisibleName(choice, set) !== null;
}

/** 指定 suffix（""=base）のバリエーション名。無ければ null */
function choiceVariantName(choice, suffix) {
  if (suffix === "" || suffix === null || suffix === undefined) {
    return choice.fullName;
  }
  if (choice.flips) {
    for (var i = 0; i < choice.flips.length; i++) {
      if (choice.flips[i].suffix === suffix) return choice.flips[i].fullName;
    }
  }
  return null;
}

/** グローバル反転状態 flipState を反映した「選ぶべき名前」。無ければ base */
function preferredVariantName(choice, flipState) {
  return choiceVariantName(choice, flipState) || choice.fullName;
}

/** 現在表示中バリエーションの suffix（""=base / null=非表示） */
function choiceVisibleSuffix(choice, set) {
  var vis = choiceVisibleName(choice, set);
  if (vis === null) return null;
  if (vis === choice.fullName) return "";
  if (choice.flips) {
    for (var i = 0; i < choice.flips.length; i++) {
      if (choice.flips[i].fullName === vis) return choice.flips[i].suffix;
    }
  }
  return "";
}

/** ノード内の全ラジオ選択肢の全バリエーション名（排他クリア用） */
function collectRadioVariantNames(node) {
  var names = [];
  for (var i = 0; i < node.radioChoices.length; i++) {
    var all = choiceAllNames(node.radioChoices[i]);
    for (var j = 0; j < all.length; j++) names.push(all[j]);
  }
  return names;
}

// ══════════════════════════════════════════════════════════════════
// 表情セット
// ══════════════════════════════════════════════════════════════════
// 複数グループ（目・口・眉など）の現在マーカーをまとめて保存し、
// ワンクリックで一括書き込みする（PSDTool のお気に入り相当）。
// セットは制御コンポ内の "[EmoSet] <名前>" ガイドレイヤーの
// コメントに「<対象コンポ名>=<マーカー名>」の行形式で保存する
// （プロジェクトと一緒に保存され、持ち運べる）

var SET_PREFIX = "[EmoSet] ";

/** time 時点で有効なマーカー名（エクスプレッションと同じ判定のスクリプト版） */
function getCurrentMarkerNameAt(ctrlLayer, time) {
  if (!ctrlLayer) return null;
  var marker;
  try {
    marker = ctrlLayer.property("Marker");
  } catch (e) {
    return null;
  }
  if (!marker || marker.numKeys === 0) return null;
  var name = null;
  for (var i = 1; i <= marker.numKeys; i++) {
    if (marker.keyTime(i) > time + MARKER_EPSILON) break;
    name = marker.keyValue(i).comment;
  }
  return name;
}

/** 制御コンポ内の全制御レイヤーの現在状態を {target, marker} の配列で返す */
function captureEmoSet(ctrlComp) {
  var entries = [];
  var seen = {};
  var time = ctrlComp.time;
  for (var i = 1; i <= ctrlComp.numLayers; i++) {
    var layer = ctrlComp.layer(i);
    if (layer.name.indexOf(CTRL_PREFIX) !== 0) continue;
    var target = layer.name.substring(CTRL_PREFIX.length);
    if (seen[target]) continue;
    seen[target] = true;
    var ctrlLayer = findCtrlLayerInComp(ctrlComp, target, time);
    var markerName = getCurrentMarkerNameAt(ctrlLayer, time);
    if (markerName === null) continue;
    entries.push({ target: target, marker: markerName });
  }
  return entries;
}

function parseEmoSetComment(comment) {
  var entries = [];
  var lines = String(comment || "").split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var idx = lines[i].indexOf("=");
    if (idx <= 0) continue;
    entries.push({
      target: lines[i].substring(0, idx),
      marker: lines[i].substring(idx + 1),
    });
  }
  return entries;
}

function findEmoSetLayer(ctrlComp, setName) {
  var layerName = SET_PREFIX + setName;
  for (var i = 1; i <= ctrlComp.numLayers; i++) {
    if (ctrlComp.layer(i).name === layerName) return ctrlComp.layer(i);
  }
  return null;
}

function collectEmoSetNames(ctrlComp) {
  var names = [];
  if (!ctrlComp) return names;
  for (var i = 1; i <= ctrlComp.numLayers; i++) {
    var layer = ctrlComp.layer(i);
    if (layer.name.indexOf(SET_PREFIX) === 0) {
      names.push(layer.name.substring(SET_PREFIX.length));
    }
  }
  return names;
}

/** セットを保存（同名があれば上書き） */
function saveEmoSet(ctrlComp, setName, entries) {
  var lines = [];
  for (var i = 0; i < entries.length; i++) {
    lines.push(entries[i].target + "=" + entries[i].marker);
  }

  beginUndo("emo2layer: 表情セット保存");
  try {
    var layer = findEmoSetLayer(ctrlComp, setName);
    if (!layer) {
      layer = ctrlComp.layers.addNull(ctrlComp.duration);
      layer.name = SET_PREFIX + setName;
      layer.startTime = 0;
      try {
        layer.outPoint = ctrlComp.duration;
      } catch (e) {}
      layer.shy = true;
      layer.guideLayer = true;
      layer.enabled = false;
      layer.label = 14;
    }
    layer.comment = lines.join("\n");
  } finally {
    endUndo();
  }
}

/** セットを制御コンポの現在時刻に一括書き込みする */
function applyEmoSet(ctrlComp, setName) {
  var layer = findEmoSetLayer(ctrlComp, setName);
  if (!layer) return null;

  var entries = parseEmoSetComment(layer.comment);
  var applied = 0;
  var missing = 0;

  beginUndo("emo2layer: 表情セット適用");
  try {
    for (var i = 0; i < entries.length; i++) {
      var ok = writeMarkerNameAtTime(
        ctrlComp,
        entries[i].target,
        ctrlComp.time,
        entries[i].marker,
      );
      if (ok) applied++;
      else missing++;
    }
  } finally {
    endUndo();
  }
  return { applied: applied, missing: missing };
}

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
