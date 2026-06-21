// ════════════════════════════════════════════════════════════════
//
//  タブ「PSD」: PSD セットアップ (PSDToolKit互換)
//
// ════════════════════════════════════════════════════════════════
// PSD の読み込み自体は AE 標準のインポートに任せる（バグ防止のため
// スクリプトからは importFile しない）。読み込み済みのコンポを走査し、
// PSDToolKit の命名規則 (* = 排他 / ! = 強制表示 / :flipx = 反転) を
// 解釈して表情切替をセットアップする。再実行しても壊れない（冪等）

/**
 * PSDToolKit の命名規則を解釈する。
 * prefix の * / ! は順不同・複合可（例: "*!笑い"）
 */
function parsePsdLayerName(name) {
  var base = String(name || "");
  var exclusive = false;
  var forced = false;
  var flipx = false;
  var flipy = false;

  var stripping = true;
  while (stripping && base.length > 0) {
    var head = base.charAt(0);
    if (head === "*") {
      exclusive = true;
      base = base.substring(1);
    } else if (head === "!") {
      forced = true;
      base = base.substring(1);
    } else {
      stripping = false;
    }
  }

  var flipMatch = base.match(/:(flipxy|flipx|flipy)$/);
  if (flipMatch) {
    if (flipMatch[1] === "flipx") flipx = true;
    else if (flipMatch[1] === "flipy") flipy = true;
    else {
      flipx = true;
      flipy = true;
    }
    base = base.substring(0, base.length - flipMatch[0].length);
  }

  return {
    base: base,
    exclusive: exclusive,
    forced: forced,
    flipx: flipx,
    flipy: flipy,
  };
}

// コンポ直下に * (排他) レイヤーが 1 つでもあるか。
// * フォルダの中身がさらに排他選択を持つ「本物の階層」か、1ポーズを包むだけの
// 「ラッパー」かを区別するのに使う（stripPrefix はルート名prefix "<root>_"）。
function compHasExclusiveLayer(comp, stripPrefix) {
  for (var i = 1; i <= comp.numLayers; i++) {
    var nm = comp.layer(i).name;
    if (stripPrefix && nm.indexOf(stripPrefix) === 0) {
      nm = nm.substring(stripPrefix.length);
    }
    var p = parsePsdLayerName(nm);
    if (p.exclusive && !p.flipx && !p.flipy) return true;
  }
  return false;
}

// parsed の反転情報を suffix 文字列に戻す（"" / "flipx" / "flipy" / "flipxy"）
function flipSuffixOf(parsed) {
  if (parsed.flipx && parsed.flipy) return "flipxy";
  if (parsed.flipx) return "flipx";
  if (parsed.flipy) return "flipy";
  return "";
}

// 反転バリエーションを表す短いグリフ（ボタン表示用）
function flipGlyph(suffix) {
  if (suffix === "flipxy") return "↔↕"; // ↔↕
  if (suffix === "flipx") return "↔"; // ↔
  if (suffix === "flipy") return "↕"; // ↕
  return "⇄"; // ⇄ = 通常（切替可能）
}

function flipHasX(state) {
  return state === "flipx" || state === "flipxy";
}
function flipHasY(state) {
  return state === "flipy" || state === "flipxy";
}

// 反転状態はルートコンポの comment に "emoFlip:flipx" 等として記録する（冪等）。
function readFlipState(comp) {
  if (!comp) return "";
  var c = "";
  try {
    c = comp.comment || "";
  } catch (e) {}
  var m = c.match(/emoFlip:(flipxy|flipx|flipy)/);
  return m ? m[1] : "";
}
function writeFlipState(comp, state) {
  if (!comp) return;
  try {
    var c = comp.comment || "";
    c = c.replace(/\s*emoFlip:(flipxy|flipx|flipy)/g, "");
    c = c.replace(/^\s+|\s+$/g, "");
    if (state) c = (c ? c + " " : "") + "emoFlip:" + state;
    comp.comment = c;
  } catch (e2) {}
}

// root comp の最上位レイヤーをコンポ中心線でミラーする（doX=左右 / doY=上下）。
// scale を反転しつつ position を「幅 - x」に置換することで、アンカー位置に
// 関係なく中心線で正しくミラーする（worldX' = compW - worldX）。これは静的な
// 値の書き換えだけなので描画負荷ゼロ。システムレイヤー/ヌルはスキップ。
function mirrorLayersInComp(comp, doX, doY) {
  if (!comp || (!doX && !doY)) return 0;
  var cw = comp.width;
  var ch = comp.height;
  var count = 0;
  for (var i = 1; i <= comp.numLayers; i++) {
    var L = comp.layer(i);
    try {
      if (isSystemLayerName(L.name)) continue;
      var isNull = false;
      try {
        isNull = L.nullLayer === true;
      } catch (en) {}
      if (isNull) continue;
      var pos = L.position.value;
      var sc = L.scale.value;
      if (doX) {
        pos[0] = cw - pos[0];
        sc[0] = -sc[0];
      }
      if (doY) {
        pos[1] = ch - pos[1];
        sc[1] = -sc[1];
      }
      L.position.setValue(pos);
      L.scale.setValue(sc);
      count++;
    } catch (e3) {}
  }
  return count;
}

/**
 * PSD ルートコンポからネストコンポ（= PSD のグループ）を再帰走査し、
 * 命名規則に該当するレイヤーをグループごとに収集する。
 * 同じコンポが複数回参照されていても 1 回だけ処理する。
 */
