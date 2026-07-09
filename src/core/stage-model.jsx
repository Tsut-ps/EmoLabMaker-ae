// ════════════════════════════════════════════════════════════════
// 立ち絵モデル: 階層ツリー構築・active判定・prefix/表示名（UI非依存）
// 旧 40_tab_stage.jsx から抽出。
// ════════════════════════════════════════════════════════════════

// ── 文字列ヘルパー（純粋・テスト可能） ──────────────────────────
function detectCommonPrefix(names) {
  if (!names || names.length < 2) return "";
  var prefix = names[0];
  for (var i = 1; i < names.length; i++) {
    var n = names[i];
    var j = 0;
    while (
      j < prefix.length &&
      j < n.length &&
      prefix.charAt(j) === n.charAt(j)
    ) {
      j++;
    }
    prefix = prefix.substring(0, j);
    if (prefix === "") break;
  }
  var us = prefix.lastIndexOf("_");
  return us >= 0 ? prefix.substring(0, us + 1) : "";
}

// prefix で始まる場合のみ剥がす。最初の "_" 以降に短縮するような
// 推測はしない（"zunda_s" → "s" のような誤短縮を防ぐ）。
function shortenGroupName(name, prefix) {
  if (prefix && name.length > prefix.length && name.indexOf(prefix) === 0) {
    return name.substring(prefix.length);
  }
  return name;
}

// 名前群から「最も多くの名前が共有する <...>_ prefix」を求める。
// detectCommonPrefix は全名前の共通部分なので、prefix を持たない名前が
// 1 つでもあると "" になってしまう（#N 冗長名の原因）。こちらは多数決で、
// prefix なしの外れ値（"くろいやつ" 等）があっても支配的 prefix を拾う。
function detectDominantPrefix(names) {
  if (!names || names.length === 0) return "";
  var counts = {};
  var i, k;
  for (i = 0; i < names.length; i++) {
    var n = names[i];
    // この名前が含む「_ まで」の各 prefix 候補を加点。
    // ただし * / ! マーカーを含む候補は除外する。キャラ prefix（Mhime_ 等）は
    // マーカーより前にあり、マーカーを含まない。* や ! を含む "*閉_" のような
    // ものを prefix として剥がすと、排他マーカーまで消えて任意指定に化ける。
    for (k = 0; k < n.length; k++) {
      if (n.charAt(k) === "_") {
        var cand = n.substring(0, k + 1);
        if (cand.indexOf("*") >= 0 || cand.indexOf("!") >= 0) continue;
        counts[cand] = (counts[cand] || 0) + 1;
      }
    }
  }
  var best = "";
  var bestScore = 0;
  for (var key in counts) {
    if (!counts.hasOwnProperty(key)) continue;
    if (counts[key] < 2) continue; // 単独 prefix は採用しない
    // 共有数が多いほど良い。同数なら長い prefix を優先（より深く剥がす）
    if (
      counts[key] > bestScore ||
      (counts[key] === bestScore && key.length > best.length)
    ) {
      best = key;
      bestScore = counts[key];
    }
  }
  return best;
}

// 候補 prefix のうち name が始まるものを長い順に剥がし、* / ! / :flip を除いた
// 表示用 base 名を返す。複数キャラ混在や prefix なしコンポにも頑健。
function stageDisplayName(name, prefixCandidates) {
  var stripped = name;
  var bestLen = 0;
  for (var i = 0; i < prefixCandidates.length; i++) {
    var p = prefixCandidates[i];
    if (
      p &&
      p.length > bestLen &&
      name.length > p.length &&
      name.indexOf(p) === 0
    ) {
      stripped = name.substring(p.length);
      bestLen = p.length;
    }
  }
  return parsePsdLayerName(stripped).base;
}

