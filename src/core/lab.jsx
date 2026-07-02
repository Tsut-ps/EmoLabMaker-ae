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

// usedPhonemes（配置する＝使う音素）のうち、mappedPhonemes（どこかの口形に割当済み
// の音素の集合）に含まれないものを返す。これらは口形未割当＝閉じ口になるため、
// 口形状マッピングのカバレッジ警告に使う。重複は除く。
function findUnmappedPhonemes(usedPhonemes, mappedPhonemes) {
  var mapped = {};
  var i;
  for (i = 0; i < (mappedPhonemes ? mappedPhonemes.length : 0); i++) {
    mapped[mappedPhonemes[i]] = true;
  }
  var out = [];
  var seen = {};
  for (i = 0; i < (usedPhonemes ? usedPhonemes.length : 0); i++) {
    var p = usedPhonemes[i];
    if (!p || mapped[p] || seen[p]) continue;
    seen[p] = true;
    out.push(p);
  }
  return out;
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

  // ラボ終了の絶対時刻（発話の最後＝最大 endTime）。ヌルの尺合わせに使う。
  var endTime = null;
  if (maxEndRel !== null) endTime = attachTime + maxEndRel + offsetSec;

  // ラボ終了が明確なら、その時刻に閉じ音素を打って発話後に口を閉じる
  var autoClosed = false;
  if (autoClose && firstTime !== null && maxEndRel !== null) {
    var closeTime = endTime;
    if (closeTime > lastTime + MARKER_EPSILON) {
      targetLayer
        .property("Marker")
        .setValueAtTime(closeTime, new MarkerValue(LAB_CLOSE_PHONEME));
      autoClosed = true;
    }
  }
  return { autoClosed: autoClosed, endTime: endTime };
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
  var res = writeLabMarkers(
    targetLayer,
    attachTime,
    phs[0].startTime,
    phs,
    offsetSec,
    autoClose,
  );
  // 新規ヌル（音声なしの lab 単体）は、ヌルの尺を lab の終了に合わせる。
  // 音声/映像レイヤー（B方式や wav 付き）はソースの尺を保つため触らない。
  try {
    if (targetLayer.nullLayer && res.endTime != null) {
      if (res.endTime > targetLayer.inPoint) targetLayer.outPoint = res.endTime;
    }
  } catch (eDur) {}
  return true;
}

// lab ファイルの発話長（秒）= 全音素の最大 endTime。字幕を空白へ戻す位置に使う。
function labFileDuration(labFileObj) {
  var content = "";
  try {
    labFileObj.open("r");
    content = labFileObj.read();
    labFileObj.close();
  } catch (e) {
    return 0;
  }
  var entries = parseLabPhonemeEntries(content);
  var maxEnd = 0;
  for (var i = 0; i < entries.length; i++) {
    for (var j = 0; j < entries[i].times.length; j++) {
      if (entries[i].times[j].end > maxEnd) maxEnd = entries[i].times[j].end;
    }
  }
  return maxEnd;
}