function scanPsdCompTree(rootComp) {
  var groups = [];
  var visited = {};
  // 再実行時、親コンポ参照レイヤーは uniquify 済みソース名（"<root>_*閉じ"）に
  // 追従するため、ルート名prefix を剥がしてから */! を判定する。
  var scanRootPrefix = rootComp.name + "_";
  function parseScanName(name) {
    var n =
      name.indexOf(scanRootPrefix) === 0
        ? name.substring(scanRootPrefix.length)
        : name;
    return parsePsdLayerName(n);
  }

  function scanComp(comp) {
    if (visited[comp.id]) return;
    visited[comp.id] = true;

    var info = {
      comp: comp,
      exclusiveLayers: [],
      optionalLayers: [],
      forcedLayers: [],
      flipVariants: [],
      defaultLayer: null,
    };

    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var parsed = parseScanName(layer.name);

      var source = null;
      try {
        source = layer.source;
      } catch (e) {}
      var isFolder = !!(source && source instanceof CompItem);

      var exEntry = null;
      if (parsed.flipx || parsed.flipy) {
        // 反転バリエーション（:flipx/:flipy）は「通常レイヤーとのペア」。
        // base が同コンポ・同種別にあれば登録対象（autoSetupPsd でペア判定）。
        // base が無い孤立 flip（線画 :flipx 等）は登録せずレポートのみ。
        info.flipVariants.push({ layer: layer, parsed: parsed });
      } else if (parsed.exclusive) {
        exEntry = { layer: layer, parsed: parsed };
        info.exclusiveLayers.push(exEntry);
        if (!info.defaultLayer && layer.enabled) info.defaultLayer = layer;
      } else if (parsed.forced) {
        info.forcedLayers.push(layer);
      } else {
        // プレフィックスなし = 任意指定（独立 ON/OFF）。リーフでもフォルダでも
        // 登録対象にする（フォルダは丸ごと表示/非表示できるチェックボックスになる）。
        info.optionalLayers.push({ layer: layer, parsed: parsed });
      }

      if (isFolder) {
        // * フォルダで中身に * が無い = 1ポーズを包むだけのラッパー。
        // フォルダ自体を親のラジオ選択肢に集約し、中身は「絵」として常時表示。
        // → 内部をグループ化（登録）せず、autoSetupPsd で中身を表示状態にする。
        if (
          parsed.exclusive &&
          !compHasExclusiveLayer(source, scanRootPrefix)
        ) {
          if (exEntry) exEntry.poseWrapperSource = source;
        } else {
          scanComp(source);
        }
      }
    }

    if (
      info.exclusiveLayers.length > 0 ||
      info.optionalLayers.length > 0 ||
      info.forcedLayers.length > 0
    ) {
      groups.push(info);
    }
  }

  scanComp(rootComp);
  return groups;
}

/**
 * グループコンポ名をプロジェクト全体で「一意」にする。
 * エクスプレッションの comp("名前") と制御レイヤー名 [Emo] <名前> は
 * 名前で参照するため、同名コンポがあると別グループが同じ制御マーカーを
 * 共有して干渉する。ルート名を前置し、なお衝突するなら連番を付ける。
 * 既に前置済みで一意なら何もしない（冪等）。
 */
function compNameTaken(name, selfComp) {
  var comps = getProjectComps();
  for (var i = 0; i < comps.length; i++) {
    if (comps[i].id !== selfComp.id && comps[i].name === name) return true;
  }
  return false;
}

function makeUniqueCompName(base, selfComp) {
  if (!compNameTaken(base, selfComp)) return base;
  var n = 2;
  while (compNameTaken(base + " " + n, selfComp)) n++;
  return base + " " + n;
}

function uniquifyGroupCompName(rootComp, groupComp) {
  if (groupComp === rootComp || groupComp.id === rootComp.id) return null;
  var prefix = rootComp.name + "_";
  var desired = groupComp.name;
  if (desired.indexOf(prefix) !== 0) desired = prefix + desired;
  // 既にこの名前で、かつ他に同名コンポが無ければそのまま（冪等）
  if (desired === groupComp.name && !compNameTaken(groupComp.name, groupComp)) {
    return null;
  }
  var unique = makeUniqueCompName(desired, groupComp);
  if (unique === groupComp.name) return null;
  var oldName = groupComp.name;
  groupComp.name = unique;
  return oldName + " → " + unique;
}

/**
 * グループコンポを oldName → newName にリネームした際、参照を移行する。
 *   1) 制御コンポ内の制御レイヤー [Emo] oldName を [Emo] newName にリネーム
 *      （マーカー＝表情/口形の選択履歴を保持したまま新名へ引き継ぐ）
 *   2) このコンポ内レイヤーの式に焼き込まれた旧コンポ名参照を新名へ置換
 *      （登録済み emo はこの後 registerLayers で作り直されるが、保持される
 *        口パク/目パチの合成式は作り直されないため、ここで直す必要がある）
 */
function migrateGroupRename(comp, ctrlComp, oldName, newName) {
  if (!comp || !ctrlComp || oldName === newName) return;
  var oldCtrl = getCtrlLayerName(oldName);
  var newCtrl = getCtrlLayerName(newName);
  try {
    for (var i = 1; i <= ctrlComp.numLayers; i++) {
      var cl = ctrlComp.layer(i);
      if (cl.name === oldCtrl) cl.name = newCtrl; // マーカー保持のままリネーム
    }
  } catch (e) {}
  var oldEsc = escapeExprStr(oldName);
  var newEsc = escapeExprStr(newName);
  for (var j = 1; j <= comp.numLayers; j++) {
    var ly = comp.layer(j);
    var ex;
    try {
      ex = ly.transform.opacity.expression;
    } catch (e2) {
      continue;
    }
    if (ex && ex.indexOf(oldEsc) >= 0) {
      try {
        ly.transform.opacity.expression = ex.split(oldEsc).join(newEsc);
      } catch (e3) {}
    }
  }
}

/**
 * 同一コンポ内の重複レイヤー名に「 (2)」「 (3)」を付けて一意化する。
 * エクスプレッションもマーカーもレイヤー名一致で動くため、
 * コンポ内の重複は誤マッチの原因になる
 */
function dedupeLayerNames(comp) {
  var renamed = [];
  var seen = {};
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    var name = layer.name;
    if (!seen[name]) {
      seen[name] = 1;
      continue;
    }
    var n = seen[name];
    var candidate;
    do {
      n++;
      candidate = name + " (" + n + ")";
    } while (seen[candidate]);
    seen[name] = n;
    seen[candidate] = 1;
    layer.name = candidate;
    renamed.push(name + " → " + candidate);
  }
  return renamed;
}