// ── 階層ツリー構築 ──────────────────────────────────────────────
// 各 comp を DFS で走査し、深さ付きノード列を返す。
//   choice 分類(リーフ): * = ラジオ / 無印 = 任意指定 / ! = 出さない(常時表示で操作不要)
//   フォルダ参照: * のときだけ choice(サブ階層の排他切替)。!/無印 はコンテナのみ
//   [Emo]/[EmoSet]/[Lab] のシステムレイヤーは選択肢にしない
function isSystemLayerName(name) {
  return (
    name.indexOf(CTRL_PREFIX) === 0 ||
    name.indexOf(SET_PREFIX) === 0 ||
    name.indexOf("[Lab] ") === 0
  );
}

// マーカー(* / !)の位置。先頭、または "_" の直後だけを正規のマーカーとみなす
// （basename 内の "母_お" 等の "_" を誤検出しないため）。無ければ -1。
function markerPosOf(name) {
  for (var k = 0; k < name.length; k++) {
    var ch = name.charAt(k);
    if ((ch === "*" || ch === "!") && (k === 0 || name.charAt(k - 1) === "_")) {
      return k;
    }
  }
  return -1;
}

// コンポ内レイヤー名の「キャラ prefix（<root>_ 等）」を、ルート選択に依存せず
// コンポ自身のレイヤー名から検出する。これにより、立ち絵を外側コンポに入れて
// そちらをルートに選んでも */! やラベルが正しく出る（#外側ルート対応）。
//   1) マーカー付きレイヤーがあれば、その * / ! の直前までを prefix とする
//   2) 無ければ共通 prefix（多数決）
function detectCompPrefix(comp) {
  var i;
  for (i = 1; i <= comp.numLayers; i++) {
    var nm = comp.layer(i).name;
    if (isSystemLayerName(nm)) continue;
    var mp = markerPosOf(nm);
    if (mp > 0) return nm.substring(0, mp); // "_" の直後にマーカー → 直前までが prefix
  }
  var names = [];
  for (i = 1; i <= comp.numLayers; i++) {
    var n2 = comp.layer(i).name;
    if (!isSystemLayerName(n2)) names.push(n2);
  }
  return detectDominantPrefix(names);
}

// レイヤーが「立ち絵の管理下」か（セットアップで emo/口パク/目パチ いずれかの
// 不透明度式が付いている）。無印リーフのうちシーン装飾（カメラ/手置きレイヤー等）を
// 立ち絵ツリーから除外する判定に使う。
function isManagedStageLayer(layer) {
  try {
    return (
      isRegistered(layer) ||
      hasOpacitySignature(layer, LAB_MAP_SIGNATURE) ||
      hasOpacitySignature(layer, BLINK_SIGNATURE)
    );
  } catch (e) {
    return false;
  }
}

// シーン直下のコンポ参照が「立ち絵関連」か
// セットアップ済みタグ / 制御レイヤー / 管理下レイヤー（emo/口パク/目パチの式付き）のいずれかを持てば関連とみなす。
// （管理下レイヤーの条件は、タグの無い旧バージョンのプロジェクト救済）
function isStageRelatedComp(comp) {
  if (hasSetupTag(comp) || hasCtrlPrefixedLayer(comp)) return true;
  for (var i = 1; i <= comp.numLayers; i++) {
    if (isManagedStageLayer(comp.layer(i))) return true;
  }
  return false;
}

