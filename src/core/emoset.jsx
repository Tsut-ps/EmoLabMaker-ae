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