function hasOpacitySignature(layer, signature) {
  try {
    return layer.transform.opacity.expression.indexOf(signature) >= 0;
  } catch (e) {
    return false;
  }
}

/**
 * 走査結果に基づいてセットアップ / 更新を実行する。
 * 冪等性ルール:
 *   - リネーム（* 剥がし / 一意化）は適用済みなら何もしない
 *   - 口パク等の合成式が設定済みのレイヤーは上書きせず保持
 *   - 時刻 0 のデフォルト表情マーカーは、制御レイヤーにマーカーが
 *     1 つもないときだけ書き込む（既存式はマーカーなし時 opacity 0 のため
 *     初回は必須。ユーザーが打ったマーカーは上書きしない）
 */
function autoSetupPsd(rootComp, ctrlComp, groups) {
  var report = {
    groupCount: 0,
    registered: 0,
    updated: 0,
    kept: 0,
    forced: 0,
    markersWritten: 0,
    flipPaired: 0,
    renamedComps: [],
    renamedLayers: [],
    flipVariants: [],
    commaNames: [],
  };

  beginUndo("EmoLabMaker: PSDセットアップ");
  try {
    var prevCtrlNull = null; // この実行で直前に作った制御ヌル（作成順を保つ）
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var comp = group.comp;

      var oldCompName = comp.name;
      var compRename = uniquifyGroupCompName(rootComp, comp);
      if (compRename) {
        report.renamedComps.push(compRename);
        // リネームで参照が壊れないよう、制御レイヤー名とこのコンポ内の式の
        // 旧コンポ名参照を新名へ移行する（口パク/目パチの保持式・マーカーを守る）
        migrateGroupRename(comp, ctrlComp, oldCompName, comp.name);
      }

      // プレフィックス（* / !）は剥がさず保持する（種別を名前から判別できるように）。
      // 同名重複だけは誤マッチ防止のためリネームする
      var dedupeRenames = dedupeLayerNames(comp);
      for (var d = 0; d < dedupeRenames.length; d++) {
        report.renamedLayers.push(comp.name + ": " + dedupeRenames[d]);
      }

      // 強制表示 (!) レイヤー: 表示を保証するだけで登録しない
      for (var f = 0; f < group.forcedLayers.length; f++) {
        var forcedLayer = group.forcedLayers[f];
        forcedLayer.enabled = true;
        try {
          if (!forcedLayer.transform.opacity.expression) {
            forcedLayer.transform.opacity.setValue(100);
          }
        } catch (err) {}
        report.forced++;
      }

      // レイヤー名にカンマがあると「表示中集合」（カンマ区切り）が壊れるため警告する
      var commaCheck = [];
      for (var cx = 0; cx < group.exclusiveLayers.length; cx++) {
        commaCheck.push(group.exclusiveLayers[cx].layer.name);
      }
      for (var co = 0; co < group.optionalLayers.length; co++) {
        commaCheck.push(group.optionalLayers[co].layer.name);
      }
      for (var cf = 0; cf < group.forcedLayers.length; cf++) {
        commaCheck.push(group.forcedLayers[cf].name);
      }
      for (var cv = 0; cv < group.flipVariants.length; cv++) {
        commaCheck.push(group.flipVariants[cv].layer.name);
      }
      for (var cc = 0; cc < commaCheck.length; cc++) {
        if (commaCheck[cc].indexOf(",") >= 0) {
          report.commaNames.push(comp.name + ": " + commaCheck[cc]);
        }
      }

      // 反転バリエーション（:flipx 等）の処理。base が同コンポ・同種別にある
      // ものだけ「ペア」として登録し、グローバル反転で base⇄flip をスワップできる
      // ようにする。base のない孤立 flip（線画 :flipx 等）はスキップ（レポートのみ）。
      var baseKeys = {};
      for (var bx = 0; bx < group.exclusiveLayers.length; bx++) {
        baseKeys[group.exclusiveLayers[bx].parsed.base + "|EX"] = true;
      }
      for (var bo = 0; bo < group.optionalLayers.length; bo++) {
        baseKeys[group.optionalLayers[bo].parsed.base + "|OPT"] = true;
      }
      var pairedFlipLayers = [];
      for (var s = 0; s < group.flipVariants.length; s++) {
        var fv = group.flipVariants[s];
        var fvKey = fv.parsed.base + "|" + (fv.parsed.exclusive ? "EX" : "OPT");
        var paired = !fv.parsed.forced && baseKeys[fvKey] === true;
        report.flipVariants.push(
          comp.name +
            ": " +
            fv.layer.name +
            (paired ? "（ペア登録）" : "（ペアなし→スキップ）"),
        );
        if (paired) pairedFlipLayers.push(fv.layer);
      }

      // 排他も任意指定もないグループには制御レイヤーを作らない
      if (
        group.exclusiveLayers.length === 0 &&
        group.optionalLayers.length === 0
      ) {
        continue;
      }
      report.groupCount++;

      // 同一実行で作る制御ヌルは作成順に並べる（最上位配置は維持）
      prevCtrlNull = createCtrlLayer(ctrlComp, comp.name, prevCtrlNull);

      // 排他（*）＋任意指定（無印）＋ペア反転を同じ式で登録
      var toRegister = [];
      for (var r = 0; r < group.exclusiveLayers.length; r++) {
        toRegister.push(group.exclusiveLayers[r].layer);
      }
      for (var o = 0; o < group.optionalLayers.length; o++) {
        toRegister.push(group.optionalLayers[o].layer);
      }
      for (var pf = 0; pf < pairedFlipLayers.length; pf++) {
        toRegister.push(pairedFlipLayers[pf]);
        report.flipPaired++;
      }

      // registerLayers が enabled=true に変えてしまう前に、任意指定レイヤーの
      // 元の表示 / 非表示状態を記録する（PSD の初期表示を既定マーカーへ反映するため）
      var optionalWasVisible = [];
      for (var ov = 0; ov < group.optionalLayers.length; ov++) {
        optionalWasVisible.push(!!group.optionalLayers[ov].layer.enabled);
      }

      var layersToRegister = [];
      for (var t = 0; t < toRegister.length; t++) {
        var layer = toRegister[t];
        if (
          hasOpacitySignature(layer, LAB_MAP_SIGNATURE) ||
          hasOpacitySignature(layer, BLINK_SIGNATURE)
        ) {
          // 口パク・目パチの合成式は保持（emo 情報は合成式に埋め込み済み）
          report.kept++;
          continue;
        }
        if (isRegistered(layer)) report.updated++;
        else report.registered++;
        layersToRegister.push(layer);
      }
      registerLayers(
        comp,
        ctrlComp.name,
        layersToRegister,
        "EmoLabMaker: PSDセットアップ登録",
      );

      // ポーズラッパー（* フォルダで中身が「絵」だけ）の内部は登録しないが、
      // フォルダ選択時に必ず見えるよう、内部の最上位レイヤーを表示状態にする。
      for (var pw = 0; pw < group.exclusiveLayers.length; pw++) {
        var pwSrc = group.exclusiveLayers[pw].poseWrapperSource;
        if (!pwSrc) continue;
        for (var pl = 1; pl <= pwSrc.numLayers; pl++) {
          var pwLayer = pwSrc.layer(pl);
          if (isSystemLayerName(pwLayer.name)) continue;
          try {
            pwLayer.enabled = true;
          } catch (ePw) {}
        }
      }

      // 既定の表示中集合マーカー（初回・マーカー皆無時のみ）
      // = 既定ラジオ（表示状態の排他）＋ 表示状態の任意指定（完全名）
      var ctrlLayer = findCtrlLayerInComp(ctrlComp, comp.name, 0);
      var hasMarkers = false;
      try {
        hasMarkers = ctrlLayer.property("Marker").numKeys > 0;
      } catch (err2) {}
      if (ctrlLayer && !hasMarkers) {
        // 既定マーカー = PSD の初期表示を忠実に再現した「表示中集合」。
        //   排他（*）: PSD で表示状態だったレイヤー（group.defaultLayer）のみ。
        //              どれも非表示なら何も選ばない（強制的に先頭を表示しない）
        //   任意（無印）: 登録前に記録した元の表示状態を維持
        var defaultNames = [];
        if (group.defaultLayer) defaultNames.push(group.defaultLayer.name);
        for (var oo = 0; oo < group.optionalLayers.length; oo++) {
          if (optionalWasVisible[oo]) {
            defaultNames.push(group.optionalLayers[oo].layer.name);
          }
        }
        writeMarkerNameAtTime(ctrlComp, comp.name, 0, defaultNames.join(","));
        report.markersWritten++;
      }
    }
  } finally {
    endUndo();
  }
  return report;
}

