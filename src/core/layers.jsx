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

