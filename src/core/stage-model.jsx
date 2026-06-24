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

function buildStageNodes(rootComp) {
  var visited = {};
  if (!rootComp) return [];
  var stageRootPrefix = rootComp.name + "_";
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

      var parsed = parseMarkerName(layer.name, compPrefix);

      var src = null;
      try {
        src = layer.source;
      } catch (e) {}
      var isFolder = !!(src && src instanceof CompItem);

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
        // 立ち絵の部品はセットアップ時に必ず管理下の式（emo/口パク/目パチ）が
        // 付くので、ルート直下では「フォルダ」か「管理下の式を持つ」ものだけを
        // 任意指定として出し、それ以外（装飾レイヤー）は除外する。
        // ネストした部品コンポ内の無印リーフは従来どおり出す（クリックで自動登録できる）。
        if (isRoot && !isFolder && !isManagedStageLayer(layer)) {
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

// この階層の選択肢レイヤー（ラジオ/任意）が表示制御に応答できる状態か保証する。
// PSD で非表示だったレイヤーは AE 上で目(enabled)が消えて取り込まれ、未登録だと
// マーカーを切り替えても表示されない。クリック時に登録＋目ONを確実にしておく。
function ensureNodeRegistered(node) {
  if (!node || !node.ctrlComp) return;
  var arrs = [node.radioChoices, node.optionalChoices];
  var toReg = [];
  // base レイヤーと、そのペアの反転レイヤーをまとめて対象にする
  var layers = [];
  for (var a = 0; a < arrs.length; a++) {
    for (var i = 0; i < arrs[a].length; i++) {
      if (arrs[a][i].layer) layers.push(arrs[a][i].layer);
      var fl = arrs[a][i].flips || [];
      for (var f = 0; f < fl.length; f++) {
        if (fl[f].layer) layers.push(fl[f].layer);
      }
    }
  }
  for (var k = 0; k < layers.length; k++) {
    var ly = layers[k];
    if (!ly) continue;
    if (
      !isRegistered(ly) &&
      !hasOpacitySignature(ly, LAB_MAP_SIGNATURE) &&
      !hasOpacitySignature(ly, BLINK_SIGNATURE)
    ) {
      toReg.push(ly);
    } else {
      // 既に式が付いていても、PSD 由来で目が消えていれば点ける
      try {
        ly.enabled = true;
      } catch (e) {}
    }
  }
  if (toReg.length > 0) {
    registerLayers(
      node.comp,
      node.ctrlComp.name,
      toReg,
      "emo2layer: 立ち絵 自動登録",
    );
  }
}