/**
 * 走査結果の確認ダイアログ。
 * セットアップするグループを選ばせる（誤検出の確認画面を兼ねる）。
 * OK なら選択されたグループ配列、キャンセルなら null を返す
 */
function showPsdScanDialog(rootComp, groups) {
  var dialog = new Window("dialog", "PSD 解析結果 - " + rootComp.name);
  dialog.orientation = "column";
  dialog.alignChildren = ["fill", "top"];
  dialog.margins = 16;
  dialog.spacing = 6;

  dialog.add(
    "statictext",
    undefined,
    "セットアップするグループを選択してください:",
  );

  var listGroup = dialog.add("group");
  listGroup.orientation = "column";
  listGroup.alignChildren = ["fill", "top"];
  listGroup.spacing = 2;

  var checkboxes = [];
  for (var i = 0; i < groups.length; i++) {
    var group = groups[i];
    var defaultLayer = group.defaultLayer;
    var label =
      group.comp.name +
      "（排他 " +
      group.exclusiveLayers.length +
      " / 任意 " +
      group.optionalLayers.length +
      " / 強制 " +
      group.forcedLayers.length +
      (group.flipVariants.length > 0
        ? " / 反転 " + group.flipVariants.length
        : "") +
      (defaultLayer
        ? " / 既定: " + parsePsdLayerName(defaultLayer.name).base
        : "") +
      "）";
    var cb = listGroup.add("checkbox", undefined, label);
    // 排他または任意指定があるグループを既定で ON（強制のみのグループも選択は可能）
    cb.value =
      group.exclusiveLayers.length > 0 || group.optionalLayers.length > 0;
    checkboxes.push(cb);
  }

  var noteText = dialog.add(
    "statictext",
    undefined,
    "グループコンポは「" + rootComp.name + "_◯◯」に改名されます",
  );
  noteText.graphics.foregroundColor = noteText.graphics.newPen(
    noteText.graphics.PenType.SOLID_COLOR,
    [0.6, 0.6, 0.6, 1],
    1,
  );

  var btnGroup = dialog.add("group");
  btnGroup.alignment = ["right", "bottom"];
  btnGroup.add("button", undefined, "セットアップ", { name: "ok" });
  btnGroup.add("button", undefined, "キャンセル", { name: "cancel" });

  if (dialog.show() !== 1) return null;

  var selected = [];
  for (var j = 0; j < groups.length; j++) {
    if (checkboxes[j].value) selected.push(groups[j]);
  }
  return selected;
}