function buildStageNodes(rootComp) {
  var visited = {};
  if (!rootComp) return [];
  var stageRootPrefix = rootComp.name + "_";
  // ルート自身が立ち絵ルート（セットアップ済み or PSD 由来）なら、直下のフォルダは立ち絵のパーツなので全部辿る。
  // そうでない（＝シーンコンポを選んだ）場合は、直下のコンポ参照のうち立ち絵関連だけ辿り、背景・フレーム等は選択肢に出さない
  var rootIsCharacter = hasSetupTag(rootComp) || hasPsdLayersFolder(rootComp);
  // コンポごとに検出した prefix を優先し、無ければルート名prefix を剥がしてから
  // */! を判定する。これで外側コンポをルートに選んでも種別・ラベルが正しく出る。
  function parseMarkerName(name, compPrefix) {
    var n = name;
    if (compPrefix && name.indexOf(compPrefix) === 0) {
      n = name.substring(compPrefix.length);
    } else if (name.indexOf(stageRootPrefix) === 0) {
      n = name.substring(stageRootPrefix.length);
    }
    return parsePsdLayerName(n);
  }

  function walk(comp, depth, isRoot, refInfo) {
    if (!comp || visited[comp.id]) return [];
    visited[comp.id] = true;

    var radio = [];
    var optional = [];
    var forced = [];
    var flipEntries = []; // {base, suffix, fullName, layer, exclusive}
    var nodeCtrlName = null;
    var children = [];
    var childDepth = isRoot ? depth : depth + 1;
    var compPrefix = detectCompPrefix(comp);

    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (isSystemLayerName(layer.name)) continue;
      // ヌルレイヤーは表示物ではないので選択肢にしない（「ヌル」表示の除去）
      var isNull = false;
      try {
        isNull = layer.nullLayer === true;
      } catch (eNull) {}
      if (isNull) continue;

      var src = null;
      try {
        src = layer.source;
      } catch (e) {}
      var isFolder = !!(src && src instanceof CompItem);

      // シーン直下の無関係コンポ（背景・フレーム・未セットアップの立ち絵等）は、選択肢にもツリーにも出さない
      if (isRoot && !rootIsCharacter && isFolder && !isStageRelatedComp(src)) {
        continue;
      }

      var parsed = parseMarkerName(layer.name, compPrefix);

      if (parsed.flipx || parsed.flipy) {
        // 反転バリエーション。ループ後に base 選択肢へ「ペア」として束ねる。
        // 強制(!)/フォルダの flip はペア対象外（ループ後に base が無ければ捨てる）
        flipEntries.push({
          base: parsed.base,
          suffix: flipSuffixOf(parsed),
          fullName: layer.name,
          layer: layer,
          exclusive: parsed.exclusive,
        });
      } else if (parsed.exclusive) {
        // * はリーフでもフォルダでも radio choice（フォルダは下のサブ階層切替も兼ねる）
        radio.push({
          fullName: layer.name,
          label: parsed.base,
          layer: layer,
          flips: [],
        });
      } else if (parsed.forced) {
        // ! 強制表示。リーフでもフォルダでも情報として出す（常時表示・グレーアウト）
        forced.push({
          fullName: layer.name,
          label: parsed.base,
          layer: layer,
          flips: [],
        });
      } else {
        // 無印 = 任意指定（独立 ON/OFF）。リーフでもフォルダでも checkbox にする
        // （フォルダはサブ階層を持ちつつ、自身も丸ごと表示/非表示できる）。
        // ただしルート（シーンコンポ）を立ち絵に選ぶと、シーンに手置きした装飾
        // レイヤー（カメラ/ライト/テキスト/図形など）が（ルート）に紛れ込む。
        // ルート直下では「フォルダ」「管理下の式を持つ」「ルートが PSD 由来」の
        // いずれかだけ任意指定として出し、それ以外（装飾レイヤー）は除外する。
        // PSD 由来ルートを条件に加えるのは、式の登録がクリック時になったため
        // （未登録でも選択肢に出さないと、永遠にクリックできない）。
        // ネストした部品コンポ内の無印リーフは従来どおり出す（クリックで自動登録できる）。
        if (
          isRoot &&
          !isFolder &&
          !isManagedStageLayer(layer) &&
          !hasPsdLayersFolder(comp)
        ) {
          continue; // ルート直下のシーン装飾レイヤー → 選択肢にしない
        }
        optional.push({
          fullName: layer.name,
          label: parsed.base,
          layer: layer,
          flips: [],
        });
      }

      if (!nodeCtrlName) {
        var ctx = parseEmoContext(layer);
        if (ctx) nodeCtrlName = ctx.ctrlCompName;
      }

      if (isFolder) {
        // * フォルダで中身に * が無い = 1ポーズを包むラッパー。フォルダ自体を
        // 親のラジオ選択肢に集約済みなので、冗長なサブノードは出さない。
        var isPoseWrapper =
          parsed.exclusive &&
          !compHasExclusiveLayer(src, detectCompPrefix(src));
        if (!isPoseWrapper) {
          children = children.concat(
            walk(src, childDepth, false, {
              name: layer.name,
              exclusive: parsed.exclusive,
              forced: parsed.forced,
            }),
          );
        }
      }
    }

    // 反転バリエーションを base 選択肢へ束ねる（同種別・同 base 名のみペア）。
    // base が無い孤立 flip（線画 :flipx 等）は選択肢を作らず捨てる。
    for (var fe = 0; fe < flipEntries.length; fe++) {
      var ent = flipEntries[fe];
      var pool = ent.exclusive ? radio : optional;
      for (var pc = 0; pc < pool.length; pc++) {
        if (pool[pc].label === ent.base) {
          pool[pc].flips.push({
            suffix: ent.suffix,
            fullName: ent.fullName,
            layer: ent.layer,
          });
          break;
        }
      }
    }

    // 制御コンポ名の伝播: コンテナ（目/口…の部分フォルダだけを直下に持ち、自身は
    // 制御式を持たない）でも、子孫の立ち絵パートが属する制御コンポを引き継ぐ。
    // これで「立ち絵コンテナがどの制御に属するか」が分かり、複数立ち絵の判定と
    // 未登録パーツのフォールバック制御が正しくなる。
    if (!nodeCtrlName) {
      for (var cpi = 0; cpi < children.length; cpi++) {
        if (children[cpi].ctrlCompName) {
          nodeCtrlName = children[cpi].ctrlCompName;
          break;
        }
      }
    }

    var hasOwn = radio.length > 0 || optional.length > 0 || forced.length > 0;
    var out = [];
    var emit = isRoot ? hasOwn : hasOwn || children.length > 0;
    if (emit) {
      out.push({
        comp: comp,
        depth: depth,
        displayName: comp.name,
        isRoot: isRoot,
        radioChoices: radio,
        optionalChoices: optional,
        forcedChoices: forced,
        ctrlCompName: nodeCtrlName,
        ctrlComp: null,
        visibleSet: [],
        hasChildren: isRoot ? false : children.length > 0,
        active: true,
        refName: refInfo ? refInfo.name : null,
        refExclusive: refInfo ? refInfo.exclusive : false,
        refForced: refInfo ? refInfo.forced : false,
      });
    }
    return out.concat(children);
  }

  return walk(rootComp, 0, true, null);
}

