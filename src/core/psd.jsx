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

// ── セットアップ済みタグ ────────────────────────────────────────
// セットアップ実行済みのルートコンポは comment に "emoSetup" を記録する。
// 立ち絵タブのルート候補は「セットアップ済み or 制御レイヤーあり」だけを列挙する
// （式の登録はクリック時のため、制御レイヤーの有無ではセットアップ済みを判定できない。
//   comment タグなら PSD 以外の手組み立ち絵でも同じように機能する）

function hasSetupTag(comp) {
  try {
    return String(comp.comment || "").indexOf("emoSetup") >= 0;
  } catch (e) {
    return false;
  }
}

function writeSetupTag(comp) {
  try {
    var c = String(comp.comment || "");
    if (c.indexOf("emoSetup") >= 0) return;
    comp.comment = (c ? c + " " : "") + "emoSetup";
  } catch (e) {}
}

// ── 制御コンポ指定タグ ──────────────────────────────────────────
// セットアップの「制御」ドロップダウンの指定をルートコンポの comment に記録する。
// 式の登録はクリック時のため、立ち絵タブが制御レイヤーを作る場所
// （ensureCtrlLayerForNode の node.ctrlComp）はこの指定から解決する。
// コンポ名は空白を含み得るため「1 行 1 タグ」の行形式（emoCtrl=<名前>）で保持する

function readCtrlCompTag(comp) {
  try {
    var lines = String(comp.comment || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("emoCtrl=") === 0) {
        return lines[i].substring("emoCtrl=".length);
      }
    }
  } catch (e) {}
  return null;
}

function writeCtrlCompTag(comp, ctrlCompName) {
  try {
    var lines = String(comp.comment || "").split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("emoCtrl=") === 0) continue; // 旧指定を除去
      if (lines[i] !== "") out.push(lines[i]);
    }
    out.push("emoCtrl=" + ctrlCompName);
    comp.comment = out.join("\n");
  } catch (e) {}
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
      // システムレイヤー（[Emo]/[EmoSet]/[Lab]）とヌルは選択肢ではない
      // （ルート＝制御コンポ運用で制御ヌルが任意指定として登録されるのを防ぐ）
      if (isSystemLayerName(layer.name)) continue;
      var isNull = false;
      try {
        isNull = layer.nullLayer === true;
      } catch (eNull) {}
      if (isNull) continue;

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

// 「表示中集合」（カンマ区切り）内の oldName トークンだけを newName に置換する。
// 変更が無ければ null（式の membership 判定と同じ「完全一致」で置換する）
function replaceSetToken(setStr, oldName, newName) {
  var parts = String(setStr).split(",");
  var changed = false;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === oldName) {
      parts[i] = newName;
      changed = true;
    }
  }
  return changed ? parts.join(",") : null;
}

/**
 * コンポリネームに伴うマーカー・表情セットの移行（プロジェクト全体）。
 * AE ではコンポをリネームすると、それを参照する親コンポ内のレイヤー名も
 * 自動で追従変更される。マーカー（表示中集合）と [EmoSet] はレイヤー名を
 * 文字列で保持しているため、追従しない参照をここで新名へ置換する。
 * 制御レイヤーは立ち絵タブ経由で別コンポに作られていることもあるため、
 * セットアップで選んだ制御コンポに限定せず全コンポを走査する。
 */
