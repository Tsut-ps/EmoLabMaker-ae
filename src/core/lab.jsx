// ════════════════════════════════════════════════════════════════
// 口パク（lab）コアロジック: lab解析・音素・口形マッピング（UI非依存）
// 旧 20_tab_lab.jsx から抽出。UI構築/ハンドラは 20_tab_lab.jsx に残す。
// ════════════════════════════════════════════════════════════════

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

// 子音か（母音 a/i/u/e/o や ん・無音・閉じ系＝commonPhonemes 以外の音素）。
// k/s/t/n/h/m/y/r/w や ch/sh/ky… など、ファイルに出てくる子音を拾うのに使う。
function isConsonantPhoneme(name) {
  return !!name && !isCommonPhoneme(name);
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

// ── ファイル一括読み込み用ヘルパー（純粋・テスト可能） ──
// 拡張子を除いた basename（パス区切りも除去）
function fileBaseNoExt(name) {
  var n = String(name);
  var slash = Math.max(n.lastIndexOf("/"), n.lastIndexOf("\\"));
  if (slash >= 0) n = n.substring(slash + 1);
  var dot = n.lastIndexOf(".");
  return dot > 0 ? n.substring(0, dot) : n;
}

function fileExtLower(name) {
  var n = String(name);
  var dot = n.lastIndexOf(".");
  return dot >= 0 ? n.substring(dot + 1).toLowerCase() : "";
}

// File 配列を basename でグループ化し {base, wav, txt, lab} の配列にする。
// 同じ basename の wav/txt/lab をひとまとめにする（出現順を維持）。
function groupFilesByBase(files) {
  var map = {};
  var order = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var nm = decodeURI(f.name);
    var ext = fileExtLower(nm);
    if (ext !== "wav" && ext !== "txt" && ext !== "lab") continue;
    var base = fileBaseNoExt(nm);
    if (!map[base]) {
      map[base] = { base: base, wav: null, txt: null, lab: null };
      order.push(base);
    }
    if (ext === "wav") map[base].wav = f;
    else if (ext === "txt") map[base].txt = f;
    else map[base].lab = f;
  }
  var out = [];
  for (var k = 0; k < order.length; k++) out.push(map[order[k]]);
  return out;
}

// parseLabPhonemeEntries の結果を「出現順の {startTime,endTime,phoneme} 配列」に展開
function flattenLabEntries(entries) {
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    for (var j = 0; j < e.times.length; j++) {
      out.push({
        startTime: e.times[j].start,
        endTime: e.times[j].end,
        phoneme: e.phoneme,
      });
    }
  }
  out.sort(function (a, b) {
    return a.startTime - b.startTime;
  });
  return out;
}

/**
 * targetLayer に音素マーカーを配置する（既存マーカーは全削除してから）。
 * selectedPhonemes は {startTime,endTime,phoneme} の配列（開始時間順）。
 *   autoClose: ラボ終了時刻（最後の endTime）に閉じ音素を自動追加し、
 *              発話後に口を閉じる（末尾の口が開いたまま残るのを防ぐ）。
 * 戻り値: { autoClosed: bool }
 */
function writeLabMarkers(
  targetLayer,
  attachTime,
  labStartTime,
  selectedPhonemes,
  offsetSec,
  autoClose,
) {
  var markers = targetLayer.property("Marker");
  for (var i = markers.numKeys; i >= 1; i--) {
    markers.removeKey(i);
  }
  var firstTime = null;
  var lastTime = null;
  var maxEndRel = null; // ラボ終了の相対時刻（最大 endTime - labStart）
  for (var k = 0; k < selectedPhonemes.length; k++) {
    var markerTime =
      attachTime + (selectedPhonemes[k].startTime - labStartTime) + offsetSec;
    targetLayer
      .property("Marker")
      .setValueAtTime(markerTime, new MarkerValue(selectedPhonemes[k].phoneme));
    if (firstTime === null) firstTime = markerTime;
    lastTime = markerTime;
    var endRel = selectedPhonemes[k].endTime - labStartTime;
    if (maxEndRel === null || endRel > maxEndRel) maxEndRel = endRel;
  }

  // ラボ終了が明確なら、その時刻に閉じ音素を打って発話後に口を閉じる
  var autoClosed = false;
  if (autoClose && firstTime !== null && maxEndRel !== null) {
    var closeTime = attachTime + maxEndRel + offsetSec;
    if (closeTime > lastTime + MARKER_EPSILON) {
      targetLayer
        .property("Marker")
        .setValueAtTime(closeTime, new MarkerValue(LAB_CLOSE_PHONEME));
      autoClosed = true;
    }
  }
  return { autoClosed: autoClosed };
}