// active 伝播: 上位コンポ参照(*)が選択されていない階層は active=false。
// DFS順(親が子より前)前提で、depth-1 の直近ノードを親とみなす。
// ルート直下のパートは flatten で depth0 になるため、その親はルートノードにする
// （ヘッダの ☑/◉ がルートの制御へ正しく書き込めるように）。
// 各ノードの visibleSet は事前に解決済みであること。
// DFS順(親が子より前)前提で各ノードの parent を確定する。
// ルート直下のパートは flatten で depth0 になるため、その親はルートノードにする。
function assignStageParents(nodes) {
  var lastAtDepth = {};
  var rootNode = null;
  for (var i = 0; i < nodes.length; i++) {
    var nn = nodes[i];
    if (nn.isRoot && rootNode === null) rootNode = nn;
    var parent;
    if (nn.isRoot) {
      parent = null;
    } else if (nn.depth === 0) {
      parent = rootNode; // 立ち絵直下(depth0)の親はルート
    } else {
      parent = lastAtDepth[nn.depth - 1] || null;
    }
    nn.parent = parent;
    lastAtDepth[nn.depth] = nn;
  }
}

// ルート直下に置かれた「無印のサブ階層コンテナ」か。
// シーン(コンポ1 等)に立ち絵を複数置くと、各立ち絵はルート直下の無印フォルダとして
// 現れ、かつ自分のサブ階層(目/口…)を持つ。これを親(シーン)のトグルにすると、押下時に
// 立ち絵コンテナ自体を誤った制御へ一括登録して中身ごと壊すため、トグルにせず
// 「展開専用のコンテナ見出し」にする。制御コンポを共有していても構造で判定できる。
//   - 対象: ルート直下(parent.isRoot) かつ サブ階層を持つ(hasChildren) かつ 無印
//   - 除外: * ラジオ/! 強制（明示的な選択肢なので従来どおり）、リーフのパート(目 等)
function isIndependentStageRoot(node) {
  var p = node ? node.parent : null;
  if (!node || node.isRoot || !p || !p.isRoot) return false;
  return !!(node.hasChildren && !node.refExclusive && !node.refForced);
}

