// ════════════════════════════════════════════════════════════════
// ベイク: 表情/口パク/目パチ式 → 不透明度ホールドキーフレーム（UI非依存）
// ════════════════════════════════════════════════════════════════
// 各式の出力は「マーカー・目パチスケジュールから決まる 0/100 の階段関数」。
// 値が変わり得る時刻（イベント）はマーカー時刻・レイヤー in/out・目パチの位相境界だけなので、
// スクリプト側で正確に列挙してホールド KF に焼き込める（式のサンプリング不要＝フレームレート非依存で厳密）。
// ベイク後は expressionEnabled=false で式を無効化し、「ベイク解除」でキーフレームを削除して式評価へ戻す（可逆）。
// 必要なパラメータは適用済みの式テキストから逆パースする（emo は parseEmoContext を再利用。lab/blink は本ファイルのパーサ）。

// ── 式からのパラメータ逆パース ──────────────────────────────────

// 式内の文字列リテラルを取り出して unescape する（見つからなければ null）
function matchExprStr(expr, re) {
  var m = expr.match(re);
  return m ? unescapeExprStr(m[1]) : null;
}

/** 口形マッピング式から埋め込みパラメータを読み取る（解析不能なら null） */
function parseLabMapContext(layer) {
  var expr = "";
  try {
    expr = layer.transform.opacity.expression;
  } catch (e) {
    return null;
  }
  if (!expr || expr.indexOf(LAB_MAP_SIGNATURE) < 0) return null;

  // myPhonemes/allPhonemes は式と同じ「",a,e,"（前後カンマ付き）」のまま保持し、
  // membership 判定 indexOf("," + p + ",") をそのまま再現する
  var my = matchExprStr(expr, /var myPhonemes = "((?:\\.|[^"\\])*)";/);
  var all = matchExprStr(expr, /var allPhonemes = "((?:\\.|[^"\\])*)";/);
  var closed = expr.match(/var isClosedFallback = (true|false);/);
  var compName = matchExprStr(expr, /var targetComp = comp\("((?:\\.|[^"\\])*)"\);/);
  var tag = matchExprStr(expr, /var labTag = "((?:\\.|[^"\\])*)";/);
  if (my === null || all === null || !closed || compName === null || tag === null) {
    return null;
  }
  return {
    phonemeCompName: compName,
    labTag: tag,
    myPhonemes: my,
    allPhonemes: all,
    isClosedFallback: closed[1] === "true",
    emoCtx: parseEmoContext(layer),
  };
}

/** 目パチ式から埋め込みパラメータを読み取る（解析不能なら null） */
function parseBlinkContext(layer) {
  var expr = "";
  try {
    expr = layer.transform.opacity.expression;
  } catch (e) {
    return null;
  }
  if (!expr || expr.indexOf(BLINK_SIGNATURE) < 0) return null;

  var role = expr.match(/var role = "(open|mid|closed)";/);
  var hasMid = expr.match(/var hasMid = (true|false);/);
  var interval = expr.match(/var interval = ([0-9.eE+\-]+);/);
  var speed = expr.match(/var speed = ([0-9.eE+\-]+);/);
  var hold = expr.match(/var hold = ([0-9.eE+\-]+);/);
  var jitter = expr.match(/var jitter = ([0-9.eE+\-]+);/);
  if (!role || !hasMid || !interval || !speed || !hold || !jitter) return null;

  var emoCtx = parseEmoContext(layer);
  var openNames = [];
  if (emoCtx) {
    // 現行: 配列リテラル var openNames = ["あ","い"];
    var arr = expr.match(/var openNames = \[([^\n]*)\];/);
    if (arr) {
      var re = /"((?:\\.|[^"\\])*)"/g;
      var m;
      while ((m = re.exec(arr[1])) !== null) openNames.push(unescapeExprStr(m[1]));
    } else {
      // 旧形式(〜v2.13.2): CSV 文字列 var openNames = ",あ,い,";
      var csv = matchExprStr(expr, /var openNames = "((?:\\.|[^"\\])*)";/);
      if (csv === null) return null;
      var parts = csv.split(",");
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] !== "") openNames.push(parts[i]);
      }
    }
  }
  return {
    role: role[1],
    hasMid: hasMid[1] === "true",
    interval: parseFloat(interval[1]),
    speed: parseFloat(speed[1]),
    hold: parseFloat(hold[1]),
    jitter: parseFloat(jitter[1]),
    openNames: openNames,
    emoCtx: emoCtx,
  };
}