// テキストファイルを読む（UTF-8 優先。SJIS 等は文字化けし得る＝簡易版）
function readTextFileBestEffort(file) {
  var s = "";
  try {
    file.open("r");
    file.encoding = "UTF-8";
    s = file.read();
    file.close();
  } catch (e) {
    try {
      file.close();
    } catch (e2) {}
  }
  return s;
}

// 音素列を指定セット(配列)だけに絞り込む。filterArr が空/null なら全て通す。(#M)
function filterPhonemes(phs, filterArr) {
  if (!filterArr || filterArr.length === 0) return phs;
  var allow = {};
  for (var i = 0; i < filterArr.length; i++) allow[filterArr[i]] = true;
  var out = [];
  for (var j = 0; j < phs.length; j++) {
    if (allow[phs[j].phoneme]) out.push(phs[j]);
  }
  return out;
}

// .lab ファイルを読み、target レイヤーに口パクマーカーを配置する
// phonemeFilter: 配置する音素名の配列（省略/空ならすべて）
function placeLabFileOnLayer(
  targetLayer,
  attachTime,
  labFileObj,
  base,
  offsetSec,
  autoClose,
  phonemeFilter,
) {
  var content = "";
  try {
    labFileObj.open("r");
    content = labFileObj.read();
    labFileObj.close();
  } catch (e) {
    return false;
  }
  var phs = filterPhonemes(
    flattenLabEntries(parseLabPhonemeEntries(content)),
    phonemeFilter,
  );
  if (phs.length === 0) return false;
  if (targetLayer.name.indexOf("[Lab] ") !== 0) {
    targetLayer.name = "[Lab] " + base;
  }
  writeLabMarkers(
    targetLayer,
    attachTime,
    phs[0].startTime,
    phs,
    offsetSec,
    autoClose,
  );
  return true;
}