function computeStageActive(nodes) {
  assignStageParents(nodes);
  for (var i = 0; i < nodes.length; i++) {
    var nn = nodes[i];
    if (nn.isRoot) {
      nn.active = true;
      continue;
    }
    var parent = nn.parent;
    var refVisible;
    if (nn.refForced) {
      refVisible = true;
    } else if (nn.refExclusive) {
      refVisible = parent
        ? indexOfName(parent.visibleSet, nn.refName) >= 0
        : true;
    } else {
      refVisible = true; // 無印フォルダ(コンテナ)は常に有効
    }
    nn.active = parent ? parent.active && refVisible : true;
  }
}

// 警告条件: 中身がすべてラジオ（排他）なのに、現在どれも選択されていない階層。
// = 任意/強制の選択肢がなく、ラジオが1つ以上あり、表示中集合にどれも含まれない。
// （上位未選択でグレーアウト中の階層は対象外）
function isRadioGroupUnselected(node) {
  if (!node || !node.active) return false;
  if (node.optionalChoices.length > 0 || node.forcedChoices.length > 0)
    return false;
  if (node.radioChoices.length === 0) return false;
  for (var i = 0; i < node.radioChoices.length; i++) {
    // base でも flip でも表示中なら「未選択ではない」
    if (choiceIsVisible(node.radioChoices[i], node.visibleSet)) return false;
  }
  return true;
}

// PSD 取り込み時の表示状態（enabled）から既定の表示中集合を作る。
// セットアップの既定マーカーと同じ思想（排他=表示中の変種1つ / 任意=表示中すべて）。
// registerLayers が目を点ける前に呼ぶこと。
function collectDefaultVisibleNames(node) {
  function enabledOf(ly) {
    try {
      return !!(ly && ly.enabled);
    } catch (e) {
      return false;
    }
  }
  function visibleVariantName(choice) {
    if (enabledOf(choice.layer)) return choice.fullName;
    var flips = choice.flips || [];
    for (var f = 0; f < flips.length; f++) {
      if (enabledOf(flips[f].layer)) return flips[f].fullName;
    }
    return null;
  }
  var names = [];
  var i;
  for (i = 0; i < node.radioChoices.length; i++) {
    var vis = visibleVariantName(node.radioChoices[i]);
    if (vis) {
      names.push(vis); // 排他は最初に表示中だった1つだけ
      break;
    }
  }
  for (i = 0; i < node.optionalChoices.length; i++) {
    var ov = visibleVariantName(node.optionalChoices[i]);
    if (ov) names.push(ov);
  }
  return names;
}

/**
 * 制御ヌルが無ければこの場で用意する（セットアップ未実行のグループ対策）。
 * 無いまま registerLayers すると式が参照先を失って全非表示になり、マーカー書き込みも無言で失敗する。
 * セットアップ相当の付帯処理も最小限で行う:
 * - コンポ名の衝突解消（複数立ち絵の「口」同名対策。「口 2」形式）。
 *   <ルート名>_ を付ける正規の一意化はセットアップの仕事のまま
 *   （立ち絵タブのルートはシーンコンポのことがあり、誤った prefix を焼き込むと後のセットアップで多段リネームになるため）
 * - 既定マーカー（登録で目が点く前の表示状態を保存。無いと初クリックで任意指定パーツが全部消える）
 */