// 1グループ（同名の wav/txt/lab）をコンプに配置する（方式A）。
// opts: { wav, lab, offsetSec, autoClose, phonemeFilter, subtitleLayer }
//   wav/lab は常時配置。txt は subtitleLayer（選択中の装飾テキスト）があるときだけ
//   その Source Text に字幕（マーカー＝本文）として付与する。
function importGroupFiles(comp, attachTime, group, opts) {
  var rep = { wav: 0, txt: 0, lab: 0 };
  var audioLayer = null;
  var speechDur = 0; // 字幕を空白へ戻す「発話の長さ」（lab 優先・無ければ音声長）
  if (opts.wav && group.wav && group.wav.exists) {
    try {
      var item = app.project.importFile(new ImportOptions(group.wav));
      audioLayer = comp.layers.add(item);
      audioLayer.startTime = attachTime;
      rep.wav++;
      try {
        if (item.duration > 0) speechDur = item.duration; // フォールバック
      } catch (eD) {}
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
    var labDur = labFileDuration(group.lab);
    if (labDur > 0) speechDur = labDur; // 字幕長は lab の終わりを優先
  }
  if (opts.subtitleLayer && group.txt && group.txt.exists) {
    try {
      var t = readTextFileBestEffort(group.txt);
      if (t.length > 0) {
        applySubtitleMarker(opts.subtitleLayer, attachTime, t);
        // 発話の長さの終わりで字幕を空白に戻す
        if (speechDur > 0) {
          applySubtitleMarker(opts.subtitleLayer, attachTime + speechDur, "");
        }
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

// baseline（最初から出す一般音素）と fileEntries（lab の音素＋出現回数）をマージした
// チェックリスト用配列を返す。各要素 {phoneme, count, data}。
//   - baseline の音素は常に含める（ファイルに無ければ count=0）
//   - ファイル固有（baseline外）の音素は count>0 のものを追加
//   - 並び: common(母音+ん) → baseline の残り → ファイル固有
// これで「一般音素を最初から表示し、lab の音素は確認（count付き）として上乗せ」できる。
function buildMergedPhonemeList(fileEntries, baseline) {
  fileEntries = fileEntries || [];
  baseline = baseline || [];
  var byName = {};
  var i;
  for (i = 0; i < fileEntries.length; i++) {
    var fe = fileEntries[i];
    if (fe && fe.phoneme) byName[fe.phoneme] = fe;
  }
  var out = [];
  var seen = {};
  function push(name) {
    if (!name || seen[name]) return;
    seen[name] = true;
    var e = byName[name];
    out.push({
      phoneme: name,
      count: e ? e.count : 0,
      data: e || { phoneme: name, count: 0 },
    });
  }
  for (i = 0; i < commonPhonemes.length; i++) push(commonPhonemes[i]);
  for (i = 0; i < baseline.length; i++) push(baseline[i]);
  for (i = 0; i < fileEntries.length; i++) {
    if (fileEntries[i] && fileEntries[i].count > 0) push(fileEntries[i].phoneme);
  }
  return out;
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

  // emoCtx（表情登録済みレイヤー）があれば「[Lab]の場所＝音素／それ以外＝表情」の合成式に。
  // 非発話中は制御コンポの表情マーカーに従う（＝表情切替が効く）。
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

/** 削除済みレイヤーを除外しつつ「名前 (親コンポ)」の一覧を返す */
function describeAssignedLayers(layers) {
  var names = [];
  for (var i = layers.length - 1; i >= 0; i--) {
    try {
      var ly = layers[i];
      var label = ly.name;
      // どの立ち絵（親コンポ）の口かが分かるよう所属コンポを併記する
      try {
        var pc = ly.containingComp;
        if (pc) label += " (" + pc.name + ")";
      } catch (eP) {}
      names.unshift(label);
    } catch (e) {
      layers.splice(i, 1); // 削除済みレイヤーを掃除
    }
  }
  return names.length > 0 ? names.join(", ") : "（未割当）";
}

// ── 口パク設定済みレイヤーの調査・解除（目パチと対称のヘルパー） ──

// レイヤーの口パク式から埋め込まれた口パクタグを読む（無ければ ""、口パク未設定なら null）
function readLabTag(layer) {
  var expr = "";
  try {
    expr = layer.transform.opacity.expression;
  } catch (e) {
    return null;
  }
  if (!expr || expr.indexOf(LAB_MAP_SIGNATURE) < 0) return null;
  var key = 'var labTag = "';
  var at = expr.indexOf(key);
  if (at < 0) return "";
  var start = at + key.length;
  var end = expr.indexOf('"', start);
  if (end < 0) return "";
  return expr.substring(start, end);
}

// プロジェクト内の口パク設定済みレイヤーを集める
function findLabMappedLayers() {
  var out = [];
  var comps = getProjectComps();
  for (var c = 0; c < comps.length; c++) {
    var comp = comps[c];
    for (var i = 1; i <= comp.numLayers; i++) {
      var ly = comp.layer(i);
      if (hasOpacitySignature(ly, LAB_MAP_SIGNATURE)) {
        out.push({ comp: comp, layer: ly });
      }
    }
  }
  return out;
}

// 口パク設定済みレイヤーをコンポ単位でまとめる（{ comp, layers, tags }）
function findLabMappedComps() {
  var found = findLabMappedLayers();
  var groups = [];
  var index = {};
  for (var i = 0; i < found.length; i++) {
    var id = found[i].comp.id;
    if (index[id] === undefined) {
      index[id] = groups.length;
      groups.push({ comp: found[i].comp, layers: [], tags: [] });
    }
    var g = groups[index[id]];
    g.layers.push(found[i].layer);
    var t = readLabTag(found[i].layer);
    if (t !== null) {
      var key = t === "" ? "（なし）" : t;
      var dup = false;
      for (var k = 0; k < g.tags.length; k++) {
        if (g.tags[k] === key) {
          dup = true;
          break;
        }
      }
      if (!dup) g.tags.push(key);
    }
  }
  return groups;
}

// 1レイヤーの口パクを解除する（表情登録済みなら表情切替へ戻す）。戻り値: restored か
function removeLabMappingFromLayer(layer) {
  var emoCtx = parseEmoContext(layer);
  if (emoCtx) {
    layer.transform.opacity.expression = buildOpacityExpression(
      emoCtx.ctrlCompName,
      emoCtx.targetCompName,
    );
    return true;
  }
  layer.transform.opacity.expression = "";
  layer.transform.opacity.setValue(100);
  return false;
}

// 指定コンポ内の全口パクレイヤーを解除する
function removeLabMappingFromComp(comp) {
  var removed = 0;
  var restored = 0;
  for (var i = 1; i <= comp.numLayers; i++) {
    var ly = comp.layer(i);
    if (!hasOpacitySignature(ly, LAB_MAP_SIGNATURE)) continue;
    try {
      if (removeLabMappingFromLayer(ly)) restored++;
      removed++;
    } catch (e) {}
  }
  return { removed: removed, restored: restored };
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
      emoCtx = parseEmoContext(it.layer); // 表情登録済みなら非発話中は表情に従う
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

// ════════════════════════════════════════════════════════════════
// 字幕（装飾テキストの Source Text を式＋マーカーで時間ごとに差し替える）
// ════════════════════════════════════════════════════════════════
// 装飾済みテキストレイヤー1枚にスタイル（デザイン）を集約し、Source Text 式が
// レイヤー自身のマーカー（コメント＝本文）を時間ごとに読んで本文だけ差し替える。
// スタイルは1か所（このレイヤー）なので、再デザインすれば全字幕に反映される
// （＝デザイン一元化）。プレビューは重め（毎フレーム評価）→ 後段でベイク機能を追加予定。
// 改行はマーカーコメントに持たせにくいので "\n" トークンで保持し、式側で実改行へ。

// 実改行 → "\n" トークン（マーカーコメント保存用）。式側で実改行(CR)へ戻す。
function escapeSubtitleText(s) {
  return String(s == null ? "" : s).replace(/\r\n|\r|\n/g, "\\n");
}

// Source Text プロパティを matchName で取得する。"Source Text" は「テキスト」グループの
// 配下にあり、名前もローカライズされる（日本語版＝ソーステキスト）ため、レイヤー直下の
// property("Source Text") では取れない。matchName は不変。
function getSourceTextProp(layer) {
  return layer
    .property("ADBE Text Properties")
    .property("ADBE Text Document");
}

// Source Text 用エクスプレッション。文字列を返す（レイヤーの文字スタイルは保持される）。
// マーカーから読めないとき（最初の字幕より前・マーカー無し）は元の文字へフォールバック。
function buildSubtitleExpression() {
  return [
    "// " + SUBTITLE_SIGNATURE,
    "var m = thisLayer.marker;",
    "var s = null;",
    "if (m.numKeys > 0) {",
    "  var i = m.nearestKey(time).index;",
    "  if (m.key(i).time > time) i--;",
    "  if (i >= 1) s = m.key(i).comment;",
    "}",
    "var out;",
    "if (s === null) out = value.text;",
    'else out = s.split("\\\\n").join("\\r");',
    "out;",
  ].join("\n");
}

// テキストレイヤーに字幕式が無ければ付与する（マーカーから本文を引く）。
function ensureSubtitleExpression(layer) {
  var prop = getSourceTextProp(layer);
  var expr = "";
  try {
    expr = prop.expression || "";
  } catch (e) {}
  if (expr.indexOf(SUBTITLE_SIGNATURE) >= 0) return;
  prop.expression = buildSubtitleExpression();
}

// テキストレイヤーの time 位置に字幕マーカー（コメント＝本文）を打ち、字幕式を保証する。
function applySubtitleMarker(layer, time, text) {
  ensureSubtitleExpression(layer);
  layer
    .property("Marker")
    .setValueAtTime(time, new MarkerValue(escapeSubtitleText(text)));
}
