// ════════════════════════════════════════════════════════════════
// PSDコアロジック: 命名解析・走査・自動セットアップ・反転
// 旧 30_tab_psd.jsx から抽出（UI非依存）。
// ════════════════════════════════════════════════════════════════

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

// 立ち絵ルートとその配下の全ネストコンポの尺を targetDuration まで伸ばす（縮めはしない）。
// 各コンポ内レイヤーの outPoint もコンポ終端まで伸ばし、立ち絵が途中で消えないようにする。
// 戻り値: { comps: 尺を伸ばしたコンポ数, layers: outPoint を伸ばしたレイヤー数, scanned: 走査コンポ数 }
function extendStageComps(rootComp, targetDuration) {
  var result = { comps: 0, layers: 0, scanned: 0 };
  if (!rootComp || !(targetDuration > 0)) return result;
  var seen = {};
  var stack = [rootComp];
  while (stack.length > 0) {
    var comp = stack.pop();
    if (!comp || seen[comp.id]) continue;
    seen[comp.id] = true;
    result.scanned++;
    var extended = false;
    try {
      if (comp.duration < targetDuration) {
        comp.duration = targetDuration;
        extended = true;
      }
    } catch (eDur) {}
    var dur = comp.duration;
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      try {
        if (layer.outPoint < dur) {
          layer.outPoint = dur;
          result.layers++;
        }
      } catch (eOut) {}
      var src = null;
      try {
        src = layer.source;
      } catch (eSrc) {}
      if (src && src instanceof CompItem && !seen[src.id]) stack.push(src);
    }
    if (extended) result.comps++;
  }
  return result;
}