function migrateNameInMarkersAndSets(oldName, newName) {
  var oldCtrl = getCtrlLayerName(oldName);
  var newCtrl = getCtrlLayerName(newName);
  var comps = getProjectComps();
  for (var c = 0; c < comps.length; c++) {
    var cc = comps[c];
    for (var i = 1; i <= cc.numLayers; i++) {
      var ly = cc.layer(i);
      var nm = ly.name;
      if (nm === oldCtrl) {
        // 制御レイヤー自体のリネーム（マーカー＝選択履歴を保持したまま引き継ぐ）
        try {
          ly.name = newCtrl;
        } catch (eN) {}
        nm = newCtrl;
      }
      if (nm.indexOf(CTRL_PREFIX) === 0) {
        // 制御レイヤーのマーカー集合内の旧レイヤー名トークンを置換
        try {
          var marker = ly.property("Marker");
          for (var k = 1; k <= marker.numKeys; k++) {
            var replaced = replaceSetToken(
              marker.keyValue(k).comment,
              oldName,
              newName,
            );
            if (replaced !== null) {
              marker.setValueAtTime(marker.keyTime(k), new MarkerValue(replaced));
            }
          }
        } catch (eM) {}
      } else if (nm.indexOf(SET_PREFIX) === 0) {
        // 表情セット: コメントの「<対象コンポ名>=<集合>」の両側を置換
        try {
          var lines = String(ly.comment || "").split(/\r?\n/);
          var changed = false;
          for (var L = 0; L < lines.length; L++) {
            var eq = lines[L].indexOf("=");
            if (eq <= 0) continue;
            var target = lines[L].substring(0, eq);
            var setPart = lines[L].substring(eq + 1);
            if (target === oldName) {
              target = newName;
              changed = true;
            }
            var newSet = replaceSetToken(setPart, oldName, newName);
            if (newSet !== null) {
              setPart = newSet;
              changed = true;
            }
            lines[L] = target + "=" + setPart;
          }
          if (changed) ly.comment = lines.join("\n");
        } catch (eS) {}
      }
    }
  }
}

/**
 * コンポ内レイヤーの不透明度式に焼き込まれた oldName 参照を newName へ置換する。
 * 置換は「comp("旧名")」と「制御レイヤー名リテラル "[Emo] 旧名"」の 2 形式に限定する
 * （裸の文字列置換だと、目パチ式の openNames 等に入っているレイヤー名リテラルが、旧名を部分文字列として含む場合に巻き添えで壊れるため）。
 * ベイク済み（式無効化）レイヤーの状態を変えないよう expressionEnabled を保つ。
 */
function replaceCompNameInCompExpressions(comp, oldName, newName) {
  if (!comp || oldName === newName) return;
  var pairs = [
    ['comp("' + escapeExprStr(oldName) + '")', 'comp("' + escapeExprStr(newName) + '")'],
    [
      '"' + escapeExprStr(getCtrlLayerName(oldName)) + '"',
      '"' + escapeExprStr(getCtrlLayerName(newName)) + '"',
    ],
  ];
  for (var j = 1; j <= comp.numLayers; j++) {
    var ly = comp.layer(j);
    var prop;
    var ex;
    try {
      prop = ly.transform.opacity;
      ex = prop.expression;
    } catch (e2) {
      continue;
    }
    if (!ex) continue;
    var replaced = ex;
    for (var p = 0; p < pairs.length; p++) {
      if (replaced.indexOf(pairs[p][0]) >= 0) {
        replaced = replaced.split(pairs[p][0]).join(pairs[p][1]);
      }
    }
    if (replaced !== ex) {
      try {
        var wasEnabled = prop.expressionEnabled;
        prop.expression = replaced;
        prop.expressionEnabled = wasEnabled;
      } catch (e3) {}
    }
  }
}

/**
 * グループコンポを oldName → newName にリネームした際、参照を移行する。
 *   1) 制御レイヤー [Emo] oldName → [Emo] newName
 *      （プロジェクト全体。マーカー＝表情/口形の選択履歴を保持したまま新名へ引き継ぐ）
 *   2) 全制御レイヤーのマーカー集合・[EmoSet] 内の旧名トークンを新名へ置換
 *      （親コンポのフォルダレイヤー名はソース名に追従して変わるため）
 *   3) このコンポ内レイヤーの式に焼き込まれた旧コンポ名参照を新名へ置換
 *      （登録済み emo はこの後 registerLayers で作り直されるが、保持される
 *        口パク/目パチの合成式は作り直されないため、ここで直す必要がある）
 */