function ensureCtrlLayerForNode(node) {
  var existing = findCtrlLayerInComp(node.ctrlComp, node.comp.name, 0);
  if (existing) {
    // 制御はあるがマーカー皆無（過去バージョンの残骸等）なら既定マーカーだけ補う
    var hasMarkers = false;
    try {
      hasMarkers = existing.property("Marker").numKeys > 0;
    } catch (eM) {}
    if (!hasMarkers) {
      writeMarkerNameAtTime(
        node.ctrlComp,
        node.comp.name,
        0,
        collectDefaultVisibleNames(node).join(","),
      );
    }
    return;
  }

  // 自コンポ＝制御コンポは改名しない（式の comp("制御名") 参照を壊さない）
  if (
    node.comp.id !== node.ctrlComp.id &&
    !node.isRoot &&
    compNameTaken(node.comp.name, node.comp)
  ) {
    var oldName = node.comp.name;
    node.comp.name = makeUniqueCompName(oldName, node.comp);
    migrateGroupRename(node.comp, oldName, node.comp.name);
  }

  var defaultNames = collectDefaultVisibleNames(node);
  createCtrlLayer(node.ctrlComp, node.comp.name);
  writeMarkerNameAtTime(node.ctrlComp, node.comp.name, 0, defaultNames.join(","));
}

/**
 * 既存のマーカー運用に、静的に表示されていた未登録レイヤーを合流させる。
 * 未登録レイヤーはマーカーに関係なく表示されているため、そのまま登録すると
 * 集合に名前が無く消えてしまう（元から目が点いていた表情が、隣の選択肢をクリックした瞬間に消える）。
 * 見た目を変えないよう各集合へ補う:
 *   任意: この選択肢のどの変種も含まない集合すべてに追加
 *   排他: このノードの排他変種がどれも含まれない集合にだけ追加
 *        （既に別の排他が選ばれている区間はマーカーが真実＝静的表示との二重表示をここで解消する）
 * 既定マーカー作成直後は名前が既に入っているため何も起きない（冪等）。
 */
function mergeVisibleIntoMarkers(node, entries) {
  if (!entries || entries.length === 0) return;
  var ctrlName = getCtrlLayerName(node.comp.name);
  var radioAll = collectRadioVariantNames(node);
  for (var i = 1; i <= node.ctrlComp.numLayers; i++) {
    var ly = node.ctrlComp.layer(i);
    if (ly.name !== ctrlName) continue;
    var marker;
    try {
      marker = ly.property("Marker");
    } catch (e) {
      continue;
    }
    for (var k = 1; k <= marker.numKeys; k++) {
      var set = parseSetString(marker.keyValue(k).comment);
      var changed = false;
      for (var e2 = 0; e2 < entries.length; e2++) {
        var ent = entries[e2];
        if (indexOfName(set, ent.name) >= 0) continue;
        // 排他は「同ノードの排他変種のどれか」、任意は「自分の変種」が既に集合に居るなら追加しない
        var blockers =
          ent.kind === "radio" ? radioAll : choiceAllNames(ent.choice);
        var represented = false;
        for (var b = 0; b < blockers.length; b++) {
          if (indexOfName(set, blockers[b]) >= 0) {
            represented = true;
            break;
          }
        }
        if (represented) continue;
        set.push(ent.name);
        changed = true;
      }
      if (changed) {
        marker.setValueAtTime(marker.keyTime(k), new MarkerValue(set.join(",")));
      }
    }
  }
}

/**
 * マーカー由来の表示中集合に「未登録（式なし）で目が点いている」選択肢を合成する。
 * 未登録レイヤーはマーカーに関係なく見えているため、チェック表示・未選択警告が見た目と一致するようにする
 * （クリック時は ensureNodeRegistered が合流させる）。
 */