/** セットアップ結果のレポートダイアログ */
function showPsdReportDialog(report) {
  var dialog = new Window("dialog", "PSD セットアップ結果");
  dialog.orientation = "column";
  dialog.alignChildren = ["fill", "top"];
  dialog.margins = 16;
  dialog.spacing = 6;

  var summaryLines = [
    "グループ: " + report.groupCount,
    "新規登録: " + report.registered + " レイヤー",
    "更新: " + report.updated + " レイヤー",
  ];
  if (report.kept > 0) {
    summaryLines.push(
      "保持（口パク/目パチ設定済み）: " + report.kept + " レイヤー",
    );
  }
  if (report.forced > 0) {
    summaryLines.push("強制表示 (!): " + report.forced + " レイヤー");
  }
  if (report.flipPaired > 0) {
    summaryLines.push(
      "反転ペア登録 (:flipx 等): " + report.flipPaired + " レイヤー",
    );
  }
  if (report.markersWritten > 0) {
    summaryLines.push(
      "デフォルト表情マーカー: " + report.markersWritten + " 件",
    );
  }
  for (var i = 0; i < summaryLines.length; i++) {
    dialog.add("statictext", undefined, summaryLines[i]);
  }

  var detailLines = [];
  if (report.renamedComps.length > 0) {
    detailLines.push("【コンポ名の一意化】");
    detailLines = detailLines.concat(report.renamedComps);
    detailLines.push("");
  }
  if (report.renamedLayers.length > 0) {
    detailLines.push("【レイヤーのリネーム】");
    detailLines = detailLines.concat(report.renamedLayers);
    detailLines.push("");
  }
  if (report.flipVariants.length > 0) {
    detailLines.push(
      "【反転バリエーション (:flipx/:flipy)】ペアは登録、ペアなしはスキップ",
    );
    detailLines = detailLines.concat(report.flipVariants);
    detailLines.push("");
  }
  if (report.commaNames.length > 0) {
    detailLines.push(
      "【警告: レイヤー名にカンマ「,」】表示中集合が壊れる恐れ。リネーム推奨",
    );
    detailLines = detailLines.concat(report.commaNames);
  }

  if (detailLines.length > 0) {
    var detailBox = dialog.add("edittext", undefined, detailLines.join("\n"), {
      multiline: true,
      scrolling: true,
      readonly: true,
    });
    detailBox.preferredSize = [380, 160];
  }

  dialog.add("button", undefined, "閉じる", { name: "ok" });
  dialog.show();
}

// ══════════════════════════════════════════════════════════════════
// タブ「PSD」UI
// ══════════════════════════════════════════════════════════════════

var psdGuide = tabPsd.add("group");
psdGuide.orientation = "column";
psdGuide.alignChildren = ["fill", "top"];
psdGuide.spacing = 2;
psdGuide.add(
  "statictext",
  undefined,
  "PSD は AE 標準の読み込みで追加してください:",
);
psdGuide.add(
  "statictext",
  undefined,
  "ファイル > 読み込み > 「コンポジション - レイヤーサイズを維持」推奨",
);

function addPsdCompRow(labelText) {
  var row = tabPsd.add("group");
  row.orientation = "row";
  row.alignment = ["fill", "top"];
  row.alignChildren = ["left", "center"];
  row.spacing = 6;

  var lbl = row.add("statictext", undefined, labelText);
  lbl.preferredSize = [LABEL_WIDTH, BUTTON_HEIGHT];

  var dropdown = row.add("dropdownlist", undefined, []);
  dropdown.alignment = ["fill", "center"];
  dropdown.minimumSize = [DROPDOWN_MIN_W, BUTTON_HEIGHT];
  dropdown.preferredSize.height = BUTTON_HEIGHT;

  return { row: row, dropdown: dropdown };
}

var psdRootRow = addPsdCompRow("ルート");
psdRootRow.dropdown.helpTip =
  "PSD から読み込んだ立ち絵ルートコンポ（プロジェクト直下の PSD 由来/設定済みコンポのみ表示）";

var psdRefreshBtn = psdRootRow.row.add("button", undefined, "↺");
psdRefreshBtn.preferredSize = [24, BUTTON_HEIGHT];
psdRefreshBtn.helpTip = "コンポ一覧を再取得";

var psdCtrlRow = addPsdCompRow("制御");
psdCtrlRow.dropdown.helpTip =
  "表情マーカーを書き込むコンポ（全体設定）。通常はルートと同じでOK。立ち絵ルートより下の部品コンポ（口・目など）やレイヤーフォルダ内は候補に出ません";

var psdSetupBtn = tabPsd.add(
  "button",
  undefined,
  "解析してセットアップ / 更新",
);
psdSetupBtn.alignment = ["fill", "top"];
psdSetupBtn.helpTip =
  "PSDToolKit の命名規則 (* = 排他 / ! = 強制表示 / :flipx = 反転ペア) を解釈して表情切替を自動セットアップ。再実行で更新";

// ── レイヤー名 prefix ショートカット（セットアップ前の下準備）(#F) ──
var psdPrefixPanel = tabPsd.add("panel", undefined, "命名ショートカット");
psdPrefixPanel.orientation = "column";
psdPrefixPanel.alignChildren = ["fill", "top"];
psdPrefixPanel.alignment = ["fill", "top"];
psdPrefixPanel.margins = 10;
psdPrefixPanel.spacing = 4;
var psdPrefixHint = psdPrefixPanel.add(
  "statictext",
  undefined,
  "アクティブコンポで選択中のレイヤー名に * / ! を付与します（付与後は再セットアップ）",
);
psdPrefixHint.alignment = ["fill", "top"];
var psdPrefixRow = psdPrefixPanel.add("group");
psdPrefixRow.orientation = "row";
psdPrefixRow.alignChildren = ["left", "center"];
psdPrefixRow.spacing = 5;
var psdAddStarBtn = psdPrefixRow.add("button", undefined, "* 排他(ラジオ)");
psdAddStarBtn.helpTip =
  "選択レイヤーに * を付与（兄弟内で排他＝ラジオ選択）。既存の * / ! は置換";
var psdAddBangBtn = psdPrefixRow.add("button", undefined, "! 強制表示");
psdAddBangBtn.helpTip =
  "選択レイヤーに ! を付与（常に表示）。既存の * / ! は置換";
var psdStripBtn = psdPrefixRow.add("button", undefined, "prefix除去");
psdStripBtn.helpTip = "選択レイヤーの先頭の * / ! を除去（無印＝任意指定に）";