// 1グループ（同名の wav/txt/lab）をコンプに配置する（方式A）。
// opts: { lab, txt, wav, offsetSec, autoClose }
function importGroupFiles(comp, attachTime, group, opts) {
  var rep = { wav: 0, txt: 0, lab: 0 };
  var audioLayer = null;
  if (opts.wav && group.wav && group.wav.exists) {
    try {
      var item = app.project.importFile(new ImportOptions(group.wav));
      audioLayer = comp.layers.add(item);
      audioLayer.startTime = attachTime;
      rep.wav++;
    } catch (e) {}
  }
  if (opts.lab && group.lab && group.lab.exists) {
    var target = audioLayer;
    if (!target) {
      target = comp.layers.addNull(comp.duration);
      target.startTime = attachTime;
    }
    if (
      placeLabFileOnLayer(
        target,
        attachTime,
        group.lab,
        group.base,
        opts.offsetSec,
        opts.autoClose,
        opts.phonemeFilter,
      )
    ) {
      rep.lab++;
    }
  }
  if (opts.txt && group.txt && group.txt.exists) {
    try {
      var t = readTextFileBestEffort(group.txt);
      if (t.length > 0) {
        var tl = comp.layers.addText(t);
        tl.startTime = attachTime;
        rep.txt++;
      }
    } catch (e3) {}
  }
  return rep;
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

/**
 * 音素レイヤー探索 + 現在音素取得のロジック部分。
 * 口形マッピング式で使う。
 */
function buildPhonemeSnippet(targetCompName, labTag) {
  var tag = labTag || "";
  return [
    'var targetComp = comp("' + escapeExprStr(targetCompName) + '");',
    'var labTag = "' + escapeExprStr(tag) + '";',
    "",
    "function findPhonemeLayer() {",
    "  for (var i = 1; i <= targetComp.numLayers; i++) {",
    "    var layer = targetComp.layer(i);",
    '    if (layer.name.indexOf("[Lab] ") !== 0) continue;',
    // labTag があれば、その文字列を名前に含む [Lab] だけを対象にする（立ち絵ごとの口パク振り分け #B）
    '    if (labTag !== "" && layer.name.indexOf(labTag) < 0) continue;',
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
  labTag,
) {
  var lines = ["// " + LAB_MAP_SIGNATURE];
  if (emoCtx) lines.push("// " + EXPR_SIGNATURE);

  lines = lines
    .concat([
      'var myPhonemes = ",' + escapeExprStr(myCsv) + ',";',
      'var allPhonemes = ",' + escapeExprStr(allCsv) + ',";',
      "var isClosedFallback = " + (isClosedFallback ? "true" : "false") + ";",
    ])
    .concat(buildPhonemeSnippet(phonemeCompName, labTag))
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
      .concat(buildEmoMarkerSnippet(emoCtx.ctrlCompName, emoCtx.targetCompName))
      .concat([
        "var result;",
        "if (speaking) {",
        "  result = shown ? 100 : 0;",
        "} else {",
        "  var ctrlLayer = findCtrlLayer();",
        "  var markerName = getCurrentMarkerName(ctrlLayer);",
        '  result = markerName !== null && ("," + markerName + ",").indexOf("," + thisLayer.name + ",") >= 0 ? 100 : 0;',
        "}",
        "result;",
      ]);
  } else {
    lines.push("speaking ? (shown ? 100 : 0) : (isClosedFallback ? 100 : 0);");
  }

  return lines.join("\n");
}

// [Lab] 音素レイヤーを含むコンポを列挙する
function findLabComps() {
  var out = [];
  var comps = getProjectComps();
  for (var i = 0; i < comps.length; i++) {
    var c = comps[i];
    for (var j = 1; j <= c.numLayers; j++) {
      if (c.layer(j).name.indexOf("[Lab] ") === 0) {
        out.push(c);
        break;
      }
    }
  }
  return out;
}

/**
 * 音素ソース（[Lab] のあるコンポ）を解決して返す。
 *   1 個 → 自動採用
 *   複数 → [Lab] を含むコンポだけから選ばせる（preferName を既定に）
 *   0 個 → [Lab] 未配置でも止めず、全コンポから選ばせる
 *          （合成式は実行時に [Lab] を探すので、後から配置すれば動く）
 * [Lab] があれば「間違ったコンポ指定」を防ぎつつ、配置は必須にしない。
 */
function resolvePhonemeComp(preferName) {
  var labComps = findLabComps();
  if (labComps.length === 1) return labComps[0].name;
  if (labComps.length > 1) {
    var names = [];
    for (var i = 0; i < labComps.length; i++) names.push(labComps[i].name);
    return promptForPhonemeComp(preferName, names);
  }
  // [Lab] 未配置: ブロックせず、配置予定のコンポを選ばせる
  return promptForPhonemeComp(preferName);
}

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

/**
 * items = [{ layer, myCsv, isClosedFallback }] に口形マッピング式を適用する。
 * emoCtx があれば非発話中は表情のラジオ選択にフォールバックする合成式になる。
 * 戻り値: { applied, emoLinked, stale }
 */
function applyMappingToLayers(items, phonemeCompName, allCsv, labTag) {
  var applied = 0;
  var emoLinked = 0;
  var stale = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var emoCtx = null;
    try {
      emoCtx = parseEmoContext(it.layer);
      it.layer.transform.opacity.expression = buildLabMappedExpression(
        phonemeCompName,
        it.myCsv,
        allCsv,
        it.isClosedFallback,
        emoCtx,
        labTag,
      );
      it.layer.enabled = true;
    } catch (e) {
      stale++;
      continue;
    }
    applied++;
    if (emoCtx) emoLinked++;
  }
  return { applied: applied, emoLinked: emoLinked, stale: stale };
}

// ラベルから自動割当用のキーを取り出す（"ん(閉)" → ["ん","閉"]、"あ" → ["あ"]）
function mouthMatchKeys(label) {
  var keys = [];
  var s = String(label || "");
  var before = s.replace(/[(（].*$/, "").replace(/^\s+|\s+$/g, "");
  var inside = "";
  var m = s.match(/[(（]([^)）]*)[)）]/);
  if (m) inside = m[1].replace(/^\s+|\s+$/g, "");
  if (before) keys.push(before);
  if (inside) keys.push(inside);
  if (keys.length === 0 && s) keys.push(s);
  return keys;
}

// 既存マッピング式から myPhonemes / isClosedFallback を取り出す（#K 取込用）
function parseLabMapExpression(expr) {
  if (!expr || expr.indexOf(LAB_MAP_SIGNATURE) < 0) return null;
  var csv = "";
  var m2 = expr.match(/var\s+myPhonemes\s*=\s*",([^"]*),"/);
  if (m2) {
    csv = m2[1];
  }
  var closed = /var\s+isClosedFallback\s*=\s*true/.test(expr);
  var tag = "";
  var mt = expr.match(/var\s+labTag\s*=\s*"([^"]*)"/);
  if (mt) tag = mt[1];
  return { myCsv: csv, isClosedFallback: closed, labTag: tag };
}
