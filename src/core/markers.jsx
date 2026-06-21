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