// ── イベント時刻の収集 ──────────────────────────────────────────

function pushEventTime(times, t, endTime) {
  if (t === null || t === undefined || isNaN(t)) return;
  if (t < 0) return; // 負時刻の切替は 0 時点の評価に含まれる
  if (t > endTime) return;
  times.push(t);
}

function sortUniqueTimes(times) {
  times.sort(function (a, b) {
    return a - b;
  });
  var out = [];
  for (var i = 0; i < times.length; i++) {
    if (out.length === 0 || times[i] - out[out.length - 1] > MARKER_EPSILON) {
      out.push(times[i]);
    }
  }
  return out;
}

/** 階段列 [{t, ...}] から時刻 t で有効なエントリ値を返す（floor 検索） */
function timelineValueAt(timeline, t, field) {
  var v = null;
  for (var i = 0; i < timeline.length; i++) {
    if (timeline[i].t > t + MARKER_EPSILON) break;
    v = timeline[i][field];
  }
  return v;
}

// ── 表情タイムライン ────────────────────────────────────────────

/**
 * (制御コンポ, ターゲット名) の「時刻 → 表示中集合(マーカーコメント / null)」
 * の階段列。イベント = 同名制御レイヤーの in/out とマーカー時刻。
 * 各イベント時刻で式 findCtrlLayer + getCurrentMarkerName と同じ判定を
 * スクリプト側（findCtrlLayerInComp / getCurrentMarkerNameAt）で評価する。
 */
function buildEmoTimeline(ctrlComp, targetCompName, endTime) {
  var ctrlName = getCtrlLayerName(targetCompName);
  var times = [0];
  for (var i = 1; i <= ctrlComp.numLayers; i++) {
    var ly = ctrlComp.layer(i);
    if (ly.name !== ctrlName) continue;
    pushEventTime(times, ly.inPoint, endTime);
    pushEventTime(times, ly.outPoint, endTime);
    var marker = ly.property("Marker");
    for (var k = 1; k <= marker.numKeys; k++) {
      pushEventTime(times, marker.keyTime(k), endTime);
    }
  }
  times = sortUniqueTimes(times);
  var out = [];
  for (var t = 0; t < times.length; t++) {
    var ctrlLayer = findCtrlLayerInComp(ctrlComp, targetCompName, times[t]);
    var name = getCurrentMarkerNameAt(ctrlLayer, times[t]);
    if (out.length === 0 || out[out.length - 1].set !== name) {
      out.push({ t: times[t], set: name });
    }
  }
  return out;
}

/** 式と同じ集合 membership 判定（null = マーカー無し → 非表示） */
function emoSetContains(setStr, layerName) {
  if (setStr === null) return false;
  return ("," + setStr + ",").indexOf("," + layerName + ",") >= 0;
}

// ── 口パクタイムライン ──────────────────────────────────────────

/** 式 findPhonemeLayer + getPhoneme と同じ判定のスクリプト版 */
function labPhonemeAt(phonemeComp, labTag, time) {
  for (var i = 1; i <= phonemeComp.numLayers; i++) {
    var ly = phonemeComp.layer(i);
    var nm = ly.name;
    if (nm.indexOf("[Lab] ") !== 0) continue;
    if (labTag !== "" && nm.indexOf(labTag) < 0) continue;
    if (time < ly.inPoint || time >= ly.outPoint) continue;
    var marker = ly.property("Marker");
    if (marker.numKeys === 0) continue;
    // 最初に一致した [Lab] レイヤーで確定（式と同じ）。最初のマーカーより前は null
    var name = null;
    for (var k = 1; k <= marker.numKeys; k++) {
      if (marker.keyTime(k) > time + MARKER_EPSILON) break;
      name = marker.keyValue(k).comment;
    }
    return name;
  }
  return null;
}

/** (音素コンポ, labTag) の「時刻 → 現在音素(null=非発話)」の階段列 */
function buildLabTimeline(phonemeComp, labTag, endTime) {
  var times = [0];
  for (var i = 1; i <= phonemeComp.numLayers; i++) {
    var ly = phonemeComp.layer(i);
    var nm = ly.name;
    if (nm.indexOf("[Lab] ") !== 0) continue;
    if (labTag !== "" && nm.indexOf(labTag) < 0) continue;
    var marker = ly.property("Marker");
    if (marker.numKeys === 0) continue;
    pushEventTime(times, ly.inPoint, endTime);
    pushEventTime(times, ly.outPoint, endTime);
    for (var k = 1; k <= marker.numKeys; k++) {
      pushEventTime(times, marker.keyTime(k), endTime);
    }
  }
  times = sortUniqueTimes(times);
  var out = [];
  for (var t = 0; t < times.length; t++) {
    var ph = labPhonemeAt(phonemeComp, labTag, times[t]);
    if (out.length === 0 || out[out.length - 1].phoneme !== ph) {
      out.push({ t: times[t], phoneme: ph });
    }
  }
  return out;
}