// 選択レイヤーの先頭 prefix を mode("*"/"!"/"") に付け替える
function applyPsdPrefix(mode) {
  var comp = getActiveComp();
  if (!comp || comp.selectedLayers.length === 0) {
    alert("名前を変更するレイヤーを選択してください。");
    return;
  }
  var count = 0;
  beginUndo("emo2layer: レイヤー名 prefix 付与");
  try {
    for (var i = 0; i < comp.selectedLayers.length; i++) {
      var L = comp.selectedLayers[i];
      var nm = L.name;
      // 先頭の * / ! をすべて剥がす（:flip サフィックスは保持）
      while (nm.length > 0 && (nm.charAt(0) === "*" || nm.charAt(0) === "!")) {
        nm = nm.substring(1);
      }
      // ネストした三項演算子は ExtendScript で誤評価され得るので if/else で明示する
      var newName;
      if (mode === "*") {
        newName = "*" + nm;
      } else if (mode === "!") {
        newName = "!" + nm;
      } else {
        newName = nm;
      }
      if (newName !== L.name) {
        try {
          L.name = newName;
          count++;
        } catch (eN) {}
      }
    }
  } finally {
    endUndo();
  }
  psdStatusText.text =
    count +
    " レイヤーの名前を変更しました。表情切替へ反映するには「解析してセットアップ / 更新」を実行してください。";
}
psdAddStarBtn.onClick = function () {
  applyPsdPrefix("*");
};
psdAddBangBtn.onClick = function () {
  applyPsdPrefix("!");
};
psdStripBtn.onClick = function () {
  applyPsdPrefix("");
};

// ══════════════════════════════════════════════════════════════════
// 目パチ (自動まばたき)
// ══════════════════════════════════════════════════════════════════

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

var blinkPanel = tabBlink.add("panel", undefined, "目パチ (自動まばたき)");
blinkPanel.orientation = "column";
blinkPanel.alignChildren = ["fill", "top"];
blinkPanel.alignment = ["fill", "top"];
blinkPanel.spacing = 4;
blinkPanel.margins = 10;

var BLINK_ROLES = [
  { key: "open", label: "開き目" },
  { key: "mid", label: "中間(任意)" },
  { key: "closed", label: "閉じ目" },
];

var blinkRows = [];
for (var brIdx = 0; brIdx < BLINK_ROLES.length; brIdx++) {
  (function (roleInfo) {
    var row = blinkPanel.add("group");
    row.orientation = "row";
    row.alignment = ["fill", "top"];
    row.alignChildren = ["left", "center"];
    row.spacing = 4;

    var lbl = row.add("statictext", undefined, roleInfo.label);
    lbl.preferredSize = [72, BUTTON_HEIGHT];

    var assignBtn = row.add("button", undefined, "割当");
    assignBtn.preferredSize = [48, BUTTON_HEIGHT];
    assignBtn.helpTip =
      "アクティブコンポの選択レイヤーを「" + roleInfo.label + "」に割当";

    var clearBtn = row.add("button", undefined, "×");
    clearBtn.preferredSize = [24, BUTTON_HEIGHT];

    var namesText = row.add("statictext", undefined, "（未割当）");
    namesText.alignment = ["fill", "center"];

    var rowData = {
      role: roleInfo.key,
      namesText: namesText,
      layers: [],
    };
    blinkRows.push(rowData);

    assignBtn.onClick = function () {
      var comp = getActiveComp();
      if (!comp || comp.selectedLayers.length === 0) {
        alert("目のレイヤーを選択してください");
        return;
      }
      rowData.layers = [];
      for (var i = 0; i < comp.selectedLayers.length; i++) {
        rowData.layers.push(comp.selectedLayers[i]);
      }
      namesText.text = describeAssignedLayers(rowData.layers);
      namesText.helpTip = namesText.text;
    };

    clearBtn.onClick = function () {
      rowData.layers = [];
      namesText.text = "（未割当）";
      namesText.helpTip = "";
    };
  })(BLINK_ROLES[brIdx]);
}

var blinkParamRow = blinkPanel.add("group");
blinkParamRow.orientation = "row";
blinkParamRow.alignment = ["fill", "top"];
blinkParamRow.alignChildren = ["left", "center"];
blinkParamRow.spacing = 4;

blinkParamRow.add("statictext", undefined, "間隔(秒)");
var blinkIntervalInput = blinkParamRow.add("edittext", undefined, "4.0");
blinkIntervalInput.preferredSize = [44, BUTTON_HEIGHT];
blinkIntervalInput.helpTip = "まばたきの平均間隔";

blinkParamRow.add("statictext", undefined, "速度(秒)");
var blinkSpeedInput = blinkParamRow.add("edittext", undefined, "0.07");
blinkSpeedInput.preferredSize = [44, BUTTON_HEIGHT];
blinkSpeedInput.helpTip = "閉じる/開くのそれぞれにかかる時間";

blinkParamRow.add("statictext", undefined, "ランダム%");
var blinkJitterInput = blinkParamRow.add("edittext", undefined, "40");
blinkJitterInput.preferredSize = [36, BUTTON_HEIGHT];
blinkJitterInput.helpTip = "間隔のばらつき (0-90)";

var blinkBtnRow = blinkPanel.add("group");
blinkBtnRow.orientation = "row";
blinkBtnRow.alignment = ["fill", "top"];
blinkBtnRow.alignChildren = ["fill", "center"];
blinkBtnRow.spacing = 5;

var blinkApplyBtn = blinkBtnRow.add("button", undefined, "目パチ設定");
blinkApplyBtn.helpTip =
  "割当レイヤーに自動まばたきを設定（表情登録済みなら開き目表情中のみまばたき）";
var blinkRemoveBtn = blinkBtnRow.add("button", undefined, "解除(コンポ)");
blinkRemoveBtn.helpTip =
  "アクティブコンポ内の目パチを一括解除（開き/中間/閉じをまとめて。表情登録済みなら表情切替に戻す）";