function migrateGroupRename(comp, oldName, newName) {
  if (!comp || oldName === newName) return;
  migrateNameInMarkersAndSets(oldName, newName);
  replaceCompNameInCompExpressions(comp, oldName, newName);
}

// ── 制御コンポの移行（引っ越し） ────────────────────────────────
// セットアップで以前と異なる制御コンポを指定したとき、
// 既存の制御レイヤーをマーカーごと新しい制御コンポへ移動し、式の参照も付け替える。

/** 選択した制御コンポ以外に居る各グループの制御レイヤーを列挙する */
function collectForeignCtrlLayers(ctrlComp, groups) {
  var out = [];
  var comps = getProjectComps();
  for (var g = 0; g < groups.length; g++) {
    var name = groups[g].comp.name;
    if (findCtrlLayerInComp(ctrlComp, name, 0)) continue; // 既に新側に居る
    for (var c = 0; c < comps.length; c++) {
      if (comps[c].id === ctrlComp.id) continue;
      var ly = findCtrlLayerInComp(comps[c], name, 0);
      if (ly) {
        out.push({ group: groups[g], fromComp: comps[c], layer: ly });
        break;
      }
    }
  }
  return out;
}

/**
 * コンポ内レイヤーの式の「制御コンポ参照」だけを oldName → newName に置換する。
 * 旧制御コンポが音素コンポを兼ねている場合、comp("旧名") の裸置換だと、口パク合成式の音素参照まで巻き添えで
 * 書き換えてしまうため、制御参照の行形式（var ctrlComp = ...）に限定する。
 */
function replaceCtrlCompRefInCompExpressions(comp, oldName, newName) {
  if (!comp || oldName === newName) return;
  var oldRef = 'var ctrlComp = comp("' + escapeExprStr(oldName) + '");';
  var newRef = 'var ctrlComp = comp("' + escapeExprStr(newName) + '");';
  for (var j = 1; j <= comp.numLayers; j++) {
    var ly = comp.layer(j);
    var prop;
    var ex;
    try {
      prop = ly.transform.opacity;
      ex = prop.expression;
    } catch (e2) {
      continue;
    }
    if (ex && ex.indexOf(oldRef) >= 0) {
      try {
        var wasEnabled = prop.expressionEnabled;
        prop.expression = ex.split(oldRef).join(newRef);
        prop.expressionEnabled = wasEnabled;
      } catch (e3) {}
    }
  }
}

/**
 * 制御レイヤーを（マーカーごと）ctrlComp へ移動し、移動元コンポ名を参照する
 * 式を新コンポ名へ置換する。表情式はこの後の再登録でも作り直されるが、保持される口パク/目パチの合成式は置換が必須。
 * 戻り値: 移動数
 *
 * ※ copyToComp は使わない。挿入位置が環境依存で「最上位＝コピー」の仮定が成り立たず、
 *   無関係なレイヤーを hideCtrlLayer してその source コンポをリネームしてしまった（実機検証）。
 *   正規の作成手順（createCtrlLayer＝命名・不可視化・整列）で新しいヌルを作り、マーカーだけ移す。
 *   移したマーカーはコメント（表示中集合）のみ＝本ツールの管理対象と同じ。
 */