// ── 目パチスケジュール（式と同じ純粋計算のスクリプト版） ────────

function blinkRndAt(n) {
  var x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function blinkTimeOfCycle(n, p) {
  return n * p.interval + p.interval * (0.5 + (blinkRndAt(n) * 2 - 1) * p.jitter * 0.5);
}

function blinkPhaseForAt(t, b, p) {
  if (t < b) return 0;
  if (t < b + p.speed) return 1;
  if (t < b + p.speed + p.hold) return 2;
  if (t < b + p.speed + p.hold + p.speed) return 1;
  return 0;
}

function blinkPhaseAt(t, p) {
  var c = Math.floor(t / p.interval);
  var phase = Math.max(
    blinkPhaseForAt(t, blinkTimeOfCycle(c, p), p),
    blinkPhaseForAt(t, blinkTimeOfCycle(c - 1, p), p),
  );
  if (!p.hasMid && phase === 1) phase = 2;
  return phase;
}

/** 位相が変わり得る時刻（各サイクルの瞬き開始/閉じ/開き境界）を列挙 */
function blinkEventTimes(p, endTime) {
  var times = [0];
  var maxCycle = Math.floor(endTime / p.interval) + 1;
  for (var n = -1; n <= maxCycle; n++) {
    var b = blinkTimeOfCycle(n, p);
    pushEventTime(times, b, endTime);
    pushEventTime(times, b + p.speed, endTime);
    pushEventTime(times, b + p.speed + p.hold, endTime);
    pushEventTime(times, b + p.speed + p.hold + p.speed, endTime);
  }
  return times;
}

// ── 各式の時刻 t での値（式ロジックのスクリプト版） ─────────────

function labValueAt(ctx, phoneme, emoSet, layerName) {
  var speaking = phoneme !== null;
  if (speaking) {
    var shown = false;
    if (ctx.myPhonemes.indexOf("," + phoneme + ",") >= 0) shown = true;
    if (ctx.isClosedFallback && ctx.allPhonemes.indexOf("," + phoneme + ",") < 0) {
      shown = true;
    }
    return shown ? 100 : 0;
  }
  if (ctx.emoCtx) return emoSetContains(emoSet, layerName) ? 100 : 0;
  return ctx.isClosedFallback ? 100 : 0;
}

function blinkValueAt(ctx, t, emoSet, layerName) {
  var phase = blinkPhaseAt(t, ctx);
  var rolePhase = 2;
  if (ctx.role === "open") rolePhase = 0;
  else if (ctx.role === "mid") rolePhase = 1;
  if (!ctx.emoCtx) return phase === rolePhase ? 100 : 0;

  var blinkEnabled = false;
  if (emoSet !== null) {
    var ms = "," + emoSet + ",";
    for (var i = 0; i < ctx.openNames.length; i++) {
      if (ms.indexOf("," + ctx.openNames[i] + ",") >= 0) {
        blinkEnabled = true;
        break;
      }
    }
  }
  if (emoSet === null || emoSet === "" || blinkEnabled) {
    return phase === rolePhase ? 100 : 0;
  }
  return emoSetContains(emoSet, layerName) ? 100 : 0;
}

// ── キーフレーム書き込み / レイヤー単位のベイク ─────────────────

/** 不透明度に既存キーを全削除してからホールド KF を書き込む */
function writeHoldKeys(prop, times, values) {
  for (var i = prop.numKeys; i >= 1; i--) prop.removeKey(i);
  if (times.length === 0) {
    times = [0];
    values = [0];
  }
  prop.setValuesAtTimes(times, values);
  for (var k = 1; k <= prop.numKeys; k++) {
    prop.setInterpolationTypeAtKey(
      k,
      KeyframeInterpolationType.HOLD,
      KeyframeInterpolationType.HOLD,
    );
  }
}

/** イベント列を「値が変わる時刻だけ」に間引いて {times, values} を返す */
function collapseEventKeys(times, valueAtFn) {
  var outT = [];
  var outV = [];
  for (var i = 0; i < times.length; i++) {
    var v = valueAtFn(times[i]);
    if (outV.length === 0 || outV[outV.length - 1] !== v) {
      outT.push(times[i]);
      outV.push(v);
    }
  }
  return { times: outT, values: outV };
}

function getEmoTimelineCached(cache, ctrlCompName, targetCompName, endTime) {
  var key = ctrlCompName + "\n" + targetCompName + "\n" + endTime;
  if (cache[key] === undefined) {
    var ctrlComp = findCompByName(ctrlCompName);
    cache[key] = ctrlComp
      ? buildEmoTimeline(ctrlComp, targetCompName, endTime)
      : null;
  }
  return cache[key];
}

function getLabTimelineCached(cache, phonemeCompName, labTag, endTime) {
  var key = phonemeCompName + "\n" + labTag + "\n" + endTime;
  if (cache[key] === undefined) {
    var phonemeComp = findCompByName(phonemeCompName);
    cache[key] = phonemeComp
      ? buildLabTimeline(phonemeComp, labTag, endTime)
      : null;
  }
  return cache[key];
}

/** 表情式レイヤーをベイク。戻り値: KF 数（解析不能なら null） */
function bakeEmoLayer(layer, comp, emoCache) {
  var ctx = parseEmoContext(layer);
  if (!ctx) return null;
  var tl = getEmoTimelineCached(emoCache, ctx.ctrlCompName, ctx.targetCompName, comp.duration);
  if (!tl) return null;
  var layerName = layer.name;
  var keys = collapseEventKeys(
    (function () {
      var ts = [];
      for (var i = 0; i < tl.length; i++) ts.push(tl[i].t);
      return ts;
    })(),
    function (t) {
      return emoSetContains(timelineValueAt(tl, t, "set"), layerName) ? 100 : 0;
    },
  );
  var prop = layer.transform.opacity;
  writeHoldKeys(prop, keys.times, keys.values);
  prop.expressionEnabled = false;
  return keys.times.length;
}

/** 口形マッピング式レイヤーをベイク。戻り値: KF 数（解析不能なら null） */
function bakeLabLayer(layer, comp, emoCache, labCache) {
  var ctx = parseLabMapContext(layer);
  if (!ctx) return null;
  var labTl = getLabTimelineCached(labCache, ctx.phonemeCompName, ctx.labTag, comp.duration);
  if (!labTl) return null;
  var emoTl = null;
  if (ctx.emoCtx) {
    emoTl = getEmoTimelineCached(emoCache, ctx.emoCtx.ctrlCompName, ctx.emoCtx.targetCompName, comp.duration);
    if (!emoTl) return null;
  }
  var times = [];
  var i;
  for (i = 0; i < labTl.length; i++) times.push(labTl[i].t);
  if (emoTl) {
    for (i = 0; i < emoTl.length; i++) times.push(emoTl[i].t);
  }
  times = sortUniqueTimes(times);
  var layerName = layer.name;
  var keys = collapseEventKeys(times, function (t) {
    var phoneme = timelineValueAt(labTl, t, "phoneme");
    var emoSet = emoTl ? timelineValueAt(emoTl, t, "set") : null;
    return labValueAt(ctx, phoneme, emoSet, layerName);
  });
  var prop = layer.transform.opacity;
  writeHoldKeys(prop, keys.times, keys.values);
  prop.expressionEnabled = false;
  return keys.times.length;
}

/** 目パチ式レイヤーをベイク。戻り値: KF 数（解析不能なら null） */
function bakeBlinkLayer(layer, comp, emoCache) {
  var ctx = parseBlinkContext(layer);
  if (!ctx) return null;
  var emoTl = null;
  if (ctx.emoCtx) {
    emoTl = getEmoTimelineCached(emoCache, ctx.emoCtx.ctrlCompName, ctx.emoCtx.targetCompName, comp.duration);
    if (!emoTl) return null;
  }
  var times = blinkEventTimes(ctx, comp.duration);
  if (emoTl) {
    for (var i = 0; i < emoTl.length; i++) times.push(emoTl[i].t);
  }
  times = sortUniqueTimes(times);
  var layerName = layer.name;
  var keys = collapseEventKeys(times, function (t) {
    var emoSet = emoTl ? timelineValueAt(emoTl, t, "set") : null;
    return blinkValueAt(ctx, t, emoSet, layerName);
  });
  var prop = layer.transform.opacity;
  writeHoldKeys(prop, keys.times, keys.values);
  prop.expressionEnabled = false;
  return keys.times.length;
}

/**
 * ベイク中リネームの修復。
 * AE はコンポをリネームすると式内の comp("名前") を自動更新するが、
 * ベイクで無効化（expressionEnabled=false）された式のテキストは更新されない。
 * 再ベイク／ベイク解除の前に、参照先が実在しない comp("名前") を実物から特定して
 * 式テキストを補正する。特定できなければそのまま（従来挙動＝スキップ扱い）。
 */
// 迷子になった名前の解決先を決める。候補 1 つ＝自動採用 / 複数＝選択ダイアログ / 0 ＝諦め（null）。
// 結果は cache（1 回のベイク/解除の実行単位）に覚え、同じ名前で何度もダイアログを出さない
function resolveRenamedComp(cache, kind, oldName, candidates) {
  // キーには候補リストも含める。同名の旧コンポが複数あった場合（AE はコンポの同名重複を許す）、
  // ターゲットごとに候補が異なり得るため、旧名だけをキーにすると別ターゲットへ誤った解決結果を流用してしまう
  var key = kind + "\n" + oldName + "\n" + candidates.join("\n");
  if (cache[key] !== undefined) return cache[key];
  var resolved = null;
  if (candidates.length === 1) {
    resolved = candidates[0];
  } else if (candidates.length > 1) {
    resolved = promptCompSelection(
      "ベイク中にコンポ名が変更されたようです。\n" +
        "「" +
        oldName +
        "」（" +
        kind +
        "）の参照先を選択してください:",
      candidates,
      candidates[0],
    );
  }
  cache[key] = resolved;
  return resolved;
}

function repairExpressionCompRefs(layer, cache) {
  var prop;
  var expr;
  try {
    prop = layer.transform.opacity;
    expr = prop.expression;
  } catch (e) {
    return;
  }
  if (!expr) return;
  cache = cache || {};
  var changed = false;

  // 表情（合成式の表情部分を含む）: 制御コンポ名。
  // 実物は「[Emo] <ターゲット名> レイヤーを持つコンポ」から特定（名前非依存）。
  // ターゲット名はコンポ名一意化により通常 1 件だが、旧制御に [Emo] が残っている等で複数ヒットしたら選択させる
  var emoCtx = parseEmoContext(layer);
  if (emoCtx && !findCompByName(emoCtx.ctrlCompName)) {
    var hits = [];
    var comps = getProjectComps();
    for (var i = 0; i < comps.length; i++) {
      if (findCtrlLayerInComp(comps[i], emoCtx.targetCompName, 0)) {
        hits.push(comps[i].name);
      }
    }
    var newCtrl = resolveRenamedComp(cache, "制御コンポ", emoCtx.ctrlCompName, hits);
    if (newCtrl) {
      expr = expr
        .split(escapeExprStr(emoCtx.ctrlCompName))
        .join(escapeExprStr(newCtrl));
      changed = true;
    }
  }

  // 口パク: 音素コンポ名。[Lab] を持つコンポから特定（複数なら選択させる）
  var labCtx = parseLabMapContext(layer);
  if (labCtx && !findCompByName(labCtx.phonemeCompName)) {
    var labComps = findLabComps();
    var labNames = [];
    for (var L = 0; L < labComps.length; L++) labNames.push(labComps[L].name);
    var newPhoneme = resolveRenamedComp(
      cache,
      "音素コンポ",
      labCtx.phonemeCompName,
      labNames,
    );
    if (newPhoneme) {
      expr = expr
        .split(escapeExprStr(labCtx.phonemeCompName))
        .join(escapeExprStr(newPhoneme));
      changed = true;
    }
  }

  if (changed) {
    // 式の代入が expressionEnabled を変えないよう、元の状態を保って書き戻す
    var wasEnabled = true;
    try {
      wasEnabled = prop.expressionEnabled;
    } catch (e2) {}
    prop.expression = expr;
    try {
      prop.expressionEnabled = wasEnabled;
    } catch (e3) {}
  }
}

/**
 * レイヤーの現在の式種別を判定して即ベイクする。
 * ベイク済みレイヤーへ式を再適用したとき（setOpacityExpression）に、
 * ベイク状態を維持したまま新しい内容を反映するために使う。
 * 戻り値: KF 数（対象外/解析不能なら null = ライブ式のまま）
 */
function bakeLayerAuto(layer) {
  var comp = null;
  try {
    comp = layer.containingComp;
  } catch (e) {
    return null;
  }
  if (!comp) return null;
  var expr = "";
  try {
    expr = layer.transform.opacity.expression;
  } catch (e2) {
    return null;
  }
  if (!expr) return null;
  repairExpressionCompRefs(layer); // ベイク中リネームの参照補正
  if (expr.indexOf(LAB_MAP_SIGNATURE) >= 0) return bakeLabLayer(layer, comp, {}, {});
  if (expr.indexOf(BLINK_SIGNATURE) >= 0) return bakeBlinkLayer(layer, comp, {});
  if (expr.indexOf(EXPR_SIGNATURE) >= 0) return bakeEmoLayer(layer, comp, {});
  return null;
}

// ── プロジェクト全体のベイク / ベイク解除 ───────────────────────

/**
 * プロジェクト内の全対象レイヤー（表情/口パク/目パチ式）をベイクする。
 * 戻り値: { emo, lab, blink, keys, comps, skipped }
 * undo group は呼び出し側で張ること。
 */
function bakeAllExpressions() {
  var report = { emo: 0, lab: 0, blink: 0, keys: 0, comps: 0, skipped: 0 };
  var emoCache = {};
  var labCache = {};
  var repairCache = {}; // リネーム補正の解決結果（同じ名前で何度も聞かない）
  var comps = getProjectComps();
  for (var c = 0; c < comps.length; c++) {
    var comp = comps[c];
    var touched = false;
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var expr = "";
      try {
        expr = layer.transform.opacity.expression;
      } catch (e) {
        continue;
      }
      if (!expr) continue;
      // 合成式は emo 署名も含むため、lab/blink を先に判定する
      var isLab = expr.indexOf(LAB_MAP_SIGNATURE) >= 0;
      var isBlink = !isLab && expr.indexOf(BLINK_SIGNATURE) >= 0;
      var isEmo = !isLab && !isBlink && expr.indexOf(EXPR_SIGNATURE) >= 0;
      if (!isLab && !isBlink && !isEmo) continue;
      // ベイク中にコンポがリネームされた場合の参照補正（無効化中の式は AE の自動リネームから漏れるため）
      repairExpressionCompRefs(layer, repairCache);
      var keyCount = null;
      try {
        if (isLab) keyCount = bakeLabLayer(layer, comp, emoCache, labCache);
        else if (isBlink) keyCount = bakeBlinkLayer(layer, comp, emoCache);
        else keyCount = bakeEmoLayer(layer, comp, emoCache);
      } catch (eBake) {
        keyCount = null;
      }
      if (keyCount === null) {
        report.skipped++;
        continue;
      }
      report.keys += keyCount;
      if (isLab) report.lab++;
      else if (isBlink) report.blink++;
      else report.emo++;
      touched = true;
    }
    if (touched) report.comps++;
  }
  return report;
}