var blinkRemoveListBtn = blinkBtnRow.add("button", undefined, "解除(一覧)");
blinkRemoveListBtn.helpTip =
  "プロジェクト内の目パチ設定済みコンポを一覧から選んで一括解除（レイヤー選択不要）";

blinkApplyBtn.onClick = function () {
  var openRow = blinkRows[0];
  var midRow = blinkRows[1];
  var closedRow = blinkRows[2];

  if (openRow.layers.length === 0 || closedRow.layers.length === 0) {
    alert("「開き目」と「閉じ目」の割当が必要です。");
    return;
  }

  var interval = parseFloat(blinkIntervalInput.text);
  var speed = parseFloat(blinkSpeedInput.text);
  var jitterPct = parseFloat(blinkJitterInput.text);
  if (isNaN(interval) || interval < 0.5) interval = 4.0;
  if (isNaN(speed) || speed < 0.01) speed = 0.07;
  if (isNaN(jitterPct) || jitterPct < 0) jitterPct = 40;
  if (jitterPct > 90) jitterPct = 90;

  var params = {
    interval: interval,
    speed: speed,
    hold: speed * 0.5,
    jitter: jitterPct / 100,
  };
  var hasMid = midRow.layers.length > 0;

  // 開き目レイヤー名（このマーカー表情のときだけまばたきする）
  var openNames = [];
  for (var o = openRow.layers.length - 1; o >= 0; o--) {
    try {
      openNames.unshift(openRow.layers[o].name);
    } catch (e) {
      openRow.layers.splice(o, 1);
    }
  }
  var openNamesCsv = openNames.join(",");

  var appliedCount = 0;
  var emoLinkedCount = 0;
  var skippedCount = 0;

  beginUndo("EmoLabMaker: 目パチ設定");
  try {
    for (var r = 0; r < blinkRows.length; r++) {
      var rowData = blinkRows[r];
      for (var i = 0; i < rowData.layers.length; i++) {
        var layer = rowData.layers[i];
        try {
          if (hasOpacitySignature(layer, LAB_MAP_SIGNATURE)) {
            // 口パク設定済みのレイヤーには適用しない（不透明度の競合）
            skippedCount++;
            continue;
          }
          var emoCtx = parseEmoContext(layer);
          layer.transform.opacity.expression = buildBlinkExpression(
            params,
            rowData.role,
            hasMid,
            openNamesCsv,
            emoCtx,
          );
          layer.enabled = true;
          appliedCount++;
          if (emoCtx) emoLinkedCount++;
        } catch (err) {
          skippedCount++;
        }
      }
    }
  } finally {
    endUndo();
  }

  var message = "完了: " + appliedCount + " レイヤーに目パチを設定しました。";
  if (emoLinkedCount > 0) {
    message +=
      "\n表情切替と共存: " +
      emoLinkedCount +
      " レイヤー（開き目表情中のみまばたき）";
  }
  if (skippedCount > 0) {
    message +=
      "\nスキップ: " +
      skippedCount +
      " レイヤー（口パク設定済み、または削除済み）";
  }
  alert(message);
};

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

blinkRemoveBtn.onClick = function () {
  var comp = getActiveComp();
  if (!comp) {
    alert(
      "目パチを解除するコンポをアクティブにしてください（または「解除(一覧)」を使用）",
    );
    return;
  }
  // コンポグループ単位で解除: 選択レイヤーだけでなく、アクティブコンポ内の
  // 目パチレイヤーをすべて解除する（開きだけ解除されて中間/閉じが残る不整合を防ぐ）(#E)
  if (!hasBlinkLayer(comp)) {
    alert("このコンポには目パチ設定済みのレイヤーがありません。");
    return;
  }
  var res;
  beginUndo("EmoLabMaker: 目パチ解除（コンポ）");
  try {
    res = removeBlinkFromComp(comp);
  } finally {
    endUndo();
  }

  var message =
    "「" +
    comp.name +
    "」の目パチを解除しました（" +
    res.removed +
    " レイヤー）。";
  if (res.restored > 0) {
    message += "\nうち " + res.restored + " レイヤーは表情切替に戻しました。";
  }
  alert(message);
};

// 一覧から目パチを解除（コンポグループ単位・どこからでも）(#E)
blinkRemoveListBtn.onClick = function () {
  var groups = findBlinkComps();
  if (groups.length === 0) {
    alert("目パチ設定済みのレイヤーが見つかりませんでした。");
    return;
  }
  var dlg = new Window("dialog", "目パチ解除（コンポ単位で選択）");
  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];
  dlg.margins = 12;
  dlg.spacing = 4;
  dlg.add(
    "statictext",
    undefined,
    "解除するコンポを選択（そのコンポ内の目パチを一括解除）:",
  );

  var listGrp = dlg.add("group");
  listGrp.orientation = "column";
  listGrp.alignChildren = ["fill", "top"];
  listGrp.spacing = 1;
  var checks = [];
  for (var i = 0; i < groups.length; i++) {
    var cb = listGrp.add(
      "checkbox",
      undefined,
      groups[i].comp.name + "（" + groups[i].layers.length + " レイヤー）",
    );
    cb.value = true;
    var tipNames = [];
    for (var t = 0; t < groups[i].layers.length; t++) {
      try {
        tipNames.push(groups[i].layers[t].name);
      } catch (eT) {}
    }
    cb.helpTip = tipNames.join(", ");
    checks.push(cb);
  }

  var selRow = dlg.add("group");
  selRow.orientation = "row";
  var allBtn = selRow.add("button", undefined, "全選択");
  var noneBtn = selRow.add("button", undefined, "全解除");
  allBtn.onClick = function () {
    for (var k = 0; k < checks.length; k++) checks[k].value = true;
  };
  noneBtn.onClick = function () {
    for (var k = 0; k < checks.length; k++) checks[k].value = false;
  };

  var btnRow = dlg.add("group");
  btnRow.alignment = ["right", "bottom"];
  btnRow.add("button", undefined, "解除", { name: "ok" });
  btnRow.add("button", undefined, "キャンセル", { name: "cancel" });
  if (dlg.show() !== 1) return;

  var removedCount = 0;
  var restoredCount = 0;
  var compCount = 0;
  beginUndo("EmoLabMaker: 目パチ解除（コンポ単位）");
  try {
    for (var j = 0; j < groups.length; j++) {
      if (!checks[j].value) continue;
      var res = removeBlinkFromComp(groups[j].comp);
      removedCount += res.removed;
      restoredCount += res.restored;
      compCount++;
    }
  } finally {
    endUndo();
  }
  var msg =
    compCount +
    " コンポ・計 " +
    removedCount +
    " レイヤーの目パチを解除しました。";
  if (restoredCount > 0) {
    msg += "\nうち " + restoredCount + " レイヤーは表情切替に戻しました。";
  }
  alert(msg);
};

