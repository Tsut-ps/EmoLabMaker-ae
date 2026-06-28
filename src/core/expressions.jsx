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