/**
 * ベイク済みレイヤー（署名付き式が無効化されているもの）の KF を削除して
 * 式評価へ戻す。戻り値: { restored, comps }
 * undo group は呼び出し側で張ること。
 */
function unbakeAllExpressions() {
  var report = { restored: 0, comps: 0 };
  var repairCache = {}; // リネーム補正の解決結果（同じ名前で何度も聞かない）
  var comps = getProjectComps();
  for (var c = 0; c < comps.length; c++) {
    var comp = comps[c];
    var touched = false;
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var prop;
      var expr = "";
      try {
        prop = layer.transform.opacity;
        expr = prop.expression;
      } catch (e) {
        continue;
      }
      if (!expr) continue;
      if (
        expr.indexOf(LAB_MAP_SIGNATURE) < 0 &&
        expr.indexOf(BLINK_SIGNATURE) < 0 &&
        expr.indexOf(EXPR_SIGNATURE) < 0
      ) {
        continue;
      }
      if (prop.expressionEnabled) continue; // ベイクされていない
      try {
        // ベイク中にコンポがリネームされていたら、式を有効化する前に参照を補正
        repairExpressionCompRefs(layer, repairCache);
        for (var k = prop.numKeys; k >= 1; k--) prop.removeKey(k);
        prop.setValue(100);
        prop.expressionEnabled = true;
        report.restored++;
        touched = true;
      } catch (eR) {}
    }
    if (touched) report.comps++;
  }
  return report;
}