// ── 設定（立ち絵タブの表示・挙動。app.settings で永続化） ──
var settingsPanel = tabPsd.add("panel", undefined, "設定");
settingsPanel.orientation = "column";
settingsPanel.alignChildren = ["left", "top"];
settingsPanel.alignment = ["fill", "bottom"];
settingsPanel.spacing = 4;
settingsPanel.margins = 10;

var cbFollow = settingsPanel.add(
  "checkbox",
  undefined,
  "再生ヘッド追従（立ち絵タブを触ると現在状態に同期）",
);
cbFollow.value = cfgFollowPlayhead;
cbFollow.onClick = function () {
  cfgFollowPlayhead = cbFollow.value;
  setSettingBool("followPlayhead", cfgFollowPlayhead);
};

var cbForced = settingsPanel.add(
  "checkbox",
  undefined,
  "立ち絵タブで「!」常時表示レイヤーを表示",
);
cbForced.value = cfgShowForced;
cbForced.onClick = function () {
  cfgShowForced = cbForced.value;
  setSettingBool("showForced", cfgShowForced);
  refreshStage(false);
};

var cbHideInactive = settingsPanel.add(
  "checkbox",
  undefined,
  "非アクティブ階層を隠す（グレーアウトの代わりに非表示）",
);
cbHideInactive.value = cfgHideInactive;
cbHideInactive.onClick = function () {
  cfgHideInactive = cbHideInactive.value;
  setSettingBool("hideInactive", cfgHideInactive);
  refreshStage(false);
};

var indentRow = settingsPanel.add("group");
indentRow.orientation = "row";
indentRow.alignChildren = ["left", "center"];
indentRow.spacing = 4;
indentRow.add("statictext", undefined, "インデント幅(px)");
var indentInput = indentRow.add("edittext", undefined, String(cfgIndentWidth));
indentInput.preferredSize = [44, BUTTON_HEIGHT];
indentInput.onChange = function () {
  var v = parseFloat(indentInput.text);
  if (isNaN(v) || v < 0) v = 14;
  if (v > 60) v = 60;
  cfgIndentWidth = v;
  indentInput.text = String(v);
  setSettingNum("indentWidth", v);
  refreshStage(false);
};

var psdStatusText = tabPsd.add(
  "statictext",
  undefined,
  "PSD のルートコンポを選択してください。",
);
psdStatusText.alignment = ["fill", "bottom"];

function refreshPsdDropdowns() {
  var rootCur = psdRootRow.dropdown.selection
    ? psdRootRow.dropdown.selection.text
    : null;
  var ctrlCur = psdCtrlRow.dropdown.selection
    ? psdCtrlRow.dropdown.selection.text
    : null;
  rebuildPsdDropdown(psdRootRow.dropdown, rootCur);
  rebuildPsdDropdown(psdCtrlRow.dropdown, ctrlCur, collectCtrlCandidates());
  if (psdRootRow.dropdown.items.length === 0) {
    psdStatusText.text =
      "PSD 立ち絵コンポが見つかりません。PSD を「コンポジション」として読み込んでください。";
  }
}

psdRefreshBtn.onClick = function () {
  refreshPsdDropdowns();
  psdStatusText.text = "コンポ一覧を更新しました（PSD 立ち絵ルート候補のみ）。";
};

// ルート変更時は制御コンポも同じものをデフォルトにする
psdRootRow.dropdown.onChange = function () {
  if (!psdRootRow.dropdown.selection) return;
  var rootName = psdRootRow.dropdown.selection.text;
  for (var i = 0; i < psdCtrlRow.dropdown.items.length; i++) {
    if (psdCtrlRow.dropdown.items[i].text === rootName) {
      psdCtrlRow.dropdown.selection = i;
      break;
    }
  }
};

psdSetupBtn.onClick = function () {
  var rootComp = getSelectedComp(psdRootRow.dropdown);
  var ctrlComp = getSelectedComp(psdCtrlRow.dropdown);
  if (!rootComp) {
    psdStatusText.text = "ルートコンポを選択してください。";
    return;
  }
  if (!ctrlComp) {
    psdStatusText.text = "制御コンポを選択してください。";
    return;
  }

  var groups = scanPsdCompTree(rootComp);
  if (groups.length === 0) {
    alert(
      "PSDToolKit の命名規則 (* / !) に該当するレイヤーが見つかりませんでした。\n" +
        "PSD を「コンポジション」として読み込んだルートコンポを選択してください。",
    );
    return;
  }

  var selectedGroups = showPsdScanDialog(rootComp, groups);
  if (!selectedGroups) {
    psdStatusText.text = "キャンセルしました。";
    return;
  }
  if (selectedGroups.length === 0) {
    psdStatusText.text = "グループが選択されていません。";
    return;
  }

  var report = autoSetupPsd(rootComp, ctrlComp, selectedGroups);

  refreshPsdDropdowns();

  showPsdReportDialog(report);
  psdStatusText.text =
    "セットアップ完了: " +
    report.groupCount +
    " グループ / 新規 " +
    report.registered +
    " / 更新 " +
    report.updated;
};