function augmentVisibleSetWithStatic(node, set) {
  var out = set.slice();
  function addStaticVariants(choice) {
    var variants = [{ fullName: choice.fullName, layer: choice.layer }];
    var fl = choice.flips || [];
    for (var f = 0; f < fl.length; f++) {
      variants.push({ fullName: fl[f].fullName, layer: fl[f].layer });
    }
    for (var v = 0; v < variants.length; v++) {
      var ly = variants[v].layer;
      if (!ly || isManagedStageLayer(ly)) continue;
      var vis = false;
      try {
        vis = !!ly.enabled;
      } catch (e) {}
      if (vis && indexOfName(out, variants[v].fullName) < 0) {
        out.push(variants[v].fullName);
      }
    }
  }
  var i;
  for (i = 0; i < node.radioChoices.length; i++) {
    addStaticVariants(node.radioChoices[i]);
  }
  for (i = 0; i < node.optionalChoices.length; i++) {
    addStaticVariants(node.optionalChoices[i]);
  }
  return out;
}

// この階層の選択肢レイヤー（ラジオ/任意）が表示制御に応答できる状態か保証する。
// PSD で非表示だったレイヤーは AE 上で目(enabled)が消えて取り込まれ、未登録だと
// マーカーを切り替えても表示されない。クリック時に登録＋目ONを確実にしておく。
// 制御ヌル自体が無いグループ（セットアップ未実行）はここで作る。
// 戻り値: 新規に emo 登録したレイヤー数
function ensureNodeRegistered(node) {
  if (!node || !node.ctrlComp) return 0;
  ensureCtrlLayerForNode(node);

  var toReg = [];
  var mergeEntries = []; // 登録直前に表示状態だった新規登録レイヤー（マーカー合流用）
  function collectChoice(choice, kind) {
    var variants = [{ fullName: choice.fullName, layer: choice.layer }];
    var fl = choice.flips || [];
    for (var f = 0; f < fl.length; f++) {
      variants.push({ fullName: fl[f].fullName, layer: fl[f].layer });
    }
    for (var v = 0; v < variants.length; v++) {
      var ly = variants[v].layer;
      if (!ly) continue;
      if (
        !isRegistered(ly) &&
        !hasOpacitySignature(ly, LAB_MAP_SIGNATURE) &&
        !hasOpacitySignature(ly, BLINK_SIGNATURE)
      ) {
        var wasVisible = false;
        try {
          wasVisible = !!ly.enabled;
        } catch (eV) {}
        if (wasVisible) {
          mergeEntries.push({
            name: variants[v].fullName,
            kind: kind,
            choice: choice,
          });
        }
        toReg.push(ly);
      } else {
        // 既に式が付いていても、PSD 由来で目が消えていれば点ける
        try {
          ly.enabled = true;
        } catch (e) {}
      }
    }
  }
  var i;
  for (i = 0; i < node.radioChoices.length; i++) {
    collectChoice(node.radioChoices[i], "radio");
  }
  for (i = 0; i < node.optionalChoices.length; i++) {
    collectChoice(node.optionalChoices[i], "opt");
  }

  // 静的に表示されていた未登録レイヤーを既存マーカーへ合流（登録の瞬間に消えない）
  mergeVisibleIntoMarkers(node, mergeEntries);

  if (toReg.length > 0) {
    return registerLayers(
      node.comp,
      node.ctrlComp.name,
      toReg,
      "emo2layer: 立ち絵 自動登録",
    );
  }
  return 0;
}

// ══════════════════════════════════════════════════════════════════
// 口パク/目パチ適用時の自動 emo 登録（グループ単位）
// ══════════════════════════════════════════════════════════════════
// 式の登録がクリック時に移ったため、立ち絵タブを経由していないグループへ
// 口パク/目パチを適用すると、表情連動（emoCtx）とグループ優先サプレスが成立しない。
// 適用前に対象コンポを「クリックしたのと同じ状態」にする。

// rootComp の参照ツリーに targetComp が含まれるか（コンポ参照の DFS）
function compTreeContains(rootComp, targetComp) {
  var seen = {};
  function walkTree(c) {
    if (!c || seen[c.id]) return false;
    seen[c.id] = true;
    if (c.id === targetComp.id) return true;
    for (var i = 1; i <= c.numLayers; i++) {
      var src = null;
      try {
        src = c.layer(i).source;
      } catch (e) {}
      if (src && src instanceof CompItem && walkTree(src)) return true;
    }
    return false;
  }
  return walkTree(rootComp);
}

