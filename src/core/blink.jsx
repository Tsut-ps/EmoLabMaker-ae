// ════════════════════════════════════════════════════════════════
// 目パチ（自動まばたき）コアロジック
// 旧 30_tab_psd.jsx から抽出（UI非依存）。
// ════════════════════════════════════════════════════════════════

/**
 * 自動まばたきのエクスプレッションを生成する。
 * マーカー不要の time ベース。seedRandom をサイクル番号で固定するため、
 * 開き/中間/閉じの全レイヤーが同一スケジュールを共有する（レイヤー間同期）。
 *
 * emoCtx あり: 現在の表情マーカーが「開き目」(openNamesCsv) のときだけ
 *   まばたきし、それ以外の表情中は表情切替のロジックに従う
 *   （笑い目などで不自然にまばたかない）
 * emoCtx なし: 常にまばたきし、非まばたき中は開き目を表示する
 */
function buildBlinkExpression(params, role, hasMid, openNamesCsv, emoCtx) {
  var lines = ["// " + BLINK_SIGNATURE];
  if (emoCtx) lines.push("// " + EXPR_SIGNATURE);

  lines = lines.concat([
    'var role = "' + role + '";',
    "var hasMid = " + (hasMid ? "true" : "false") + ";",
    "var interval = " + params.interval + ";",
    "var speed = " + params.speed + ";",
    "var hold = " + params.hold + ";",
    "var jitter = " + params.jitter + ";",
  ]);

  if (emoCtx) {
    lines.push('var openNames = ",' + escapeExprStr(openNamesCsv) + ',";');
    lines = lines.concat(
      buildEmoMarkerSnippet(emoCtx.ctrlCompName, emoCtx.targetCompName),
    );
  }

  lines = lines.concat([
    // 乱数は seedRandom/random（レイヤー依存になり得る）を使わず、n だけの純粋な
    // ハッシュにする。これで全レイヤー（開き/中間/閉じ）が必ず同一の瞬き時刻を共有し、
    // 同期が崩れて隙間や重なりが出るのを防ぐ。
    "function rndAt(n) {",
    "  var x = Math.sin(n * 12.9898) * 43758.5453;",
    "  return x - Math.floor(x);",
    "}",
    "function blinkAt(n) {",
    "  return n * interval + interval * (0.5 + (rndAt(n) * 2 - 1) * jitter * 0.5);",
    "}",
    "function phaseFor(b) {",
    "  if (time < b) return 0;",
    "  if (time < b + speed) return 1;",
    "  if (time < b + speed + hold) return 2;",
    "  if (time < b + speed + hold + speed) return 1;",
    "  return 0;",
    "}",
    "var cycle = Math.floor(time / interval);",
    "var phase = Math.max(phaseFor(blinkAt(cycle)), phaseFor(blinkAt(cycle - 1)));",
    "if (!hasMid && phase === 1) phase = 2;",
    // このレイヤーが受け持つ位相（開き=0 / 中間=1 / 閉じ=2）。
    // phase は単一値なので「phase === rolePhase」で必ず1枚だけが一致＝排他確定。
    // ネストした三項演算子は誤評価され得るので if/else で明示する。
    "var rolePhase = 2;",
    'if (role === "open") rolePhase = 0;',
    'else if (role === "mid") rolePhase = 1;',
  ]);

  if (emoCtx) {
    lines = lines.concat([
      "var ctrlLayer = findCtrlLayer();",
      "var markerName = getCurrentMarkerName(ctrlLayer);",
      // markerName は表示中集合。開き目名のいずれかが集合に含まれていれば瞬きを有効化(積集合判定)
      "var blinkEnabled = false;",
      "if (markerName !== null) {",
      '  var ms = ("," + markerName + ",");',
      '  var on = openNames.split(",");',
      "  for (var bi = 0; bi < on.length; bi++) {",
      '    if (on[bi] !== "" && ms.indexOf("," + on[bi] + ",") >= 0) { blinkEnabled = true; break; }',
      "  }",
      "}",
      "var result;",
      // マーカー未設定/空、または開き目表情が選択中なら、membership は見ず位相だけで
      // 1枚に確定する（開き=phase0 / 中間=phase1 / 閉じ=phase2）。重なり/隙間とも起きない。
      'if (markerName === null || markerName === "" || blinkEnabled) {',
      "  result = (phase === rolePhase) ? 100 : 0;",
      "} else {",
      // 開き目以外が選択されている＝この目を直接指定。集合に自分が居れば表示
      '  result = ("," + markerName + ",").indexOf("," + thisLayer.name + ",") >= 0 ? 100 : 0;',
      "}",
      "result;",
    ]);
  } else {
    lines = lines.concat([
      // 単独まばたき。位相一致で1枚に確定（開き=phase0 / 中間=phase1 / 閉じ=phase2）
      "(phase === rolePhase) ? 100 : 0;",
    ]);
  }

  return lines.join("\n");
}

// 1レイヤーの目パチを解除する（表情登録済みなら表情切替へ戻す）。戻り値: restored か
function removeBlinkFromLayer(layer) {
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

// プロジェクト内の全コンポから目パチ設定済みレイヤーを集める
function findBlinkLayers() {
  var out = [];
  var comps = getProjectComps();
  for (var c = 0; c < comps.length; c++) {
    var comp = comps[c];
    for (var i = 1; i <= comp.numLayers; i++) {
      var ly = comp.layer(i);
      if (hasOpacitySignature(ly, BLINK_SIGNATURE)) {
        out.push({ comp: comp, layer: ly });
      }
    }
  }
  return out;
}

function hasBlinkLayer(comp) {
  for (var i = 1; i <= comp.numLayers; i++) {
    if (hasOpacitySignature(comp.layer(i), BLINK_SIGNATURE)) return true;
  }
  return false;
}

// 目パチ設定済みレイヤーをコンポ（=コンポグループ）単位でまとめる
function findBlinkComps() {
  var found = findBlinkLayers();
  var groups = [];
  var index = {};
  for (var i = 0; i < found.length; i++) {
    var id = found[i].comp.id;
    if (index[id] === undefined) {
      index[id] = groups.length;
      groups.push({ comp: found[i].comp, layers: [] });
    }
    groups[index[id]].layers.push(found[i].layer);
  }
  return groups;
}

// 指定コンポ内の全目パチレイヤーを解除する（開き/中間/閉じをまとめて）
function removeBlinkFromComp(comp) {
  var removedCount = 0;
  var restoredCount = 0;
  for (var i = 1; i <= comp.numLayers; i++) {
    var ly = comp.layer(i);
    if (!hasOpacitySignature(ly, BLINK_SIGNATURE)) continue;
    try {
      if (removeBlinkFromLayer(ly)) restoredCount++;
      removedCount++;
    } catch (e) {}
  }
  return { removed: removedCount, restored: restoredCount };
}