function migrateCtrlLayersTo(foreign, ctrlComp) {
  var moved = 0;
  var prevMoved = null; // 移行した制御ヌルを作成順に整列する（交互配置の防止）
  for (var i = 0; i < foreign.length; i++) {
    var f = foreign[i];
    try {
      var newCtrl = createCtrlLayer(ctrlComp, f.group.comp.name, prevMoved);
      var oldMarker = f.layer.property("Marker");
      var newMarker = newCtrl.property("Marker");
      for (var k = 1; k <= oldMarker.numKeys; k++) {
        newMarker.setValueAtTime(
          oldMarker.keyTime(k),
          new MarkerValue(oldMarker.keyValue(k).comment),
        );
      }
      f.layer.remove();
      prevMoved = newCtrl;
      moved++;
    } catch (e) {
      continue;
    }
    // 制御コンポ名を参照する式は対象グループ内に居る（emo 登録式＋合成式）。
    // 音素コンポが旧制御と同一のことがあるため、制御参照の行だけを置換する
    replaceCtrlCompRefInCompExpressions(f.group.comp, f.fromComp.name, ctrlComp.name);
  }
  return moved;
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
 * 走査結果に基づいてセットアップ / 更新を実行する（全グループ・選択なし）。
 * 役割分担: セットアップ＝名前の正規化（全件）＋使用中グループの式更新。
 *           式の登録・制御レイヤー作成＝立ち絵タブのクリック時
 *           （ensureCtrlLayerForNode）。制御レイヤーが無いグループはパスする。
 * 名前は常に全件を一括で正規化するため「一部だけリネーム済み」という状態が生まれず、
 * リネーム順序に起因するマーカー不整合が構造的に起きない
 * （リネーム時のマーカー等の移行は migrateGroupRename が行う）。
 * 冪等性ルール:
 *   - リネーム（一意化）は適用済みなら何もしない
 *   - 口パク等の合成式が設定済みのレイヤーは上書きせず保持
 *   - 時刻 0 のデフォルト表情マーカーは、制御レイヤーにマーカーが
 *     1 つもないときだけ書き込む（既存式はマーカーなし時 opacity 0 のため
 *     初回は必須。ユーザーが打ったマーカーは上書きしない）
 */
function autoSetupPsd(rootComp, ctrlComp, groups) {
  var report = {
    groupCount: 0,
    passed: 0, // 未使用（制御レイヤー無し）＝名前の正規化のみ行ったグループ
    ctrlMigrated: 0, // 制御コンポの移行（引っ越し）で移動した制御レイヤー数
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

  // 制御コンポの移行を拒否した場合は、タグ更新やリネームも行わず全体を中止する。
  var foreign = collectForeignCtrlLayers(ctrlComp, groups);
  if (foreign.length > 0) {
    var fromNames = [];
    var fromSeen = {};
    for (var fn = 0; fn < foreign.length; fn++) {
      if (!fromSeen[foreign[fn].fromComp.id]) {
        fromSeen[foreign[fn].fromComp.id] = true;
        fromNames.push(foreign[fn].fromComp.name);
      }
    }
    if (
      !confirm(
        "既存の制御レイヤー " +
          foreign.length +
          " 件が別のコンポ（" +
          fromNames.join(", ") +
          "）にあります。\n「" +
          ctrlComp.name +
          "」へ移行してセットアップを続けますか？\n（いいえ: セットアップをキャンセル）",
      )
    ) {
      return null;
    }
  }

  beginUndo("EmoLabMaker: PSDセットアップ");
  try {
    if (foreign.length > 0) {
      report.ctrlMigrated = migrateCtrlLayersTo(foreign, ctrlComp);
    }

    // セットアップ済みタグ（立ち絵タブのルート候補に載せる）＋制御コンポの指定
    writeSetupTag(rootComp);
    writeCtrlCompTag(rootComp, ctrlComp.name);
    var prevCtrlNull = null; // この実行で直前に作った制御ヌル（作成順を保つ）
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var comp = group.comp;

      var oldCompName = comp.name;
      var compRename = uniquifyGroupCompName(rootComp, comp);
      if (compRename) {
        report.renamedComps.push(compRename);
        // リネームで参照が壊れないよう、制御レイヤー名・マーカー・表情セット・
        // このコンポ内の式の旧コンポ名参照を新名へ移行する
        migrateGroupRename(comp, oldCompName, comp.name);
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

      // 強制(!)の反転バリエーションは登録対象外（マーカーで管理されない）。
      // base と両方表示されないよう「base 表示 / flip 非表示」に正規化する
      // （反転ボタンは登録ペアのみ対象＝強制ペアの反転切替は未対応の既知制限）
      for (var ff = 0; ff < group.flipVariants.length; ff++) {
        var ffv = group.flipVariants[ff];
        if (!ffv.parsed.forced) continue;
        var ffBaseName = ffv.layer.name.replace(/:(flipxy|flipx|flipy)$/, "");
        for (var fb = 0; fb < group.forcedLayers.length; fb++) {
          if (group.forcedLayers[fb].name === ffBaseName) {
            try {
              ffv.layer.enabled = false;
            } catch (eFF) {}
            break;
          }
        }
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
        var fvNote;
        if (paired) {
          fvNote = "（ペア登録）";
        } else if (fv.parsed.forced) {
          fvNote = "（強制 → base 表示 / flip 非表示）";
        } else {
          fvNote = "（ペアなし→スキップ）";
        }
        report.flipVariants.push(comp.name + ": " + fv.layer.name + fvNote);
        if (paired) pairedFlipLayers.push(fv.layer);
      }

      // ポーズラッパー（* フォルダで中身が「絵」だけ）の内部は登録しないが、
      // フォルダ選択時に必ず見えるよう、内部の最上位レイヤーを表示状態にする
      // （未使用グループでも実施。後で立ち絵タブから使い始めたときに備える）
      for (var pw = 0; pw < group.exclusiveLayers.length; pw++) {
        var pwSrc = group.exclusiveLayers[pw].poseWrapperSource;
        if (!pwSrc) continue;
        for (var pl = 1; pl <= pwSrc.numLayers; pl++) {
          var pwLayer = pwSrc.layer(pl);
          if (isSystemLayerName(pwLayer.name)) continue;
          // 反転素材（:flipx 等）は base と二重表示になるため非表示に正規化する
          // （過去バージョンが点けてしまった状態も再セットアップで直す）
          var pwParsed = parsePsdLayerName(pwLayer.name);
          try {
            pwLayer.enabled = !(pwParsed.flipx || pwParsed.flipy);
          } catch (ePw) {}
        }
      }

      // 制御レイヤーが無いグループ＝未使用としてパス（名前の正規化だけ行う）。
      // ※ 立ち絵タブのルート候補は「制御レイヤーを持つ or PSD 由来ルート」なので、
      //   何も登録しなくてもタブから使い始められる（rebuildStageRootDropdown）
      // 式の登録・制御レイヤー作成は立ち絵タブで使ったときに行われる
      // （ensureCtrlLayerForNode）。使用中のグループだけ式を最新へ更新する。
      var existingCtrl = findCtrlLayerInComp(ctrlComp, comp.name, 0);
      if (!existingCtrl) {
        if (
          group.exclusiveLayers.length > 0 ||
          group.optionalLayers.length > 0
        ) {
          report.passed++;
        }
        continue;
      }
      report.groupCount++;

      // 既存制御ヌルの不可視化メンテナンス＋作成順の維持
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

// 選択レイヤーと、その参照先コンポ（＋配下のネストコンポ）の尺を伸ばす。
// 各選択レイヤーの outPoint を targetDuration まで伸ばし（縮めない）、レイヤーが
// コンポを参照していれば extendStageComps でそのコンポ階層も伸ばす。
// 戻り値: { layers: outPoint を伸ばしたレイヤー数, comps: 尺を伸ばしたコンポ数, scanned: 走査コンポ数 }
function extendSelectedLayers(layers, targetDuration) {
  var result = { layers: 0, comps: 0, scanned: 0 };
  if (!layers || !(targetDuration > 0)) return result;
  var seen = {};
  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];
    if (!layer) continue;
    try {
      if (layer.outPoint < targetDuration) {
        layer.outPoint = targetDuration;
        result.layers++;
      }
    } catch (eOut) {}
    var src = null;
    try {
      src = layer.source;
    } catch (eSrc) {}
    if (src && src instanceof CompItem && !seen[src.id]) {
      seen[src.id] = true;
      var sub = extendStageComps(src, targetDuration);
      result.layers += sub.layers;
      result.comps += sub.comps;
      result.scanned += sub.scanned;
    }
  }
  return result;
}