/**
 * パーツコンポの制御コンポを解決する（適用時の自動登録用）。
 *   1) コンポ内の登録済みレイヤーの式から
 *   2) [Emo] <コンポ名> の制御レイヤーを既に持つコンポ
 *   3) セットアップ済み（emoSetup タグ）ルートの配下なら、その emoCtrl 指定
 * 解決できなければ null（自動登録はスキップ＝従来どおり単独式になる）
 */
function resolveCtrlCompForApply(comp) {
  var i;
  for (i = 1; i <= comp.numLayers; i++) {
    var ctx = parseEmoContext(comp.layer(i));
    if (ctx) {
      var byExpr = findCompByName(ctx.ctrlCompName);
      if (byExpr) return byExpr;
    }
  }
  var comps = getProjectComps();
  for (i = 0; i < comps.length; i++) {
    if (findCtrlLayerInComp(comps[i], comp.name, 0)) return comps[i];
  }
  for (i = 0; i < comps.length; i++) {
    if (!hasSetupTag(comps[i])) continue;
    if (comps[i].id !== comp.id && !compTreeContains(comps[i], comp)) continue;
    var tagged = readCtrlCompTag(comps[i]);
    var taggedComp = tagged ? findCompByName(tagged) : null;
    return taggedComp || comps[i];
  }
  return null;
}

/**
 * scanPsdCompTree の group を立ち絵ノード形式へ変換する（このコンポ 1 階層分）。
 * ensureNodeRegistered を口パク/目パチの適用フローから再利用するため。
 */
function buildNodeForComp(comp, ctrlComp) {
  var groups = scanPsdCompTree(comp);
  var group = null;
  for (var g = 0; g < groups.length; g++) {
    if (groups[g].comp.id === comp.id) {
      group = groups[g];
      break;
    }
  }
  if (!group) return null;
  var radio = [];
  var optional = [];
  var i;
  for (i = 0; i < group.exclusiveLayers.length; i++) {
    var ex = group.exclusiveLayers[i];
    radio.push({
      fullName: ex.layer.name,
      label: ex.parsed.base,
      layer: ex.layer,
      flips: [],
    });
  }
  for (i = 0; i < group.optionalLayers.length; i++) {
    var op = group.optionalLayers[i];
    optional.push({
      fullName: op.layer.name,
      label: op.parsed.base,
      layer: op.layer,
      flips: [],
    });
  }
  // 反転バリエーションを base に束ねる（buildStageNodes と同じペア規則）
  for (i = 0; i < group.flipVariants.length; i++) {
    var fv = group.flipVariants[i];
    if (fv.parsed.forced) continue;
    var pool = fv.parsed.exclusive ? radio : optional;
    for (var p = 0; p < pool.length; p++) {
      if (pool[p].label === fv.parsed.base) {
        pool[p].flips.push({
          suffix: flipSuffixOf(fv.parsed),
          fullName: fv.layer.name,
          layer: fv.layer,
        });
        break;
      }
    }
  }
  return {
    comp: comp,
    ctrlComp: ctrlComp,
    isRoot: false,
    radioChoices: radio,
    optionalChoices: optional,
    forcedChoices: [],
  };
}

/**
 * 適用対象コンポを、立ち絵タブでクリックしたのと同じ状態（制御レイヤー・
 * 既定マーカー・グループ全選択肢の emo 登録・静的表示の合流）にする。
 * 戻り値: 新規登録したレイヤー数（制御が解決できなければ -1 ＝スキップ）
 */
function ensureCompRegisteredForApply(comp) {
  var ctrlComp = resolveCtrlCompForApply(comp);
  if (!ctrlComp) return -1;
  var node = buildNodeForComp(comp, ctrlComp);
  if (!node) return -1;
  return ensureNodeRegistered(node);
}
