/**
 * EmoLabMaker.jsx
 * @version 1.22.0
 * @description 立ち絵 + 口パク + 目パチ + PSDセットアップ + 詳細 統合パネル
 *   Tab "立ち絵" : 立ち絵の階層（目/口/服…）をまとめて表示し、各階層を独立に切り替える(日常のハブ)
 *                 マーカーは「表示中レイヤー名の集合」で、ラジオ(*)と任意指定(無印)を統一的に扱う
 *                 * / ! はコンポにも適用。上位未選択や ! はグレーアウト。折り返し+縦スクロール対応
 *                 :flipx/:flipy の反転ペアはグローバル反転ボタンで base⇔flip を一括スワップ
 *   Tab "口パク" : labファイルを解析して音素レイヤーを生成 + 口形状マッピング (PSDToolKit互換)
 *   Tab "目パチ" : 開き/中間/閉じ目を割り当てて自動まばたきを設定
 *   Tab "PSD"    : PSDToolKit 命名規則 (* / ! / 無印) の立ち絵 PSD から表情切替を自動セットアップ
 *   Tab "詳細"   : PSDToolKit を使わない手動・単一選択向けのレガシーモード（低レベル編集 + 表情セット）
 */

(function emoLabMaker(thisObj) {
  // ════════════════════════════════════════════════════════════════
  // 共通定数
  // ════════════════════════════════════════════════════════════════
  var BUTTON_HEIGHT = 24;
  var EMO_VERSION = "1.22.0";
  var LAB_MAP_SIGNATURE = "lab2layerPhonemeMap";
  var BLINK_SIGNATURE = "emoBlinkAuto";

  // ════════════════════════════════════════════════════════════════
  // 設定（app.settings で AE 環境に永続化。プロジェクト非依存）
  // ════════════════════════════════════════════════════════════════
  var SETTINGS_SECTION = "EmoLabMaker";
  function getSettingBool(key, def) {
    try {
      if (app.settings.haveSetting(SETTINGS_SECTION, key)) {
        return app.settings.getSetting(SETTINGS_SECTION, key) === "true";
      }
    } catch (e) {}
    return def;
  }
  function setSettingBool(key, val) {
    try {
      app.settings.saveSetting(SETTINGS_SECTION, key, val ? "true" : "false");
    } catch (e) {}
  }
  function getSettingNum(key, def) {
    try {
      if (app.settings.haveSetting(SETTINGS_SECTION, key)) {
        var v = parseFloat(app.settings.getSetting(SETTINGS_SECTION, key));
        if (!isNaN(v)) return v;
      }
    } catch (e) {}
    return def;
  }
  function setSettingNum(key, val) {
    try {
      app.settings.saveSetting(SETTINGS_SECTION, key, String(val));
    } catch (e) {}
  }
  function getSettingStr(key, def) {
    try {
      if (app.settings.haveSetting(SETTINGS_SECTION, key)) {
        return app.settings.getSetting(SETTINGS_SECTION, key);
      }
    } catch (e) {}
    return def;
  }
  function setSettingStr(key, val) {
    try {
      app.settings.saveSetting(SETTINGS_SECTION, key, String(val));
    } catch (e) {}
  }

  // 立ち絵タブの表示設定（起動時に読み込み）
  var cfgFollowPlayhead = getSettingBool("followPlayhead", true);
  var cfgShowForced = getSettingBool("showForced", true);
  var cfgHideInactive = getSettingBool("hideInactive", false);
  var cfgIndentWidth = getSettingNum("indentWidth", 14);

  // 口パクのタイミング設定（ミリ秒。起動時に読み込み・変更時に永続化）
  var cfgLabOffsetMs = getSettingNum("labOffsetMs", 0); // 全体シフト（映像先行）
  // ラボの終了時刻に「閉じ音素」を自動追加（末尾の口が開いたまま残るのを防ぐ）
  var cfgLabAutoClose = getSettingBool("labAutoClose", true);

  // ファイル一括読み込みで配置する対象（永続化）
  var cfgImportLab = getSettingBool("importLab", true); // .lab → 口パクマーカー
  var cfgImportTxt = getSettingBool("importTxt", true); // .txt → テキスト(字幕)レイヤー
  var cfgImportWav = getSettingBool("importWav", true); // .wav → 音声レイヤー
  // 一括読み込みで配置する音素（空＝すべて）。既定は母音＋ん＋閉じ系
  var cfgImportPhonemes = getSettingStr(
    "importPhonemes",
    "a,i,u,e,o,N,pau,sil,cl,Q,br"
  );

  // ════════════════════════════════════════════════════════════════
  // 共通ユーティリティ
  // ════════════════════════════════════════════════════════════════

  function getActiveComp() {
    var item = app.project ? app.project.activeItem : null;
    return item && item instanceof CompItem ? item : null;
  }

  function getProjectComps() {
    var comps = [];
    if (!app.project) return comps;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem) comps.push(item);
    }
    return comps;
  }

  // ── PSD 立ち絵ルートコンポの判定（PSDタブのドロップダウン用） ──
  // AE の PSD 取り込み（コンポジション）は「<名前> レイヤー / <name> Layers」
  // フォルダを作る。これがあれば PSD 由来のルートコンポと判定できる。
  function hasPsdLayersFolder(comp) {
    if (!comp || !app.project) return false;
    var base = comp.name;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (
        it instanceof FolderItem &&
        (it.name === base + " レイヤー" || it.name === base + " Layers")
      ) {
        return true;
      }
    }
    return false;
  }

  // コンポ内に .psd 由来のフッテージレイヤーがあるか
  function hasPsdFootage(comp) {
    try {
      for (var i = 1; i <= comp.numLayers; i++) {
        var src = comp.layer(i).source;
        if (src && src.mainSource && src.mainSource.file) {
          var nm = String(src.mainSource.file.name || "").toLowerCase();
          if (nm.length >= 4 && nm.substring(nm.length - 4) === ".psd") {
            return true;
          }
        }
      }
    } catch (e) {}
    return false;
  }

  function isItemAtProjectRoot(comp) {
    try {
      return comp.parentFolder === app.project.rootFolder;
    } catch (e) {
      return false;
    }
  }

  // PSDタブに出す候補 = プロジェクト直下のコンポのうち、
  // PSD 由来（レイヤーフォルダ or .psd フッテージ）か、セットアップ済み（[Emo]）のもの。
  // 検出できなければ直下コンポ全部 → それも無ければアクティブコンポにフォールバック。
  function collectPsdRootCandidates() {
    var all = getProjectComps();
    var out = [];
    var rootLevel = [];
    var i;
    for (i = 0; i < all.length; i++) {
      if (!isItemAtProjectRoot(all[i])) continue;
      rootLevel.push(all[i]);
      if (
        hasPsdLayersFolder(all[i]) ||
        hasPsdFootage(all[i]) ||
        hasCtrlPrefixedLayer(all[i])
      ) {
        out.push(all[i]);
      }
    }
    if (out.length > 0) return out;
    if (rootLevel.length > 0) return rootLevel;
    var ac = getActiveComp();
    return ac ? [ac] : [];
  }

  // コンポが PSD の「XXXX レイヤー / XXXX Layers」フォルダの中にあるか
  function isInsidePsdLayersFolder(comp) {
    try {
      var p = comp.parentFolder;
      if (!p || p === app.project.rootFolder) return false;
      var nm = String(p.name || "");
      return (
        (nm.length >= 5 && nm.substring(nm.length - 5) === " レイヤー") ||
        (nm.length >= 7 && nm.substring(nm.length - 7) === " Layers")
      );
    } catch (e) {
      return false;
    }
  }

  // rootComp の配下にネストされた全コンポ（部品）を seen に記録（rootComp 自身は含めない）
  function collectStageDescendants(rootComp, seen) {
    if (!rootComp) return;
    for (var i = 1; i <= rootComp.numLayers; i++) {
      var src = null;
      try {
        src = rootComp.layer(i).source;
      } catch (e) {}
      if (src && src instanceof CompItem && !seen[src.id]) {
        seen[src.id] = true;
        collectStageDescendants(src, seen);
      }
    }
  }

  // 制御コンポ候補。制御は「全体設定」なので、PSD立ち絵ルートより下（口・目などの
  // 部品コンポ）には置けないようにする。ルート自身・シーンコンポ・無関係コンポは可。
  //   除外: 「XXXX レイヤー」フォルダ内のコンポ／立ち絵ルート配下の部品コンポ
  //   立ち絵ルート = 「<名前> レイヤー」フォルダを持つコンポ（PSD取込の本体）
  function collectCtrlCandidates() {
    var all = getProjectComps();
    var roots = [];
    var rootIds = {};
    var i;
    for (i = 0; i < all.length; i++) {
      if (hasPsdLayersFolder(all[i])) {
        roots.push(all[i]);
        rootIds[all[i].id] = true;
      }
    }
    var descendants = {};
    for (i = 0; i < roots.length; i++) {
      collectStageDescendants(roots[i], descendants);
    }
    var out = [];
    for (i = 0; i < all.length; i++) {
      var c = all[i];
      if (isInsidePsdLayersFolder(c)) continue; // レイヤーフォルダ内の部品
      if (descendants[c.id] && !rootIds[c.id]) continue; // ルート配下の部品コンポ
      out.push(c);
    }
    if (out.length === 0) return all; // 検出できなければ全件（安全側）
    return out;
  }

  function findCompByName(name) {
    if (!name) return null;
    var comps = getProjectComps();
    for (var i = 0; i < comps.length; i++) {
      if (comps[i].name === name) return comps[i];
    }
    return null;
  }

  // ── 取り消しグループ（ネスト対策） ───────────────────────────────
  // beginUndo/endUndo はネストしても最外だけが実際の AE undo group を作る。
  // これにより 1 ユーザー操作 = 1 取り消し単位 になり、Ctrl+Z の不整合を防ぐ。
  var __undoDepth = 0;
  function beginUndo(name) {
    if (__undoDepth <= 0) {
      __undoDepth = 0;
      app.beginUndoGroup(name);
    }
    __undoDepth++;
  }
  function endUndo() {
    __undoDepth--;
    if (__undoDepth <= 0) {
      __undoDepth = 0;
      app.endUndoGroup();
    }
  }

  // ════════════════════════════════════════════════════════════════
  // ウィンドウ / タブ
  // ════════════════════════════════════════════════════════════════

  var win =
    thisObj instanceof Panel
      ? thisObj
      : new Window("palette", "emoLabMaker", undefined, { resizeable: true });

  win.orientation = "column";
  win.alignChildren = ["fill", "fill"];
  win.spacing = 0;
  win.margins = 6;

  var tabs = win.add("tabbedpanel");
  tabs.alignment = ["fill", "fill"];

  // バージョン表示（右下の隅）
  var versionRow = win.add("group");
  versionRow.orientation = "row";
  versionRow.alignment = ["fill", "bottom"];
  versionRow.alignChildren = ["right", "center"];
  versionRow.margins = [0, 0, 2, 0];
  var versionText = versionRow.add(
    "statictext",
    undefined,
    "v" + EMO_VERSION
  );
  versionText.alignment = ["right", "center"];
  versionText.helpTip = "EmoLabMaker version " + EMO_VERSION;
  try {
    versionText.graphics.foregroundColor = versionText.graphics.newPen(
      versionText.graphics.PenType.SOLID_COLOR,
      [0.5, 0.5, 0.5, 1],
      1
    );
  } catch (eVc) {}

  // 表示順は作業フロー基準: 立ち絵(日常のハブ) → 口パク → 目パチ → PSD(初期セットアップ) → 詳細(旧レイヤー選択)
  var tabStage = tabs.add("tab", undefined, "立ち絵");
  var tabLab = tabs.add("tab", undefined, "口パク");
  var tabBlink = tabs.add("tab", undefined, "目パチ");
  var tabPsd = tabs.add("tab", undefined, "PSD");
  var tabSelector = tabs.add("tab", undefined, "詳細");

  tabSelector.orientation = "column";
  tabSelector.alignChildren = ["fill", "top"];
  tabSelector.spacing = 8;
  tabSelector.margins = 8;

  tabBlink.orientation = "column";
  tabBlink.alignChildren = ["fill", "top"];
  tabBlink.spacing = 8;
  tabBlink.margins = 8;

  tabLab.orientation = "column";
  tabLab.alignChildren = ["fill", "top"];
  tabLab.spacing = 8;
  tabLab.margins = 8;

  tabPsd.orientation = "column";
  tabPsd.alignChildren = ["fill", "top"];
  tabPsd.spacing = 8;
  tabPsd.margins = 8;

  tabStage.orientation = "column";
  tabStage.alignChildren = ["fill", "top"];
  tabStage.spacing = 8;
  tabStage.margins = 8;

  tabs.selection = 0;

  // ════════════════════════════════════════════════════════════════
  //
  //  タブ「詳細」: emo2layer（レイヤー選択・レガシー）
  //
  // ════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════
  // 定数
  // ══════════════════════════════════════════════════════════════════
  var CTRL_PREFIX = "[Emo] ";
  var EXPR_SIGNATURE = "emo2layerCtrlMarker";
  var LABEL_WIDTH = 40;
  var DROPDOWN_MIN_W = 140;
  var GRID_MIN_BTN_W = 60;
  var GRID_SPACING = 6;
  var MARKER_EPSILON = 0.0001;
  var PANEL_MARGIN = 8;

  // ══════════════════════════════════════════════════════════════════
  // コンポ ユーティリティ
  // ══════════════════════════════════════════════════════════════════

  function getSelectedComp(dropdown) {
    return dropdown.selection ? findCompByName(dropdown.selection.text) : null;
  }

  // ══════════════════════════════════════════════════════════════════
  // 制御レイヤー ユーティリティ
  // ══════════════════════════════════════════════════════════════════

  function getCtrlLayerName(targetCompName) {
    return CTRL_PREFIX + targetCompName;
  }

  /**
   * ctrlComp 内で time に有効な制御レイヤーを探す。
   * 時刻に合うものがなければ最初に見つかったもの（フォールバック）を返す。
   */
  function findCtrlLayerInComp(ctrlComp, targetCompName, time) {
    if (!ctrlComp) return null;
    var ctrlName = getCtrlLayerName(targetCompName);
    var fallback = null;
    for (var i = 1; i <= ctrlComp.numLayers; i++) {
      var layer = ctrlComp.layer(i);
      if (layer.name !== ctrlName) continue;
      if (!fallback) fallback = layer;
      if (time >= layer.inPoint && time < layer.outPoint) return layer;
    }
    return fallback;
  }

  /**
   * 制御レイヤーを作成する。
   * inPoint の直接代入は読み取り専用になるバージョンがあるため
   * startTime を操作してコンプ全体をカバーさせる。
   */
  // 制御ヌルを目立たなくする（マーカーは無効レイヤーでも式から読めるので動作に影響なし）。
  //   enabled=false : プレビューに枠が出ない・描画されない
  //   shy/guideLayer: タイムライン/書き出しから隠す
  //   source 名も "[Emo] …" にしてプロジェクトの「ヌル N」散らかりを解消
  function hideCtrlLayer(layer, name) {
    try { layer.shy = true; } catch (e) {}
    try { layer.guideLayer = true; } catch (e) {}
    try { layer.enabled = false; } catch (e) {}
    try { layer.label = 11; } catch (e) {}
    try {
      if (layer.source && layer.source.name !== name) layer.source.name = name;
    } catch (e) {}
  }

  function createCtrlLayer(ctrlComp, targetCompName) {
    var name = getCtrlLayerName(targetCompName);
    var existing = findCtrlLayerInComp(ctrlComp, targetCompName, 0);
    if (existing) {
      hideCtrlLayer(existing, name); // 既存も毎回隠す（過去に作った可視ヌルの掃除）
      return existing;
    }

    var layer = ctrlComp.layers.addNull(ctrlComp.duration);
    layer.name = name;
    layer.startTime = 0;
    // outPoint をコンプ末尾に合わせる（startTime 操作後に設定）
    try {
      layer.outPoint = ctrlComp.duration;
    } catch (e) {}
    // 制御ヌルは最下部へ。addNull は最上位(index 1)に積むため、複数作ると
    // 立ち絵の上に逆順で重なってしまう。最下部に集めると作成順かつ邪魔にならない。
    try {
      layer.moveToEnd();
    } catch (eMove) {}
    hideCtrlLayer(layer, name);
    return layer;
  }

  // ══════════════════════════════════════════════════════════════════
  // エクスプレッション
  // ══════════════════════════════════════════════════════════════════

  // 式へ二重引用符文字列として埋め込む文字列をエスケープする。
  // コンポ名・レイヤー名・CSV に " \ 改行 が含まれても式が壊れないようにする。
  function escapeExprStr(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "")
      .replace(/\n/g, "\\n");
  }

  /**
   * 表情マーカーのロジック部分（制御レイヤー探索 + 現在マーカー名取得）。
   * emo 単独式と、口パク/目パチの合成式で共有する。
   */
  function buildEmoMarkerSnippet(ctrlCompName, targetCompName) {
    return [
      'var ctrlComp = comp("' + escapeExprStr(ctrlCompName) + '");',
      'var ctrlName = "' + escapeExprStr(getCtrlLayerName(targetCompName)) + '";',
      // 名前で直接アクセス（全レイヤー走査をやめて再生負荷を大幅に下げる）。
      // 名前一致レイヤーが現在時刻で有効ならそのまま使う（高速パス）。
      // in/out が切られている等で無効なときだけ time 有効な同名レイヤーを探す。
      "function findCtrlLayer() {",
      "  var byName = null;",
      "  try { byName = ctrlComp.layer(ctrlName); } catch (e) { byName = null; }",
      "  if (byName && time >= byName.inPoint && time < byName.outPoint) return byName;",
      "  for (var i = 1; i <= ctrlComp.numLayers; i++) {",
      "    var ly = ctrlComp.layer(i);",
      "    if (ly.name === ctrlName && time >= ly.inPoint && time < ly.outPoint) return ly;",
      "  }",
      "  return byName;",
      "}",
      "function getCurrentMarkerName(ctrlLayer) {",
      "  if (!ctrlLayer) return null;",
      "  var marker = ctrlLayer.marker;",
      "  if (marker.numKeys === 0) return null;",
      "  var index = marker.nearestKey(time).index;",
      "  if (marker.key(index).time > time) index--;",
      "  if (index < 1) return null;",
      "  return marker.key(index).comment;",
      "}",
    ];
  }

  function buildOpacityExpression(ctrlCompName, targetCompName) {
    return ["// " + EXPR_SIGNATURE]
      .concat(buildEmoMarkerSnippet(ctrlCompName, targetCompName))
      .concat([
        "var ctrlLayer = findCtrlLayer();",
        "var markerName = getCurrentMarkerName(ctrlLayer);",
        // markerName は「表示中レイヤー名の集合」(カンマ区切り)。単一名は1要素集合として一致
        'markerName !== null && ("," + markerName + ",").indexOf("," + thisLayer.name + ",") >= 0 ? 100 : 0;',
      ])
      .join("\n");
  }

  function isRegistered(layer) {
    if (!layer) return false;
    try {
      return layer.transform.opacity.expression.indexOf(EXPR_SIGNATURE) >= 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * 登録済みレイヤーのエクスプレッションから emo の制御情報を読み取る。
   * 合成式（口パク/目パチ）適用時に表情切替の登録を引き継ぐために使う。
   */
  // escapeExprStr の逆変換（式リテラル → 実際の文字列）。
  // 1文字ずつ走査して \\ \" \n を正しく復元する。
  function unescapeExprStr(s) {
    var str = String(s);
    var out = "";
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      if (c === "\\" && i + 1 < str.length) {
        var nx = str.charAt(i + 1);
        if (nx === "n") out += "\n";
        else out += nx; // " や \ はそのまま、それ以外も次文字を採用
        i++;
      } else {
        out += c;
      }
    }
    return out;
  }

  function parseEmoContext(layer) {
    var expr = "";
    try {
      expr = layer.transform.opacity.expression;
    } catch (e) {
      return null;
    }
    if (!expr || expr.indexOf(EXPR_SIGNATURE) < 0) return null;

    // エスケープ済みリテラル（\" \\ を含みうる）を正しく取り出すため、
    // \. または非"非\ の連続をキャプチャしてから unescape する。
    var compMatch = expr.match(/var ctrlComp = comp\("((?:\\.|[^"\\])*)"\);/);
    var nameMatch = expr.match(/var ctrlName = "((?:\\.|[^"\\])*)";/);
    if (!compMatch || !nameMatch) return null;

    var ctrlCompName = unescapeExprStr(compMatch[1]);
    var ctrlName = unescapeExprStr(nameMatch[1]);
    if (ctrlName.indexOf(CTRL_PREFIX) !== 0) return null;

    return {
      ctrlCompName: ctrlCompName,
      targetCompName: ctrlName.substring(CTRL_PREFIX.length),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // 登録 / 解除
  // ══════════════════════════════════════════════════════════════════

  function registerLayers(targetComp, ctrlCompName, layers, undoName) {
    if (!layers || layers.length === 0) return 0;

    var expression = buildOpacityExpression(ctrlCompName, targetComp.name);
    var count = 0;

    beginUndo(undoName || "emo2layer: Register");
    try {
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        if (!layer) continue;
        layer.transform.opacity.expression = expression;
        layer.enabled = true;
        count++;
      }
    } finally {
      endUndo();
    }
    return count;
  }

  function registerSelectedLayers(targetComp, ctrlCompName) {
    return registerLayers(targetComp, ctrlCompName, targetComp.selectedLayers);
  }

  function unregisterSelectedLayers(targetComp) {
    var selected = targetComp.selectedLayers;
    if (!selected || selected.length === 0) return 0;

    var count = 0;
    beginUndo("emo2layer: Unregister");
    try {
      for (var i = 0; i < selected.length; i++) {
        var layer = selected[i];
        if (!layer || !isRegistered(layer)) continue;
        layer.transform.opacity.expression = "";
        layer.transform.opacity.setValue(100);
        count++;
      }
    } finally {
      endUndo();
    }
    return count;
  }

  /**
   * 指定シグネチャを含むエクスプレッションを除去して不透明度を 100 に戻す。
   * undo group は呼び出し側で管理する。
   */
  function removeExpressionBySignature(layers, signature) {
    var count = 0;
    if (!layers) return 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!layer) continue;
      var expr = "";
      try {
        expr = layer.transform.opacity.expression;
      } catch (e) {
        continue;
      }
      if (!expr || expr.indexOf(signature) < 0) continue;
      layer.transform.opacity.expression = "";
      layer.transform.opacity.setValue(100);
      count++;
    }
    return count;
  }

  // ══════════════════════════════════════════════════════════════════
  // 登録レイヤー名の収集
  // ══════════════════════════════════════════════════════════════════

  function collectMarkerNames(targetComp) {
    var names = [];
    var seen = {};
    if (!targetComp) return names;

    for (var i = 1; i <= targetComp.numLayers; i++) {
      var layer = targetComp.layer(i);
      if (!isRegistered(layer) || seen[layer.name]) continue;
      seen[layer.name] = true;
      names.push(layer.name);
    }
    return names;
  }

  function countRegisteredLayers(targetComp) {
    var count = 0;
    if (!targetComp) return 0;
    for (var i = 1; i <= targetComp.numLayers; i++) {
      if (isRegistered(targetComp.layer(i))) count++;
    }
    return count;
  }

  function isCtrlPrefixedLayerName(name) {
    if (!name) return false;
    return name.indexOf(CTRL_PREFIX) === 0 || name.indexOf("[Emo] ") === 0;
  }

  function hasCtrlPrefixedLayer(ctrlComp) {
    if (!ctrlComp) return false;
    for (var i = 1; i <= ctrlComp.numLayers; i++) {
      if (isCtrlPrefixedLayerName(ctrlComp.layer(i).name)) return true;
    }
    return false;
  }

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

  function writeMarkerName(targetComp, ctrlComp, markerName) {
    return writeMarkerNameAtTime(
      ctrlComp,
      targetComp.name,
      targetComp.time,
      markerName
    );
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
  function setRadioSelection(ctrlComp, targetCompName, time, chosenName, radioNames) {
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

  // ══════════════════════════════════════════════════════════════════
  // 表情セット
  // ══════════════════════════════════════════════════════════════════
  // 複数グループ（目・口・眉など）の現在マーカーをまとめて保存し、
  // ワンクリックで一括書き込みする（PSDTool のお気に入り相当）。
  // セットは制御コンポ内の "[EmoSet] <名前>" ガイドレイヤーの
  // コメントに「<対象コンポ名>=<マーカー名>」の行形式で保存する
  // （プロジェクトと一緒に保存され、持ち運べる）

  var SET_PREFIX = "[EmoSet] ";

  /** time 時点で有効なマーカー名（エクスプレッションと同じ判定のスクリプト版） */
  function getCurrentMarkerNameAt(ctrlLayer, time) {
    if (!ctrlLayer) return null;
    var marker;
    try {
      marker = ctrlLayer.property("Marker");
    } catch (e) {
      return null;
    }
    if (!marker || marker.numKeys === 0) return null;
    var name = null;
    for (var i = 1; i <= marker.numKeys; i++) {
      if (marker.keyTime(i) > time + MARKER_EPSILON) break;
      name = marker.keyValue(i).comment;
    }
    return name;
  }

  /** 制御コンポ内の全制御レイヤーの現在状態を {target, marker} の配列で返す */
  function captureEmoSet(ctrlComp) {
    var entries = [];
    var seen = {};
    var time = ctrlComp.time;
    for (var i = 1; i <= ctrlComp.numLayers; i++) {
      var layer = ctrlComp.layer(i);
      if (layer.name.indexOf(CTRL_PREFIX) !== 0) continue;
      var target = layer.name.substring(CTRL_PREFIX.length);
      if (seen[target]) continue;
      seen[target] = true;
      var ctrlLayer = findCtrlLayerInComp(ctrlComp, target, time);
      var markerName = getCurrentMarkerNameAt(ctrlLayer, time);
      if (markerName === null) continue;
      entries.push({ target: target, marker: markerName });
    }
    return entries;
  }

  function parseEmoSetComment(comment) {
    var entries = [];
    var lines = String(comment || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var idx = lines[i].indexOf("=");
      if (idx <= 0) continue;
      entries.push({
        target: lines[i].substring(0, idx),
        marker: lines[i].substring(idx + 1),
      });
    }
    return entries;
  }

  function findEmoSetLayer(ctrlComp, setName) {
    var layerName = SET_PREFIX + setName;
    for (var i = 1; i <= ctrlComp.numLayers; i++) {
      if (ctrlComp.layer(i).name === layerName) return ctrlComp.layer(i);
    }
    return null;
  }

  function collectEmoSetNames(ctrlComp) {
    var names = [];
    if (!ctrlComp) return names;
    for (var i = 1; i <= ctrlComp.numLayers; i++) {
      var layer = ctrlComp.layer(i);
      if (layer.name.indexOf(SET_PREFIX) === 0) {
        names.push(layer.name.substring(SET_PREFIX.length));
      }
    }
    return names;
  }

  /** セットを保存（同名があれば上書き） */
  function saveEmoSet(ctrlComp, setName, entries) {
    var lines = [];
    for (var i = 0; i < entries.length; i++) {
      lines.push(entries[i].target + "=" + entries[i].marker);
    }

    beginUndo("emo2layer: 表情セット保存");
    try {
      var layer = findEmoSetLayer(ctrlComp, setName);
      if (!layer) {
        layer = ctrlComp.layers.addNull(ctrlComp.duration);
        layer.name = SET_PREFIX + setName;
        layer.startTime = 0;
        try {
          layer.outPoint = ctrlComp.duration;
        } catch (e) {}
        layer.shy = true;
        layer.guideLayer = true;
        layer.enabled = false;
        layer.label = 14;
      }
      layer.comment = lines.join("\n");
    } finally {
      endUndo();
    }
  }

  /** セットを制御コンポの現在時刻に一括書き込みする */
  function applyEmoSet(ctrlComp, setName) {
    var layer = findEmoSetLayer(ctrlComp, setName);
    if (!layer) return null;

    var entries = parseEmoSetComment(layer.comment);
    var applied = 0;
    var missing = 0;

    beginUndo("emo2layer: 表情セット適用");
    try {
      for (var i = 0; i < entries.length; i++) {
        var ok = writeMarkerNameAtTime(
          ctrlComp,
          entries[i].target,
          ctrlComp.time,
          entries[i].marker
        );
        if (ok) applied++;
        else missing++;
      }
    } finally {
      endUndo();
    }
    return { applied: applied, missing: missing };
  }

  // ══════════════════════════════════════════════════════════════════
  // グリッドレイアウト計算
  // ══════════════════════════════════════════════════════════════════

  /** markerGridPanel の内側マージンを安全に取得 */
  function getPanelMargin() {
    var m = markerGridPanel.margins;
    if (typeof m === "number") return m;
    if (m && typeof m.left === "number") return m.left;
    return PANEL_MARGIN;
  }

  function getGridColumns() {
    var width = markerGridPanel.size ? markerGridPanel.size.width : 360;
    var columns = Math.floor(width / (GRID_MIN_BTN_W + GRID_SPACING));
    if (columns < 1) columns = 1;
    if (columns > 4) columns = 4;
    return columns;
  }

  function getGridButtonWidth(columns) {
    var panelWidth = markerGridPanel.size ? markerGridPanel.size.width : 360;
    var margin = getPanelMargin();
    var innerWidth = panelWidth - margin * 2;
    var bw = Math.floor((innerWidth - (columns - 1) * GRID_SPACING) / columns);
    return bw < GRID_MIN_BTN_W ? GRID_MIN_BTN_W : bw;
  }

  // panel 引数版（立ち絵タブなど markerGridPanel 以外でも使う）
  function getPanelMarginOf(panel) {
    var m = panel.margins;
    if (typeof m === "number") return m;
    if (m && typeof m.left === "number") return m.left;
    return PANEL_MARGIN;
  }

  function getGridColumnsOf(panel, availWidth) {
    var width = availWidth;
    if (width === undefined || width === null) {
      width = panel.size ? panel.size.width : 360;
    }
    var columns = Math.floor(width / (GRID_MIN_BTN_W + GRID_SPACING));
    if (columns < 1) columns = 1;
    if (columns > 4) columns = 4;
    return columns;
  }

  function getGridButtonWidthOf(panel, columns, availWidth) {
    var panelWidth = availWidth;
    if (panelWidth === undefined || panelWidth === null) {
      panelWidth = panel.size ? panel.size.width : 360;
      panelWidth -= getPanelMarginOf(panel) * 2;
    }
    var bw = Math.floor((panelWidth - (columns - 1) * GRID_SPACING) / columns);
    return bw < GRID_MIN_BTN_W ? GRID_MIN_BTN_W : bw;
  }

  // ══════════════════════════════════════════════════════════════════
  // UI 構築
  // ══════════════════════════════════════════════════════════════════

  // ── タイトル行 ──────────────────────────────────────────────────
  var topRow = tabSelector.add("group");
  topRow.orientation = "row";
  topRow.alignment = ["fill", "top"];
  topRow.alignChildren = ["left", "center"];
  topRow.spacing = 4;

  topRow.add("statictext", undefined, "対象");
  var targetStatusInfo = topRow.add("statictext", undefined, "");
  targetStatusInfo.preferredSize = [16, BUTTON_HEIGHT];

  topRow.add("statictext", undefined, "制御");
  var ctrlLayerInfo = topRow.add("statictext", undefined, "");
  ctrlLayerInfo.preferredSize = [16, BUTTON_HEIGHT];

  function setCheckColor(textNode, rgba) {
    if (!textNode || !textNode.graphics) return;
    var g = textNode.graphics;
    g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, rgba, 1);
  }

  function setCheckState(textNode, checked) {
    if (!textNode) return;
    textNode.text = "✓";
    // checked=true は緑、false は目立たないグレー
    setCheckColor(
      textNode,
      checked ? [0.1, 0.7, 0.2, 1] : [0.35, 0.35, 0.35, 1]
    );
  }

  setCheckState(targetStatusInfo, false);
  setCheckState(ctrlLayerInfo, false);

  var topSpacer = topRow.add("group");
  topSpacer.alignment = ["fill", "center"];

  var refreshAllBtn = topRow.add("button", undefined, "\u21BA");
  refreshAllBtn.alignment = ["right", "center"];
  refreshAllBtn.preferredSize = [24, BUTTON_HEIGHT];
  refreshAllBtn.helpTip = "コンポ一覧を両方再取得";

  var helpBtn = topRow.add("button", undefined, "ヘルプ");
  helpBtn.alignment = ["right", "center"];
  helpBtn.preferredSize = [52, BUTTON_HEIGHT];

  // ── コンポ選択行（共通ファクトリ） ──────────────────────────────
  function addCompRow(parent, labelText, btnText1, btnText2) {
    var row = parent.add("group");
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

    var btn1 = row.add("button", undefined, btnText1);
    btn1.preferredSize = [80, BUTTON_HEIGHT];

    var btn2 = null;
    if (btnText2) {
      btn2 = row.add("button", undefined, btnText2);
      btn2.preferredSize = [72, BUTTON_HEIGHT];
    }

    return { dropdown: dropdown, btn1: btn1, btn2: btn2 };
  }

  var targetRow = addCompRow(tabSelector, "対象", "登録", "解除");
  var ctrlRow = addCompRow(tabSelector, "制御", "制御レイヤー作成", null);

  // ── グリッドヘッダー ─────────────────────────────────────────────
  var markerHeaderRow = tabSelector.add("group");
  markerHeaderRow.orientation = "row";
  markerHeaderRow.alignChildren = ["left", "center"];
  markerHeaderRow.spacing = 10;

  var registeredCountInfo = markerHeaderRow.add(
    "statictext",
    undefined,
    "登録レイヤー: 0"
  );

  // ── マーカーグリッド ─────────────────────────────────────────────
  var markerGridPanel = tabSelector.add("panel");
  markerGridPanel.alignment = ["fill", "fill"];
  markerGridPanel.margins = PANEL_MARGIN;

  var markerGrid = markerGridPanel.add("group");
  markerGrid.orientation = "column";
  markerGrid.alignChildren = ["fill", "top"];
  markerGrid.alignment = ["fill", "fill"];
  markerGrid.spacing = GRID_SPACING;

  // ── 表情セット ───────────────────────────────────────────────────
  var emoSetPanel = tabSelector.add("panel", undefined, "表情セット (一括切替)");
  emoSetPanel.orientation = "row";
  emoSetPanel.alignment = ["fill", "top"];
  emoSetPanel.alignChildren = ["left", "center"];
  emoSetPanel.spacing = 4;
  emoSetPanel.margins = PANEL_MARGIN;

  var emoSetDropdown = emoSetPanel.add("dropdownlist", undefined, []);
  emoSetDropdown.alignment = ["fill", "center"];
  emoSetDropdown.minimumSize = [100, BUTTON_HEIGHT];
  emoSetDropdown.preferredSize.height = BUTTON_HEIGHT;
  emoSetDropdown.helpTip = "制御コンポに保存された表情セット";

  var emoSetApplyBtn = emoSetPanel.add("button", undefined, "適用");
  emoSetApplyBtn.preferredSize = [48, BUTTON_HEIGHT];
  emoSetApplyBtn.helpTip =
    "全グループのマーカーを制御コンポの現在時刻に一括書き込み";

  var emoSetSaveBtn = emoSetPanel.add("button", undefined, "保存");
  emoSetSaveBtn.preferredSize = [48, BUTTON_HEIGHT];
  emoSetSaveBtn.helpTip = "現在の表情（全グループのマーカー状態）をセットとして保存";

  var emoSetDeleteBtn = emoSetPanel.add("button", undefined, "削除");
  emoSetDeleteBtn.preferredSize = [48, BUTTON_HEIGHT];

  // ── ステータスバー ───────────────────────────────────────────────
  var statusText = tabSelector.add(
    "statictext",
    undefined,
    "対象コンポと制御コンポを選択してください。"
  );
  statusText.alignment = ["fill", "bottom"];

  // ══════════════════════════════════════════════════════════════════
  // 状態変数
  // ══════════════════════════════════════════════════════════════════
  var currentMarkerNames = [];
  var currentSelectedMarker = null;
  var isRebuildingGrid = false;

  // ══════════════════════════════════════════════════════════════════
  // ヘルパー UI 関数
  // ══════════════════════════════════════════════════════════════════

  function setStatus(text) {
    statusText.text = text;
  }

  function lockButton(btn, locked) {
    if (btn) btn.enabled = !locked;
  }

  /**
   * 前提条件に応じてボタンの有効・無効を更新する
   *   - 制御レイヤー作成: 対象＋制御コンポが揃っていること
   *   - レイヤー登録/解除: 対象＋制御コンポ＋アクティブコンプが対象と一致
   *   - マーカーボタン: 対象＋制御コンプ＋制御レイヤーが揃っていること
   */
  function updateButtonStates() {
    var targetComp = getSelectedComp(targetRow.dropdown);
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    var activeComp = getActiveComp();

    var hasTargetCtrl = targetComp && ctrlComp;
    var isTargetActive =
      targetComp && activeComp && activeComp.name === targetComp.name;
    var ctrlLayer = hasTargetCtrl
      ? findCtrlLayerInComp(ctrlComp, targetComp.name, targetComp.time)
      : null;
    var hasCtrlLayer = !!ctrlLayer;

    lockButton(ctrlRow.btn1, !hasTargetCtrl);
    lockButton(targetRow.btn1, !(hasTargetCtrl && isTargetActive));
    lockButton(targetRow.btn2, !(hasTargetCtrl && isTargetActive));

    // マーカーグリッド内のボタンは hasCtrlLayer で制御
    for (var i = 0; i < markerGrid.children.length; i++) {
      var row = markerGrid.children[i];
      for (var j = 0; j < row.children.length; j++) {
        row.children[j].enabled = hasCtrlLayer;
      }
    }
  }

  function updateInfo(targetComp) {
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    var hasCtrlLayer = hasCtrlPrefixedLayer(ctrlComp);

    setCheckState(targetStatusInfo, countRegisteredLayers(targetComp) > 0);
    setCheckState(ctrlLayerInfo, hasCtrlLayer);
    registeredCountInfo.text =
      "登録レイヤー: " + countRegisteredLayers(targetComp);
  }

  // ── ドロップダウン再構築 ─────────────────────────────────────────
  function rebuildDropdown(dropdown, selectedName) {
    var comps = getProjectComps();
    dropdown.removeAll();
    for (var i = 0; i < comps.length; i++) {
      dropdown.add("item", comps[i].name);
    }
    if (dropdown.items.length === 0) return;
    for (var j = 0; j < dropdown.items.length; j++) {
      if (dropdown.items[j].text === selectedName) {
        dropdown.selection = j;
        return;
      }
    }
    dropdown.selection = 0;
  }

  // PSDタブ用: 候補コンポ(comps)をドロップダウンに並べる。
  // comps 省略時は PSD 立ち絵ルート候補（ルート用）。
  function rebuildPsdDropdown(dropdown, selectedName, comps) {
    if (!comps) comps = collectPsdRootCandidates();
    dropdown.removeAll();
    for (var i = 0; i < comps.length; i++) {
      dropdown.add("item", comps[i].name);
    }
    if (dropdown.items.length === 0) return;
    for (var j = 0; j < dropdown.items.length; j++) {
      if (dropdown.items[j].text === selectedName) {
        dropdown.selection = j;
        return;
      }
    }
    dropdown.selection = 0;
  }

  function rebuildEmoSetDropdown(selectedName) {
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    var names = collectEmoSetNames(ctrlComp);
    emoSetDropdown.removeAll();
    for (var i = 0; i < names.length; i++) {
      emoSetDropdown.add("item", names[i]);
    }
    if (emoSetDropdown.items.length === 0) return;
    for (var j = 0; j < emoSetDropdown.items.length; j++) {
      if (emoSetDropdown.items[j].text === selectedName) {
        emoSetDropdown.selection = j;
        return;
      }
    }
    emoSetDropdown.selection = 0;
  }

  // ══════════════════════════════════════════════════════════════════
  // マーカーグリッド
  // ══════════════════════════════════════════════════════════════════

  /**
   * ボタンを行優先（row-major）で並べる。
   * 選択中のマーカー名には "✔ " prefix を表示。
   * 前提条件が満たされない場合はボタンを disabled にする。
   */
  function rebuildMarkerGrid() {
    if (isRebuildingGrid) return;
    isRebuildingGrid = true;

    try {
      // 既存ボタン行を全削除
      for (var d = markerGrid.children.length - 1; d >= 0; d--) {
        markerGrid.remove(markerGrid.children[d]);
      }

      var columns = getGridColumns();
      var total = currentMarkerNames.length;
      var rows = total > 0 ? Math.ceil(total / columns) : 0;
      var btnWidth = getGridButtonWidth(columns);

      // 行優先（row-major）: 左→右、上→下
      for (var r = 0; r < rows; r++) {
        var rowGroup = markerGrid.add("group");
        rowGroup.orientation = "row";
        rowGroup.alignment = ["fill", "top"];
        rowGroup.alignChildren = ["left", "center"];
        rowGroup.spacing = GRID_SPACING;

        for (var c = 0; c < columns; c++) {
          var idx = r * columns + c; // row-major index
          if (idx >= total) break;

          var markerName = currentMarkerNames[idx];
          var isSelected = currentSelectedMarker === markerName;
          // \u8868\u793a\u306f base \u540d\uff08* / ! \u3092\u5265\u304c\u3059\uff09\u3002\u5024\u30fbhelpTip \u306f\u5b8c\u5168\u540d\u306e\u307e\u307e
          var baseLabel = parsePsdLayerName(markerName).base;
          var label = isSelected ? "\u2714 " + baseLabel : baseLabel;

          var btn = rowGroup.add("button", undefined, label);
          btn.size = [btnWidth, BUTTON_HEIGHT];
          btn.helpTip = markerName;

          // クロージャでマーカー名をキャプチャ
          btn.onClick = (function (name) {
            return function () {
              var targetComp = getSelectedComp(targetRow.dropdown);
              var ctrlComp = getSelectedComp(ctrlRow.dropdown);
              if (!targetComp || !ctrlComp) return;

              currentSelectedMarker =
                currentSelectedMarker === name ? null : name;

              if (currentSelectedMarker) {
                if (!writeMarkerName(targetComp, ctrlComp, name)) {
                  setStatus("マーカーの書き込みに失敗しました。");
                  currentSelectedMarker = null;
                } else {
                  setStatus("マーカー「" + name + "」を書き込みました。");
                }
              } else {
                setStatus("選択を解除しました。");
              }

              rebuildMarkerGrid();
            };
          })(markerName);
        }
      }

      markerGrid.layout.layout(true);
      markerGridPanel.layout.layout(true);
      updateButtonStates();
    } finally {
      isRebuildingGrid = false;
    }
  }

  /**
   * リサイズ時: ボタン幅と列数を再計算してグリッドを再構築する。
   * （列数が変わりうる Auto モードでは rebuildMarkerGrid が必要）
   */
  function resizeGrid() {
    rebuildMarkerGrid();
  }

  // ══════════════════════════════════════════════════════════════════
  // リスト全体の再構築
  // ══════════════════════════════════════════════════════════════════

  function rebuildList() {
    var targetComp = getSelectedComp(targetRow.dropdown);
    currentMarkerNames = collectMarkerNames(targetComp);

    // 選択中のマーカーが登録レイヤーから消えていたらリセット
    if (currentSelectedMarker) {
      var found = false;
      for (var i = 0; i < currentMarkerNames.length; i++) {
        if (currentMarkerNames[i] === currentSelectedMarker) {
          found = true;
          break;
        }
      }
      if (!found) currentSelectedMarker = null;
    }

    updateInfo(targetComp);
    rebuildMarkerGrid();
    rebuildEmoSetDropdown(
      emoSetDropdown.selection ? emoSetDropdown.selection.text : null
    );

    if (!targetComp) setStatus("対象コンポを選択してください。");
  }

  // ══════════════════════════════════════════════════════════════════
  // ヘルプダイアログ
  // ══════════════════════════════════════════════════════════════════

  function showHelpDialog() {
    var dlg = new Window("dialog", "使い方 - EmoLabMaker");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 16;
    dlg.spacing = 6;
    var lines = [
      "【基本的な流れ】",
      "1. 対象コンポ: 切り替えたいレイヤーが入っているコンポを選択",
      "2. 制御コンポ: マーカーを書き込むコンポを選択（同じでも可）",
      "3. 「制御レイヤー作成」: 制御コンポに制御レイヤーを作成",
      "4. 対象コンポ内でレイヤーを選択して「レイヤー登録」",
      "   → Opacity にエクスプレッションが付きます",
      "5. マーカーボタンをクリック",
      "   → 現在の再生ヘッド位置に名前を書き込みます",
      "   → 再クリックで選択解除",
      "",
      "【登録解除】",
      "対象コンポ内で解除したいレイヤーを選択し「登録解除」",
      "→ Opacity を 100% に戻し、エクスプレッションを削除します",
      "",
      "【ドロップダウン更新】",
      "タイトル行の ↺ ボタンで対象・制御コンポ一覧を一括再取得します。",
      "",
      "【PSDToolKit 互換】",
      "PSD タブ: 立ち絵 PSD (* = 排他 / ! = 強制表示) から表情切替を",
      "自動セットアップ。目パチ (自動まばたき) もここで設定できます。",
      "口パクタブ: 口形状マッピングで あ/い/う/え/お/ん に音素を割当できます。",
    ];
    for (var i = 0; i < lines.length; i++) {
      dlg.add("statictext", undefined, lines[i]);
    }
    dlg.add("button", undefined, "閉じる", { name: "ok" });
    dlg.show();
  }

  // ══════════════════════════════════════════════════════════════════
  // イベントハンドラ
  // ══════════════════════════════════════════════════════════════════

  helpBtn.onClick = function () {
    showHelpDialog();
  };

  // コンポ一覧を両方まとめて再取得
  refreshAllBtn.onClick = function () {
    var tCur = targetRow.dropdown.selection
      ? targetRow.dropdown.selection.text
      : null;
    var cCur = ctrlRow.dropdown.selection
      ? ctrlRow.dropdown.selection.text
      : null;
    rebuildDropdown(targetRow.dropdown, tCur);
    rebuildDropdown(ctrlRow.dropdown, cCur);
    rebuildList();
    setStatus("コンポ一覧を更新しました。");
  };

  // 制御レイヤー作成
  ctrlRow.btn1.onClick = function () {
    var targetComp = getSelectedComp(targetRow.dropdown);
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    if (!targetComp) {
      setStatus("対象コンポを選択してください。");
      return;
    }
    if (!ctrlComp) {
      setStatus("制御コンポを選択してください。");
      return;
    }

    var ctrlLayer = createCtrlLayer(ctrlComp, targetComp.name);
    rebuildList();
    setStatus(
      "制御レイヤーを作成しました: " + ctrlComp.name + " / " + ctrlLayer.name
    );
  };

  // レイヤー登録
  targetRow.btn1.onClick = function () {
    var targetComp = getSelectedComp(targetRow.dropdown);
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    if (!targetComp) {
      setStatus("対象コンポを選択してください。");
      return;
    }
    if (!ctrlComp) {
      setStatus("制御コンポを選択してください。");
      return;
    }

    var activeComp = getActiveComp();
    if (!activeComp || activeComp.name !== targetComp.name) {
      setStatus(
        "対象コンポをアクティブにしてから登録してください: " + targetComp.name
      );
      return;
    }

    var count = registerSelectedLayers(targetComp, ctrlComp.name);
    rebuildList();
    setStatus(count + " レイヤーを登録しました。");
  };

  // 登録解除
  targetRow.btn2.onClick = function () {
    var targetComp = getSelectedComp(targetRow.dropdown);
    if (!targetComp) {
      setStatus("対象コンポを選択してください。");
      return;
    }

    var activeComp = getActiveComp();
    if (!activeComp || activeComp.name !== targetComp.name) {
      setStatus(
        "対象コンポをアクティブにしてから解除してください: " + targetComp.name
      );
      return;
    }

    var count = unregisterSelectedLayers(targetComp);
    rebuildList();
    setStatus(count + " レイヤーの登録を解除しました。");
  };

  targetRow.dropdown.onChange = function () {
    rebuildList();
  };
  ctrlRow.dropdown.onChange = function () {
    rebuildList();
  };

  // ── 表情セット ───────────────────────────────────────────────────

  function promptForSetName(defaultName) {
    var dialog = new Window("dialog", "表情セット名");
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.margins = 16;
    dialog.spacing = 8;

    dialog.add("statictext", undefined, "セット名（同名があれば上書き）:");
    var input = dialog.add("edittext", undefined, defaultName || "");
    input.preferredSize = [220, BUTTON_HEIGHT];
    input.active = true;

    var btns = dialog.add("group");
    btns.alignment = ["right", "top"];
    btns.add("button", undefined, "OK", { name: "ok" });
    btns.add("button", undefined, "キャンセル", { name: "cancel" });

    if (dialog.show() !== 1) return null;
    var name = input.text.replace(/^\s+|\s+$/g, "");
    return name.length > 0 ? name : null;
  }

  emoSetSaveBtn.onClick = function () {
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    if (!ctrlComp) {
      setStatus("制御コンポを選択してください。");
      return;
    }

    var entries = captureEmoSet(ctrlComp);
    if (entries.length === 0) {
      alert(
        "保存できる状態がありません。\n制御レイヤーにマーカーを書き込んでから保存してください。"
      );
      return;
    }

    var defaultName = emoSetDropdown.selection
      ? emoSetDropdown.selection.text
      : "セット1";
    var setName = promptForSetName(defaultName);
    if (!setName) return;

    saveEmoSet(ctrlComp, setName, entries);
    rebuildEmoSetDropdown(setName);
    setStatus(
      "表情セット「" + setName + "」を保存しました（" + entries.length + " グループ）。"
    );
  };

  emoSetApplyBtn.onClick = function () {
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    if (!ctrlComp) {
      setStatus("制御コンポを選択してください。");
      return;
    }
    if (!emoSetDropdown.selection) {
      setStatus("適用する表情セットを選択してください。");
      return;
    }

    var setName = emoSetDropdown.selection.text;
    var result = applyEmoSet(ctrlComp, setName);
    if (!result) {
      setStatus("表情セットが見つかりません: " + setName);
      rebuildEmoSetDropdown(null);
      return;
    }

    var message =
      "表情セット「" + setName + "」を適用しました（" + result.applied + " グループ）。";
    if (result.missing > 0) {
      message += " 制御レイヤー未検出: " + result.missing;
    }
    setStatus(message);
  };

  emoSetDeleteBtn.onClick = function () {
    var ctrlComp = getSelectedComp(ctrlRow.dropdown);
    if (!ctrlComp || !emoSetDropdown.selection) {
      setStatus("削除する表情セットを選択してください。");
      return;
    }

    var setName = emoSetDropdown.selection.text;
    var layer = findEmoSetLayer(ctrlComp, setName);
    if (!layer) {
      rebuildEmoSetDropdown(null);
      return;
    }
    if (!confirm("表情セット「" + setName + "」を削除しますか？")) return;

    beginUndo("emo2layer: 表情セット削除");
    try {
      layer.remove();
    } finally {
      endUndo();
    }
    rebuildEmoSetDropdown(null);
    setStatus("表情セット「" + setName + "」を削除しました。");
  };

  // ════════════════════════════════════════════════════════════════
  //
  //  タブ「口パク」: 音素 (lab2layer)
  //
  // ════════════════════════════════════════════════════════════════

  // ========== 音素マーカー (lab) パネル ==========
  // labファイル選択 → 音素選択 → タイミング → 音素配置 を1つにまとめ、関係を明確にする
  var labPanel = tabLab.add("panel", undefined, "音素マーカー (lab)");
  labPanel.orientation = "column";
  labPanel.alignChildren = ["fill", "top"];
  labPanel.alignment = ["fill", "top"];
  labPanel.spacing = 5;
  labPanel.margins = 10;

  // ========== ファイル選択グループ ==========
  var fileSelectGroup = labPanel.add("group");
  fileSelectGroup.orientation = "row";
  fileSelectGroup.alignChildren = ["left", "center"];
  fileSelectGroup.alignment = ["fill", "top"];

  fileSelectGroup.add("statictext", undefined, "labファイル");

  var filePathText = fileSelectGroup.add(
    "edittext",
    undefined,
    "ファイル未選択"
  );
  filePathText.alignment = ["fill", "center"];
  filePathText.enabled = false;

  var browseBtn = fileSelectGroup.add("button", undefined, "...");
  browseBtn.preferredSize = [30, 25];
  browseBtn.alignment = ["right", "center"];
  browseBtn.helpTip = "labファイルを選択";

  // ========== ファイル一括読み込み (wav/txt/lab) ==========
  var bulkPanel = tabLab.add(
    "panel",
    undefined,
    "ファイル一括読み込み (wav/txt/lab)"
  );
  bulkPanel.orientation = "column";
  bulkPanel.alignChildren = ["fill", "top"];
  bulkPanel.alignment = ["fill", "top"];
  bulkPanel.spacing = 4;
  bulkPanel.margins = 10;

  var bulkOptRow = bulkPanel.add("group");
  bulkOptRow.orientation = "row";
  bulkOptRow.alignChildren = ["left", "center"];
  bulkOptRow.spacing = 8;
  bulkOptRow.add("statictext", undefined, "配置:");
  var cbImportWav = bulkOptRow.add("checkbox", undefined, "音声(wav)");
  cbImportWav.value = cfgImportWav;
  var cbImportLab = bulkOptRow.add("checkbox", undefined, "口パク(lab)");
  cbImportLab.value = cfgImportLab;
  var cbImportTxt = bulkOptRow.add("checkbox", undefined, "テキスト(txt)");
  cbImportTxt.value = cfgImportTxt;
  cbImportLab.onClick = function () {
    cfgImportLab = cbImportLab.value;
    setSettingBool("importLab", cfgImportLab);
  };
  cbImportTxt.onClick = function () {
    cfgImportTxt = cbImportTxt.value;
    setSettingBool("importTxt", cfgImportTxt);
  };
  cbImportWav.onClick = function () {
    cfgImportWav = cbImportWav.value;
    setSettingBool("importWav", cfgImportWav);
  };

  // 配置する音素の絞り込み（空＝すべて）(#M)
  var bulkPhonemeRow = bulkPanel.add("group");
  bulkPhonemeRow.orientation = "row";
  bulkPhonemeRow.alignChildren = ["left", "center"];
  bulkPhonemeRow.spacing = 4;
  bulkPhonemeRow.add("statictext", undefined, "音素:");
  var bulkPhonemeInput = bulkPhonemeRow.add("edittext", undefined, cfgImportPhonemes);
  bulkPhonemeInput.preferredSize = [180, BUTTON_HEIGHT];
  bulkPhonemeInput.helpTip =
    "配置する音素をカンマ区切りで指定（空＝すべて）。既定は母音＋ん＋閉じ系";
  bulkPhonemeInput.onChange = function () {
    cfgImportPhonemes = bulkPhonemeInput.text;
    setSettingStr("importPhonemes", cfgImportPhonemes);
  };
  var bulkPhonemeVowelBtn = bulkPhonemeRow.add("button", undefined, "母音+ん");
  bulkPhonemeVowelBtn.preferredSize = [64, BUTTON_HEIGHT];
  bulkPhonemeVowelBtn.helpTip = "口パクの基本セット（a,i,u,e,o,N,pau,sil,cl,Q,br）に戻す";
  bulkPhonemeVowelBtn.onClick = function () {
    bulkPhonemeInput.text = "a,i,u,e,o,N,pau,sil,cl,Q,br";
    cfgImportPhonemes = bulkPhonemeInput.text;
    setSettingStr("importPhonemes", cfgImportPhonemes);
  };
  var bulkPhonemeAllBtn = bulkPhonemeRow.add("button", undefined, "すべて");
  bulkPhonemeAllBtn.preferredSize = [56, BUTTON_HEIGHT];
  bulkPhonemeAllBtn.helpTip = "すべての音素を配置（絞り込みなし）";
  bulkPhonemeAllBtn.onClick = function () {
    bulkPhonemeInput.text = "";
    cfgImportPhonemes = "";
    setSettingStr("importPhonemes", "");
  };

  var bulkBtnRow = bulkPanel.add("group");
  bulkBtnRow.orientation = "row";
  bulkBtnRow.alignChildren = ["fill", "center"];
  bulkBtnRow.alignment = ["fill", "top"];
  bulkBtnRow.spacing = 5;
  var bulkPickBtn = bulkBtnRow.add("button", undefined, "ファイルを選択して配置");
  bulkPickBtn.helpTip =
    "wav/txt/lab をまとめて選択し、同名どうしを1組として現在のコンポに配置（A方式）";
  var bulkSiblingBtn = bulkBtnRow.add("button", undefined, "選択音声の隣を取込");
  bulkSiblingBtn.helpTip =
    "選択した音声レイヤーのソースと同じ名前の .lab/.txt が隣にあれば取り込む（B方式）";

  bulkPanel.add(
    "statictext",
    undefined,
    "テキストは UTF-8 のtxtをそのまま字幕レイヤーにします（連携は今後対応）"
  );

  // A方式: wav/txt/lab を複数選択して一括配置
  bulkPickBtn.onClick = function () {
    var comp = getActiveComp();
    if (!comp) {
      alert("配置先のコンポジションを開いてください");
      return;
    }
    var files = File.openDialog(
      "wav / txt / lab をまとめて選択",
      undefined,
      true
    );
    if (!files) return;
    if (!(files instanceof Array)) files = [files];
    var groups = groupFilesByBase(files);
    if (groups.length === 0) {
      alert("wav / txt / lab が選択されていません");
      return;
    }
    var t = readLabTimings();
    var opts = {
      lab: cfgImportLab,
      txt: cfgImportTxt,
      wav: cfgImportWav,
      offsetSec: t.offsetSec,
      autoClose: cfgLabAutoClose,
      phonemeFilter: normalizeCsvTokens(bulkPhonemeInput.text),
    };
    var total = { wav: 0, txt: 0, lab: 0 };
    beginUndo("lab2layer: ファイル一括読み込み");
    try {
      for (var i = 0; i < groups.length; i++) {
        var r = importGroupFiles(comp, comp.time, groups[i], opts);
        total.wav += r.wav;
        total.txt += r.txt;
        total.lab += r.lab;
      }
    } finally {
      endUndo();
    }
    alert(
      "配置完了（" +
        groups.length +
        " 組）\n音声: " +
        total.wav +
        " / テキスト: " +
        total.txt +
        " / 口パク: " +
        total.lab +
        (groups.length > 1
          ? "\n※複数組は再生ヘッド位置に重なります。必要に応じて並べ替えてください"
          : "")
    );
  };

  // B方式: 選択した音声レイヤー（複数可）それぞれの隣にある同名 .lab/.txt を取り込む
  bulkSiblingBtn.onClick = function () {
    var comp = getActiveComp();
    if (!comp) {
      alert("コンポジションを開いてください");
      return;
    }
    // ソースファイルを持つ選択レイヤーを全て対象にする
    var sel = comp.selectedLayers;
    var targets = [];
    for (var i = 0; i < sel.length; i++) {
      var f = null;
      try {
        f = sel[i].source && sel[i].source.mainSource && sel[i].source.mainSource.file;
      } catch (e) {}
      if (f) targets.push({ layer: sel[i], file: f });
    }
    if (targets.length === 0) {
      alert("ソースファイルのある音声/映像レイヤーを選択してください（複数可）");
      return;
    }
    var t = readLabTimings();
    var labCount = 0;
    var txtCount = 0;
    var noneCount = 0;
    beginUndo("lab2layer: 隣接ファイル取込");
    try {
      for (var k = 0; k < targets.length; k++) {
        var layer = targets[k].layer;
        var srcFile = targets[k].file;
        var base = fileBaseNoExt(decodeURI(srcFile.name));
        var parent = srcFile.parent;
        var labF = new File(parent.fsName + "/" + base + ".lab");
        var txtF = new File(parent.fsName + "/" + base + ".txt");
        var attach = layer.inPoint;
        var any = false;
        if (cfgImportLab && labF.exists) {
          if (
            placeLabFileOnLayer(
              layer,
              attach,
              labF,
              base,
              t.offsetSec,
              cfgLabAutoClose,
              normalizeCsvTokens(bulkPhonemeInput.text)
            )
          ) {
            labCount++;
            any = true;
          }
        }
        if (cfgImportTxt && txtF.exists) {
          var txt = readTextFileBestEffort(txtF);
          if (txt.length > 0) {
            var tl = comp.layers.addText(txt);
            tl.startTime = attach;
            txtCount++;
            any = true;
          }
        }
        if (!any) noneCount++;
      }
    } finally {
      endUndo();
    }
    alert(
      "隣接ファイル取込（対象 " +
        targets.length +
        " レイヤー）\n口パク(lab): " +
        labCount +
        " / テキスト(txt): " +
        txtCount +
        (noneCount > 0 ? "\n隣に該当ファイルが無かった: " + noneCount : "")
    );
  };

  // ========== 音素リストグループ ==========
  var phonemeListPanel = labPanel.add("panel", undefined, "音素を選択");
  phonemeListPanel.orientation = "column";
  phonemeListPanel.alignChildren = ["fill", "top"];
  phonemeListPanel.alignment = ["fill", "top"];
  phonemeListPanel.spacing = 5;
  phonemeListPanel.margins = 10;
  phonemeListPanel.minimumSize = [200, 150];

  // ========== 音素チェックボックス ==========
  var phonemeCheckboxGroup = phonemeListPanel.add("group");
  phonemeCheckboxGroup.orientation = "column";
  phonemeCheckboxGroup.alignChildren = ["fill", "top"];
  phonemeCheckboxGroup.alignment = ["fill", "fill"];
  phonemeCheckboxGroup.spacing = 2;

  // 母音
  // a, i, u, e, o - 基本母音5つ

  // 特殊音素
  // N - 撥音（ん）
  // cl, Q - 促音（っ）
  // pau - ポーズ（休止）
  // sil - 無音（silence）
  // br - ブレス（息継ぎ）

  // 子音
  // k, g - か行、が行
  // s, z - さ行、ざ行
  // t, d - た行、だ行
  // n - な行
  // h, b, p - は行、ば行、ぱ行
  // m - ま行
  // y - や行
  // r - ら行
  // w - わ行

  // よく使う音素のリスト
  var commonPhonemes = [
    "a",
    "i",
    "u",
    "e",
    "o",
    "N",
    "pau",
    "sil",
    "cl",
    "Q",
    "br",
  ];

  var phonemeData = [];
  var labFile = null;

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

  // 発話終了時に打つ「閉じ音素」。どの母音にも属さない pau を使い、閉じ口へ戻す。
  var LAB_CLOSE_PHONEME = "pau";

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
    autoClose
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
    phonemeFilter
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
      phonemeFilter
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
      autoClose
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
          opts.phonemeFilter
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

  function setPhonemeSelection(selector) {
    for (var i = 0; i < phonemeData.length; i++) {
      phonemeData[i].checkbox.value = selector(phonemeData[i]);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 口パク エクスプレッション
  // ══════════════════════════════════════════════════════════════════

  /**
   * 音素レイヤー探索 + 現在音素取得のロジック部分。
   * 名前マッチ式（従来）とマッピング式で共有する。
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

  /** 従来の名前マッチ式（レイヤー名 = 音素名で表示判定） */
  function buildLabNameMatchExpression(targetCompName) {
    return buildPhonemeSnippet(targetCompName)
      .concat([
        "",
        "function matchesName(name) {",
        '  return (","+thisLayer.name+",").indexOf(","+name+",") >= 0;',
        "}",
        "",
        "var phonemeLayer = findPhonemeLayer();",
        "var phoneme = getPhoneme(phonemeLayer);",
        'phoneme !== null ? (matchesName(phoneme) ? 100 : 0) : (matchesName("def") ? 100 : 0);',
      ])
      .join("\n");
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
    labTag
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
        .concat(
          buildEmoMarkerSnippet(emoCtx.ctrlCompName, emoCtx.targetCompName)
        )
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

  /**
   * 音素レイヤー（[Lab]）のあるコンポを選ばせるダイアログ。
   * compNames を渡せばその候補だけ（検証済み）から選ばせる。
   * 確定したらコンポ名、キャンセルなら null を返す。
   */
  function promptForPhonemeComp(defaultName, compNames) {
    if (!compNames) {
      compNames = [];
      for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem) {
          compNames.push(item.name);
        }
      }
    }

    var dialog = new Window("dialog", "コンポジションを選択");
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];

    dialog.add(
      "statictext",
      undefined,
      "[Lab] 音素レイヤーのある場所（未配置なら配置予定のコンポ）:"
    );
    var compDropdown = dialog.add("dropdownlist", undefined, compNames);

    for (var j = 0; j < compNames.length; j++) {
      if (compNames[j] === defaultName) {
        compDropdown.selection = j;
        break;
      }
    }
    if (!compDropdown.selection && compNames.length > 0) {
      compDropdown.selection = 0;
    }

    var dialogBtnGroup = dialog.add("group");
    dialogBtnGroup.add("button", undefined, "OK", { name: "ok" });
    dialogBtnGroup.add("button", undefined, "キャンセル", { name: "cancel" });

    if (dialog.show() !== 1) return null;
    if (!compDropdown.selection) {
      alert("コンポジションを選択してください");
      return null;
    }
    return compDropdown.selection.text;
  }

  // ========== 一括選択ボタングループ ==========
  var phonemeSelectorGroup = phonemeListPanel.add("group");
  phonemeSelectorGroup.orientation = "row";
  phonemeSelectorGroup.alignment = ["fill", "bottom"];
  phonemeSelectorGroup.alignChildren = ["fill", "center"];
  phonemeSelectorGroup.spacing = 5;

  var selectAllBtn = phonemeSelectorGroup.add("button", undefined, "すべて");
  selectAllBtn.alignment = ["fill", "center"];
  var selectCommonBtn = phonemeSelectorGroup.add(
    "button",
    undefined,
    "かんたん"
  );
  selectCommonBtn.alignment = ["fill", "center"];
  var deselectAllBtn = phonemeSelectorGroup.add("button", undefined, "解除");
  deselectAllBtn.alignment = ["fill", "center"];

  // ========== タイミング設定グループ（全て app.settings で永続化） ==========
  var offsetGroup = labPanel.add("group");
  offsetGroup.orientation = "row";
  offsetGroup.alignment = ["fill", "top"];
  offsetGroup.alignChildren = ["left", "center"];
  offsetGroup.spacing = 5;

  var offsetLabel = offsetGroup.add("statictext", undefined, "オフセット(ms)");
  offsetLabel.alignment = ["left", "center"];

  var offsetInput = offsetGroup.add("edittext", undefined, String(cfgLabOffsetMs));
  offsetInput.preferredSize = [48, 25];
  offsetInput.helpTip =
    "動画先行の法則: 映像は音声より数フレーム速いほうが自然に見えます（負の値=映像先行）。全マーカーを一律シフト";

  var frameMinus = offsetGroup.add("button", undefined, "<");
  frameMinus.preferredSize = [30, 25];
  frameMinus.alignment = ["left", "center"];
  frameMinus.helpTip = "1フレーム戻す（映像をさらに先行）";

  var framePlus = offsetGroup.add("button", undefined, ">");
  framePlus.preferredSize = [30, 25];
  framePlus.alignment = ["left", "center"];
  framePlus.helpTip = "1フレーム進める";

  // オフセット値を読み取り、整え、永続化するヘルパー
  function readLabTimings() {
    var off = parseFloat(offsetInput.text);
    if (isNaN(off)) off = 0;
    cfgLabOffsetMs = off;
    offsetInput.text = String(off);
    setSettingNum("labOffsetMs", off);
    return { offsetSec: off / 1000 };
  }
  offsetInput.onChange = readLabTimings;

  var autoCloseCheck = offsetGroup.add(
    "checkbox",
    undefined,
    "終了に閉じ口"
  );
  autoCloseCheck.value = cfgLabAutoClose;
  autoCloseCheck.helpTip =
    "ラボの終了時刻に閉じ音素(pau)を自動追加し、発話後に口を閉じる（末尾の口が開いたまま残るのを防ぐ）";
  autoCloseCheck.onClick = function () {
    cfgLabAutoClose = autoCloseCheck.value;
    setSettingBool("labAutoClose", cfgLabAutoClose);
  };

  // ========== 口形状マッピング (PSDToolKit互換) ==========
  // あ/い/う/え/お/ん の口形レイヤーに音素グループを割り当てる。
  // レイヤー名は変えずにエクスプレッションへ焼き込む方式

  var MOUTH_SHAPES = [
    { label: "あ", preset: "a" },
    { label: "い", preset: "i" },
    { label: "う", preset: "u,w" },
    { label: "え", preset: "e" },
    { label: "お", preset: "o" },
    { label: "ん(閉)", preset: "N,cl,Q,pau,sil,br", closedFallback: true },
  ];

  // 自動割当のヒューリスティック（先勝ち）。「閉」を「ん」より先に判定する
  var MOUTH_AUTO_RULES = [
    { ch: "閉", shapeIndex: 5 },
    { ch: "ん", shapeIndex: 5 },
    { ch: "あ", shapeIndex: 0 },
    { ch: "い", shapeIndex: 1 },
    { ch: "う", shapeIndex: 2 },
    { ch: "え", shapeIndex: 3 },
    { ch: "お", shapeIndex: 4 },
  ];

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
          labTag
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

  var mouthMapPanel = tabLab.add(
    "panel",
    undefined,
    "口形状マッピング (PSDToolKit互換)"
  );
  mouthMapPanel.orientation = "column";
  mouthMapPanel.alignChildren = ["fill", "top"];
  mouthMapPanel.alignment = ["fill", "fill"];
  mouthMapPanel.spacing = 4;
  mouthMapPanel.margins = 10;

  var mouthMapHint = mouthMapPanel.add(
    "statictext",
    undefined,
    "選択→各行「割当」→「適用」。音素⇔口形は「現在を取込」→編集→「適用」で lab を再配置せず後から変更できます",
    { multiline: true }
  );
  mouthMapHint.alignment = ["fill", "top"];

  // 口パクタグ: 立ち絵が複数あるとき、対象の [Lab] を名前で振り分ける(#B)
  var mouthTagRow = mouthMapPanel.add("group");
  mouthTagRow.orientation = "row";
  mouthTagRow.alignChildren = ["left", "center"];
  mouthTagRow.spacing = 4;
  mouthTagRow.add("statictext", undefined, "口パクタグ:");
  var mouthLabTagInput = mouthTagRow.add("edittext", undefined, "");
  mouthLabTagInput.preferredSize = [140, BUTTON_HEIGHT];
  mouthLabTagInput.helpTip =
    "立ち絵が複数あるとき、この文字列を名前に含む [Lab] レイヤーだけに反応させます（空=最初の [Lab]）。例: lab ファイル名の prefix（zunda_ 等）";

  // 口形の行はこのクリップ領域に動的に追加する。行が増えても隠れないよう
  // 縦スクロール対応にし、追加/削除ボタンは常に下に残す(#C)
  var mouthRowsClip = mouthMapPanel.add("panel");
  mouthRowsClip.alignment = ["fill", "fill"];
  mouthRowsClip.margins = 2;
  mouthRowsClip.preferredSize = [-1, 168];

  var mouthRowsGroup = mouthRowsClip.add("group");
  mouthRowsGroup.orientation = "column";
  mouthRowsGroup.alignChildren = ["fill", "top"];
  mouthRowsGroup.spacing = 2;

  var mouthRowsScroll = mouthRowsClip.add("scrollbar", undefined, 0, 0, 100);
  mouthRowsScroll.visible = false;
  var mouthRowsScrollValue = 0;

  var mouthRows = [];

  // 口形行領域のスクロール: 中身(mouthRowsGroup)を上下に動かし、パネルでクリップ
  function applyMouthScroll(value) {
    try {
      var m = 2;
      var pw = mouthRowsClip.size ? mouthRowsClip.size.width : 360;
      var ph = mouthRowsClip.size ? mouthRowsClip.size.height : 168;
      var sbW = 14;
      var innerH = ph - m * 2;
      var contentH = mouthRowsGroup.size ? mouthRowsGroup.size.height : 0;
      var maxv = contentH - innerH;
      if (maxv < 0) maxv = 0;
      if (value === undefined || value === null || value < 0) value = 0;
      if (value > maxv) value = maxv;
      mouthRowsScrollValue = value;
      mouthRowsGroup.location = [m, m - value];
      mouthRowsScroll.location = [pw - sbW - m, m];
      mouthRowsScroll.size = [sbW, innerH];
      mouthRowsScroll.minvalue = 0;
      mouthRowsScroll.maxvalue = maxv > 0 ? maxv : 1;
      mouthRowsScroll.value = value;
      mouthRowsScroll.visible = maxv > 0;
    } catch (e) {}
  }
  function refreshMouthScroll() {
    try {
      mouthRowsGroup.layout.layout(true);
      mouthRowsClip.layout.layout(true);
    } catch (e) {}
    applyMouthScroll(mouthRowsScrollValue);
  }
  mouthRowsScroll.onChanging = mouthRowsScroll.onChange = function () {
    try {
      mouthRowsScrollValue = mouthRowsScroll.value;
      mouthRowsGroup.location = [2, 2 - mouthRowsScroll.value];
    } catch (e) {}
  };
  try {
    mouthRowsClip.addEventListener("mousewheel", function (ev) {
      if (!mouthRowsScroll.visible) return;
      var d = 0;
      try {
        if (ev.deltaY !== undefined && ev.deltaY !== null) d = ev.deltaY;
        else if (ev.wheelDelta !== undefined && ev.wheelDelta !== null)
          d = -ev.wheelDelta;
        else if (ev.detail !== undefined && ev.detail !== null) d = ev.detail;
      } catch (eD) {}
      if (d === 0) return;
      var v = mouthRowsScrollValue + (d > 0 ? 30 : -30);
      if (v < 0) v = 0;
      if (v > mouthRowsScroll.maxvalue) v = mouthRowsScroll.maxvalue;
      applyMouthScroll(v);
    });
  } catch (eW) {}

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

  function addMouthRow(label, preset, isClosed) {
    var row = mouthRowsGroup.add("group");
    row.orientation = "row";
    row.alignment = ["fill", "top"];
    row.alignChildren = ["left", "center"];
    row.spacing = 4;

    var labelInput = row.add("edittext", undefined, label);
    labelInput.preferredSize = [54, BUTTON_HEIGHT];
    labelInput.helpTip = "口形の名前（自動割当・表示用。自由に変更可）";

    var csvInput = row.add("edittext", undefined, preset);
    csvInput.preferredSize = [96, BUTTON_HEIGHT];
    csvInput.helpTip = "この口形で表示する音素（カンマ区切り）";

    var closedCheck = row.add("checkbox", undefined, "閉");
    closedCheck.value = !!isClosed;
    closedCheck.helpTip =
      "閉じ口: どの口形にも属さない音素（子音など）のときに表示";

    var assignBtn = row.add("button", undefined, "割当");
    assignBtn.preferredSize = [40, BUTTON_HEIGHT];
    assignBtn.helpTip = "アクティブコンポの選択レイヤーをこの口形に割当";

    var clearBtn = row.add("button", undefined, "×");
    clearBtn.preferredSize = [22, BUTTON_HEIGHT];
    clearBtn.helpTip = "この口形の割当をクリア";

    var delBtn = row.add("button", undefined, "行削除");
    delBtn.preferredSize = [44, BUTTON_HEIGHT];
    delBtn.helpTip = "この口形の行を削除";

    var namesText = row.add("statictext", undefined, "（未割当）");
    namesText.alignment = ["fill", "center"];

    var rowData = {
      row: row,
      labelInput: labelInput,
      csvInput: csvInput,
      closedCheck: closedCheck,
      namesText: namesText,
      preset: preset,
      layers: [],
    };
    mouthRows.push(rowData);

    assignBtn.onClick = function () {
      var comp = getActiveComp();
      if (!comp || comp.selectedLayers.length === 0) {
        alert("口形レイヤーを選択してください");
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

    delBtn.onClick = function () {
      for (var i = 0; i < mouthRows.length; i++) {
        if (mouthRows[i] === rowData) {
          mouthRows.splice(i, 1);
          break;
        }
      }
      try {
        mouthRowsGroup.remove(row);
        mouthMapPanel.layout.layout(true);
        refreshMouthScroll();
      } catch (e) {}
    };
    return rowData;
  }

  // 既定の6行（あ/い/う/え/お/ん(閉)）
  for (var msIdx = 0; msIdx < MOUTH_SHAPES.length; msIdx++) {
    addMouthRow(
      MOUTH_SHAPES[msIdx].label,
      MOUTH_SHAPES[msIdx].preset,
      !!MOUTH_SHAPES[msIdx].closedFallback
    );
  }

  var mouthAddRow = mouthMapPanel.add("group");
  mouthAddRow.orientation = "row";
  mouthAddRow.alignChildren = ["left", "center"];
  var mouthAddBtn = mouthAddRow.add("button", undefined, "＋口形を追加");
  mouthAddBtn.preferredSize = [110, BUTTON_HEIGHT];
  mouthAddBtn.helpTip = "「あいうえおん」以外の口形（特殊口など）の行を追加";
  mouthAddBtn.onClick = function () {
    addMouthRow("", "", false);
    try {
      mouthMapPanel.layout.layout(true);
      refreshMouthScroll();
    } catch (e) {}
  };

  var mouthMapBtnRow = mouthMapPanel.add("group");
  mouthMapBtnRow.orientation = "row";
  mouthMapBtnRow.alignment = ["fill", "top"];
  mouthMapBtnRow.alignChildren = ["fill", "center"];
  mouthMapBtnRow.spacing = 5;

  var mouthAutoBtn = mouthMapBtnRow.add("button", undefined, "自動割当");
  mouthAutoBtn.helpTip =
    "選択レイヤー名に「あ/い/う/え/お/ん/閉」が含まれていれば自動で割当";
  var mouthImportBtn = mouthMapBtnRow.add("button", undefined, "現在を取込");
  mouthImportBtn.helpTip =
    "アクティブコンポの既存マッピング式（口パク設定済みレイヤー）を読み取って各行に反映";
  var mouthPresetBtn = mouthMapBtnRow.add("button", undefined, "プリセット");
  mouthPresetBtn.helpTip = "口形マッピングを初期状態（あ/い/う/え/お/ん）に戻す";
  var mouthApplyBtn = mouthMapBtnRow.add("button", undefined, "適用");
  mouthApplyBtn.helpTip =
    "割当済みレイヤーに不透明度エクスプレッションを設定（表情登録済みなら共存）";
  var mouthRemoveBtn = mouthMapBtnRow.add("button", undefined, "解除");
  mouthRemoveBtn.helpTip =
    "選択レイヤーのマッピングを解除（表情登録済みなら表情切替に戻す）";

  // 候補が複数ある口形レイヤーをどの行に割り当てるかを選ばせるダイアログ(#G)。
  // 戻り値: 選んだ rowData / スキップなら null。
  function pickMouthRowDialog(layerName, candidateRows) {
    var dlg = new Window("dialog", "口形の割当先を選択");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 8;
    dlg.margins = 14;

    var msg = dlg.add(
      "statictext",
      undefined,
      "「" + layerName + "」は複数の口形に一致します。割当先を選んでください。",
      { multiline: true }
    );
    msg.preferredSize = [320, 36];

    var listGroup = dlg.add("group");
    listGroup.orientation = "column";
    listGroup.alignChildren = ["fill", "top"];
    var dd = listGroup.add("dropdownlist");
    dd.alignment = ["fill", "top"];
    for (var i = 0; i < candidateRows.length; i++) {
      var lbl = candidateRows[i].labelInput.text || "（無名）";
      var csv = candidateRows[i].csvInput.text || "";
      dd.add("item", lbl + (csv ? "  [" + csv + "]" : ""));
    }
    dd.selection = 0;

    var btnRow = dlg.add("group");
    btnRow.orientation = "row";
    btnRow.alignment = ["right", "top"];
    var skipBtn = btnRow.add("button", undefined, "スキップ");
    var okBtn = btnRow.add("button", undefined, "割当", { name: "ok" });

    var result = { chosen: null };
    okBtn.onClick = function () {
      result.chosen =
        dd.selection !== null ? candidateRows[dd.selection.index] : null;
      dlg.close();
    };
    skipBtn.onClick = function () {
      result.chosen = null;
      dlg.close();
    };
    dlg.show();
    return result.chosen;
  }

  mouthAutoBtn.onClick = function () {
    var comp = getActiveComp();
    if (!comp || comp.selectedLayers.length === 0) {
      alert("口形レイヤーを選択してください");
      return;
    }

    var assignedCount = 0;
    for (var r = 0; r < mouthRows.length; r++) {
      mouthRows[r].layers = [];
    }

    // 各行のラベルから取り出したキーがレイヤー名に含まれれば候補。
    // 閉じ口の行を先に並べて優先順位の基準にする（「閉」が他より勝つ）。
    var order = [];
    for (r = 0; r < mouthRows.length; r++) {
      if (mouthRows[r].closedCheck.value) order.push(mouthRows[r]);
    }
    for (r = 0; r < mouthRows.length; r++) {
      if (!mouthRows[r].closedCheck.value) order.push(mouthRows[r]);
    }

    for (var i = 0; i < comp.selectedLayers.length; i++) {
      var layer = comp.selectedLayers[i];
      // この層に一致する行をすべて集める
      var candidates = [];
      for (var j = 0; j < order.length; j++) {
        var keys = mouthMatchKeys(order[j].labelInput.text);
        var hit = false;
        for (var ki = 0; ki < keys.length; ki++) {
          if (keys[ki] && layer.name.indexOf(keys[ki]) >= 0) {
            hit = true;
            break;
          }
        }
        if (hit) candidates.push(order[j]);
      }
      if (candidates.length === 0) continue;
      var target;
      if (candidates.length === 1) {
        target = candidates[0];
      } else {
        // 候補が複数 → 選択させる(#G)。スキップ可
        target = pickMouthRowDialog(layer.name, candidates);
        if (!target) continue;
      }
      target.layers.push(layer);
      assignedCount++;
    }

    for (var k = 0; k < mouthRows.length; k++) {
      mouthRows[k].namesText.text = describeAssignedLayers(
        mouthRows[k].layers
      );
      mouthRows[k].namesText.helpTip = mouthRows[k].namesText.text;
    }

    if (assignedCount === 0) {
      alert(
        "割当できるレイヤーがありませんでした。\n各行のラベル（あ/い/う/閉 など）がレイヤー名に含まれている必要があります。"
      );
    }
  };

  // すべての口形行を削除して既定の6行（あ/い/う/え/お/ん）に戻す
  function resetMouthRowsToDefault() {
    for (var i = mouthRows.length - 1; i >= 0; i--) {
      try {
        mouthRowsGroup.remove(mouthRows[i].row);
      } catch (e) {}
    }
    mouthRows = [];
    for (var s = 0; s < MOUTH_SHAPES.length; s++) {
      addMouthRow(
        MOUTH_SHAPES[s].label,
        MOUTH_SHAPES[s].preset,
        !!MOUTH_SHAPES[s].closedFallback
      );
    }
    try {
      mouthMapPanel.layout.layout(true);
      refreshMouthScroll();
    } catch (e2) {}
  }

  mouthPresetBtn.onClick = function () {
    // 既定の行/音素リストに戻す（追加した行・割当もリセットされる）
    if (
      !confirm(
        "口形マッピングを PSDToolKit 互換の初期状態（あ/い/う/え/お/ん の6行）に戻します。\n追加した口形の行や割当もリセットされます。よろしいですか？"
      )
    ) {
      return;
    }
    resetMouthRowsToDefault();
  };

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

  // 現在のコンポの口パク設定済みレイヤーを読み取り、各行に取り込む(#K)
  mouthImportBtn.onClick = function () {
    var comp = getActiveComp();
    if (!comp) {
      alert("口パク設定済みのレイヤーがあるコンポをアクティブにしてください。");
      return;
    }
    // (csv|closed) ごとにレイヤーをまとめる
    var groups = [];
    var index = {};
    var importedTag = "";
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var expr = "";
      try {
        expr = layer.transform.opacity.expression || "";
      } catch (e) {
        continue;
      }
      var parsed = parseLabMapExpression(expr);
      if (!parsed) continue;
      if (!importedTag && parsed.labTag) importedTag = parsed.labTag;
      var keyTokens = normalizeCsvTokens(parsed.myCsv).join(",");
      var key = (parsed.isClosedFallback ? "C|" : "O|") + keyTokens;
      if (index[key] === undefined) {
        index[key] = groups.length;
        groups.push({
          myCsv: keyTokens,
          isClosedFallback: parsed.isClosedFallback,
          layers: [],
        });
      }
      groups[index[key]].layers.push(layer);
    }

    if (groups.length === 0) {
      alert(
        "このコンポに口パク設定済み（口形マッピング式）のレイヤーが見つかりませんでした。"
      );
      return;
    }

    // 取り込み: まず既定行へ、CSV/閉じが一致する行があればそこへ。
    // 一致が無ければ新規行を追加する。既存の割当は上書きする。
    resetMouthRowsToDefault();
    mouthLabTagInput.text = importedTag; // 口パクタグも復元(#B/#K)
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      var grpTokens = normalizeCsvTokens(grp.myCsv).join(",");
      var matched = null;
      for (var r = 0; r < mouthRows.length; r++) {
        var rowTokens = normalizeCsvTokens(mouthRows[r].csvInput.text).join(",");
        if (
          rowTokens === grpTokens &&
          !!mouthRows[r].closedCheck.value === grp.isClosedFallback
        ) {
          matched = mouthRows[r];
          break;
        }
      }
      if (!matched) {
        // ラベルは推測しづらいので CSV 先頭 or "口形N" を仮ラベルに
        var guessLabel = grpTokens ? grpTokens.split(",")[0] : "口形";
        matched = addMouthRow(guessLabel, grp.myCsv, grp.isClosedFallback);
      }
      matched.layers = grp.layers.slice(0);
      matched.namesText.text = describeAssignedLayers(matched.layers);
      matched.namesText.helpTip = matched.namesText.text;
    }
    try {
      mouthMapPanel.layout.layout(true);
      refreshMouthScroll();
    } catch (eL) {}
    setStatus(
      "現在のマッピングを取り込みました（" + groups.length + " 口形）。"
    );
  };

  mouthApplyBtn.onClick = function () {
    // 全口形の音素を集約（閉じ口の「未割当音素→閉じ」判定に使用）
    var allTokens = [];
    var allSeen = {};
    var hasAssignment = false;

    for (var r = 0; r < mouthRows.length; r++) {
      var rowData = mouthRows[r];
      rowData.tokens = normalizeCsvTokens(rowData.csvInput.text);
      if (rowData.layers.length > 0) hasAssignment = true;
      for (var t = 0; t < rowData.tokens.length; t++) {
        if (allSeen[rowData.tokens[t]]) continue;
        allSeen[rowData.tokens[t]] = true;
        allTokens.push(rowData.tokens[t]);
      }
    }

    if (!hasAssignment) {
      alert(
        "口形レイヤーが割り当てられていません。\n各行の「割当」または「自動割当」で設定してください。"
      );
      return;
    }

    var activeComp = getActiveComp();
    var phonemeCompName = resolvePhonemeComp(
      activeComp ? activeComp.name : null
    );
    if (!phonemeCompName) return;

    var allCsv = allTokens.join(",");

    // 全行のレイヤーを items 化して一括適用
    var items = [];
    var mappedNames = {};
    for (var i = 0; i < mouthRows.length; i++) {
      var row = mouthRows[i];
      var myCsv = row.tokens.join(",");
      var isClosedFallback = !!row.closedCheck.value;
      for (var j = 0; j < row.layers.length; j++) {
        items.push({
          layer: row.layers[j],
          myCsv: myCsv,
          isClosedFallback: isClosedFallback,
        });
        try {
          mappedNames[row.layers[j].name] = true;
        } catch (eNm) {}
      }
    }

    // グループ優先: 割り当て済みレイヤーが「実際に入っているコンポ」の中だけを対象に、
    // 他の表情登録済み口レイヤーも発話中は隠す（開いているコンポには依存しない）。
    // ※ getActiveComp() を見ると、別コンポを開いて適用したとき無関係なレイヤーに
    //   口パク式を付けてしまい二重表示の原因になるため containingComp を使う。
    var targetComps = [];
    var seenComp = {};
    for (var mi = 0; mi < items.length; mi++) {
      try {
        var cc = items[mi].layer.containingComp;
        if (cc && !seenComp[cc.id]) {
          seenComp[cc.id] = true;
          targetComps.push(cc);
        }
      } catch (eCc) {}
    }
    var suppressCount = 0;
    for (var tc = 0; tc < targetComps.length; tc++) {
      var gcomp = targetComps[tc];
      for (var s = 1; s <= gcomp.numLayers; s++) {
        var sly = gcomp.layer(s);
        if (isSystemLayerName(sly.name)) continue;
        if (mappedNames[sly.name]) continue;
        if (!isRegistered(sly)) continue; // 表情登録済みのみ対象
        if (
          hasOpacitySignature(sly, LAB_MAP_SIGNATURE) ||
          hasOpacitySignature(sly, BLINK_SIGNATURE)
        ) {
          continue; // 既に口パク/目パチ済みは触らない
        }
        items.push({ layer: sly, myCsv: "", isClosedFallback: false });
        suppressCount++;
      }
    }

    var result;
    beginUndo("lab2layer: 口形状マッピング適用");
    try {
      result = applyMappingToLayers(
        items,
        phonemeCompName,
        allCsv,
        mouthLabTagInput.text.replace(/^\s+|\s+$/g, "")
      );
    } finally {
      endUndo();
    }
    var appliedCount = result.applied;
    var emoLinkedCount = result.emoLinked;
    var staleCount = result.stale;

    var message =
      "完了: " +
      appliedCount +
      " レイヤーにマッピングを設定しました。\n音素ソース: " +
      phonemeCompName;
    if (emoLinkedCount > 0) {
      message +=
        "\n表情切替と共存: " + emoLinkedCount + " レイヤー（非発話中は表情に従います）";
    }
    if (suppressCount > 0) {
      message +=
        "\nグループ優先: 他 " +
        suppressCount +
        " レイヤーを発話中は非表示にしました（休め口の二重表示を防止）";
    }
    if (staleCount > 0) {
      message +=
        "\n割当後に削除されたレイヤー: " + staleCount + "（スキップしました）";
    }
    alert(message);
  };

  mouthRemoveBtn.onClick = function () {
    var comp = getActiveComp();
    if (!comp || comp.selectedLayers.length === 0) {
      alert("解除するレイヤーを選択してください");
      return;
    }

    var removedCount = 0;
    var restoredCount = 0;

    beginUndo("lab2layer: 口形状マッピング解除");
    try {
      var layers = comp.selectedLayers;
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var expr = "";
        try {
          expr = layer.transform.opacity.expression;
        } catch (e) {
          continue;
        }
        if (!expr || expr.indexOf(LAB_MAP_SIGNATURE) < 0) continue;

        var emoCtx = parseEmoContext(layer);
        if (emoCtx) {
          // 表情切替の登録に戻す
          layer.transform.opacity.expression = buildOpacityExpression(
            emoCtx.ctrlCompName,
            emoCtx.targetCompName
          );
          restoredCount++;
        } else {
          layer.transform.opacity.expression = "";
          layer.transform.opacity.setValue(100);
        }
        removedCount++;
      }
    } finally {
      endUndo();
    }

    var message = removedCount + " レイヤーのマッピングを解除しました。";
    if (restoredCount > 0) {
      message += "\nうち " + restoredCount + " レイヤーは表情切替に戻しました。";
    }
    alert(message);
  };

  // ========== 実行ボタン ==========
  // 音素配置/一括削除は「音素マーカー (lab)」パネル内に置く（選択→配置の関係を明確に）
  var labBtnRow = labPanel.add("group");
  labBtnRow.orientation = "row";
  labBtnRow.alignment = ["fill", "top"];
  labBtnRow.alignChildren = ["fill", "center"];
  labBtnRow.spacing = 10;

  var createBtn = labBtnRow.add("button", undefined, "音素配置");
  createBtn.alignment = ["fill", "center"];
  createBtn.enabled = false;

  var deleteMarkersBtn = labBtnRow.add("button", undefined, "一括削除");
  deleteMarkersBtn.alignment = ["fill", "center"];

  // 口パク設定（名前マッチ方式・レガシー）は別グループに
  var executeGroup = tabLab.add("group");
  executeGroup.orientation = "row";
  executeGroup.alignment = ["fill", "bottom"];
  executeGroup.alignChildren = ["fill", "center"];
  executeGroup.spacing = 10;

  var setupOpacityBtn = executeGroup.add("button", undefined, "口パク設定（名前マッチ）");
  setupOpacityBtn.alignment = ["fill", "center"];

  // ========== イベントハンドラ ==========

  // フレーム調整ヘルパー関数（選択レイヤーのマーカーを移動）
  function adjustMarkersByFrames(frames) {
    var comp = app.project.activeItem;
    if (!comp) {
      alert("コンポジションを選択してください");
      return;
    }

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
      alert("マーカーのあるレイヤーを選択してください");
      return;
    }

    var frameSec = 1 / 30; // デフォルト30fps
    if (comp.frameRate) {
      frameSec = 1 / comp.frameRate;
    }
    var offsetSec = frames * frameSec;

    beginUndo("lab2layer: Adjust Markers");
    var totalAdjusted = 0;
    try {
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var markers = layer.property("Marker");
        var numMarkers = markers.numKeys;

        if (numMarkers === 0) continue;

        // マーカー情報を一時保存
        var markerData = [];
        for (var j = 1; j <= numMarkers; j++) {
          markerData.push({
            time: markers.keyTime(j) + offsetSec,
            value: markers.keyValue(j),
          });
        }

        // 全マーカーを削除
        for (var j = numMarkers; j >= 1; j--) {
          markers.removeKey(j);
        }

        // 新しい時間で再配置
        for (var j = 0; j < markerData.length; j++) {
          markers.setValueAtTime(markerData[j].time, markerData[j].value);
        }

        totalAdjusted += numMarkers;
      }
    } finally {
      endUndo();
    }
  }

  // フレーム調整ボタン
  frameMinus.onClick = function () {
    adjustMarkersByFrames(-1);
  };

  framePlus.onClick = function () {
    adjustMarkersByFrames(1);
  };

  // ファイル選択
  browseBtn.onClick = function () {
    labFile = File.openDialog("labファイルを選択", "*.lab");
    if (!labFile) return;

    filePathText.text = decodeURI(labFile.name);

    // labファイルをパース
    labFile.open("r");
    var content = labFile.read();
    labFile.close();

    var phonemeEntries = parseLabPhonemeEntries(content);

    var sortedPhonemes = buildSortedPhonemeList(phonemeEntries);

    // UI更新：既存のチェックボックスをクリア
    phonemeData = [];
    for (var i = phonemeCheckboxGroup.children.length - 1; i >= 0; i--) {
      phonemeCheckboxGroup.remove(phonemeCheckboxGroup.children[i]);
    }

    // チェックボックスを横3列で配置
    var currentRow = null;
    var colCount = 0;

    for (var i = 0; i < sortedPhonemes.length; i++) {
      var item = sortedPhonemes[i];

      if (colCount === 0) {
        currentRow = phonemeCheckboxGroup.add("group");
        currentRow.orientation = "row";
        currentRow.alignment = ["fill", "top"];
        currentRow.alignChildren = ["fill", "center"];
        currentRow.spacing = 5;
      }

      var itemGroup = currentRow.add("group");
      itemGroup.orientation = "row";
      itemGroup.alignment = ["fill", "center"];
      itemGroup.alignChildren = ["left", "center"];
      itemGroup.spacing = 2;

      var cb = itemGroup.add("checkbox", undefined, "");
      cb.value = isCommonPhoneme(item.phoneme);

      var label = itemGroup.add(
        "statictext",
        undefined,
        item.phoneme + "(" + item.count + ")"
      );
      label.minimumSize.width = 50;

      phonemeData.push({
        checkbox: cb,
        phoneme: item.phoneme,
        // ここで元データ参照を保持しておくと、Create 時に再探索せず使える
        data: item.data,
      });

      colCount++;
      if (colCount >= 3) {
        colCount = 0;
      }
    }

    // レイアウトを更新
    phonemeCheckboxGroup.layout.layout(true);
    phonemeListPanel.layout.layout(true);
    tabLab.layout.layout(true);
    win.layout.layout(true);
    win.layout.resize();

    createBtn.enabled = sortedPhonemes.length > 0;
  };

  // 全選択
  selectAllBtn.onClick = function () {
    setPhonemeSelection(function () {
      return true;
    });
  };

  // 全解除
  deselectAllBtn.onClick = function () {
    setPhonemeSelection(function () {
      return false;
    });
  };

  // よく使うものを選択
  selectCommonBtn.onClick = function () {
    setPhonemeSelection(function (item) {
      return isCommonPhoneme(item.phoneme);
    });
  };

  // Phonemeレイヤー作成
  createBtn.onClick = function () {
    var comp = app.project.activeItem;
    if (!comp) {
      alert("コンポジションを選択してください");
      return;
    }

    // 選択された音素のみ抽出
    var selectedPhonemes = [];
    for (var i = 0; i < phonemeData.length; i++) {
      if (!phonemeData[i].checkbox.value) continue;

      for (var j = 0; j < phonemeData[i].data.times.length; j++) {
        selectedPhonemes.push({
          startTime: phonemeData[i].data.times[j].start,
          endTime: phonemeData[i].data.times[j].end,
          phoneme: phonemeData[i].phoneme,
        });
      }
    }

    if (selectedPhonemes.length === 0) {
      alert("少なくとも1つの音素を選択してください");
      return;
    }

    // 時間順にソート
    selectedPhonemes.sort(function (a, b) {
      return a.startTime - b.startTime;
    });

    // セリフの開始時間と終了時間を計算（labファイル内の相対時間）
    var labStartTime = selectedPhonemes[0].startTime;
    var labEndTime = selectedPhonemes[selectedPhonemes.length - 1].endTime;
    var duration = labEndTime - labStartTime;

    // 選択されたレイヤーがあればそれに直接マーカーを追加、なければヌルレイヤーを作成
    var selectedLayers = comp.selectedLayers;
    var targetLayer = null;
    var attachTime = comp.time;

    // 選択レイヤーから音声/映像レイヤーを探す
    for (var i = 0; i < selectedLayers.length; i++) {
      var layer = selectedLayers[i];
      // 音声レイヤーまたはAVレイヤー（映像付き音声）を探す
      if (layer.hasAudio || layer.source instanceof FootageItem) {
        targetLayer = layer;
        attachTime = layer.inPoint;
        break;
      }
    }

    beginUndo("lab2layer: Create Phoneme Layer");
    try {
      // 音声レイヤーがなければヌルレイヤーを作成
      if (!targetLayer) {
        targetLayer = comp.layers.addNull(duration);
        // labファイル名から拡張子を除いた名前を使用
        var layerName = labFile
          ? decodeURI(labFile.name).replace(/\.lab$/i, "")
          : "音素";
        targetLayer.name = "[Lab] " + layerName;
        targetLayer.startTime = attachTime;
      } else {
        // 既存レイヤーに[Lab]プレフィックスがなければ追加
        if (targetLayer.name.indexOf("[Lab] ") !== 0) {
          targetLayer.name = "[Lab] " + targetLayer.name;
        }
      }

      // タイミング設定を取得（ミリ秒→秒）。読み取り時に永続化もされる
      var t = readLabTimings();

      // 既存マーカーを削除して配置（共通関数）。終了が明確なら閉じ音素を自動追加する
      var placeResult = writeLabMarkers(
        targetLayer,
        attachTime,
        labStartTime,
        selectedPhonemes,
        t.offsetSec,
        cfgLabAutoClose
      );
    } finally {
      endUndo();
    }

    var message =
      "音素マーカーを追加: " +
      selectedPhonemes.length +
      "\n" +
      "長さ: " +
      duration.toFixed(2) +
      "s\n" +
      "対象: " +
      targetLayer.name;
    if (placeResult && placeResult.autoClosed) {
      message += "\n終了に閉じ口(pau)を自動追加しました";
    }
    alert(message);
  };

  // 不透明度設定
  setupOpacityBtn.onClick = function () {
    var comp = app.project.activeItem;
    if (!comp) {
      alert("コンポジションを選択してください");
      return;
    }

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
      alert("画像レイヤーを選択してください");
      return;
    }

    var targetCompName = resolvePhonemeComp(comp.name);
    if (!targetCompName) return;

    beginUndo("lab2layer: Setup Phoneme Opacity");
    try {
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];

        var expr = buildLabNameMatchExpression(targetCompName);
        layer
          .property("ADBE Transform Group")
          .property("ADBE Opacity").expression = expr;

        // レイヤーを表示状態にする
        layer.enabled = true;
      }
    } finally {
      endUndo();
    }
    alert(
      "完了: " +
        layers.length +
        " レイヤーにエクスプレッションを設定しました。\n音素ソース: " +
        targetCompName
    );
  };

  // マーカー削除
  deleteMarkersBtn.onClick = function () {
    var comp = app.project.activeItem;
    if (!comp) {
      alert("コンポジションを選択してください");
      return;
    }

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
      alert("Please select a layer with markers");
      return;
    }

    var totalDeleted = 0;

    beginUndo("lab2layer: Delete Markers");
    try {
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var markers = layer.property("Marker");
        var numMarkers = markers.numKeys;

        // マーカーを後ろから削除（インデックスがずれないように）
        for (var j = numMarkers; j >= 1; j--) {
          markers.removeKey(j);
          totalDeleted++;
        }

        // マーカーが全て削除されたら[Lab]プレフィックスを削除
        if (numMarkers > 0 && layer.name.indexOf("[Lab] ") === 0) {
          layer.name = layer.name.substring(4);
        }
      }
    } finally {
      endUndo();
    }

    if (totalDeleted > 0) {
      alert(
        "Deleted " +
          totalDeleted +
          " markers from " +
          layers.length +
          " layer(s)."
      );
    } else {
      alert("No markers found on selected layer(s).");
    }
  };

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
        } else if (!isFolder) {
          // プレフィックスなしリーフ = 任意指定（独立 ON/OFF）。
          // 無印フォルダはコンテナ扱いで選択肢にしない
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
              (paired ? "（ペア登録）" : "（ペアなし→スキップ）")
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

        createCtrlLayer(ctrlComp, comp.name);

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
          "EmoLabMaker: PSDセットアップ登録"
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
      "セットアップするグループを選択してください:"
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
      "グループコンポは「" + rootComp.name + "_◯◯」に改名されます"
    );
    noteText.graphics.foregroundColor = noteText.graphics.newPen(
      noteText.graphics.PenType.SOLID_COLOR,
      [0.6, 0.6, 0.6, 1],
      1
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
        "保持（口パク/目パチ設定済み）: " + report.kept + " レイヤー"
      );
    }
    if (report.forced > 0) {
      summaryLines.push("強制表示 (!): " + report.forced + " レイヤー");
    }
    if (report.flipPaired > 0) {
      summaryLines.push("反転ペア登録 (:flipx 等): " + report.flipPaired + " レイヤー");
    }
    if (report.markersWritten > 0) {
      summaryLines.push("デフォルト表情マーカー: " + report.markersWritten + " 件");
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
        "【反転バリエーション (:flipx/:flipy)】ペアは登録、ペアなしはスキップ"
      );
      detailLines = detailLines.concat(report.flipVariants);
      detailLines.push("");
    }
    if (report.commaNames.length > 0) {
      detailLines.push(
        "【警告: レイヤー名にカンマ「,」】表示中集合が壊れる恐れ。リネーム推奨"
      );
      detailLines = detailLines.concat(report.commaNames);
    }

    if (detailLines.length > 0) {
      var detailBox = dialog.add(
        "edittext",
        undefined,
        detailLines.join("\n"),
        { multiline: true, scrolling: true, readonly: true }
      );
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
    "PSD は AE 標準の読み込みで追加してください:"
  );
  psdGuide.add(
    "statictext",
    undefined,
    "ファイル > 読み込み > 「コンポジション - レイヤーサイズを維持」推奨"
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
    "解析してセットアップ / 更新"
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
    "アクティブコンポで選択中のレイヤー名に * / ! を付与します（付与後は再セットアップ）"
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
        buildEmoMarkerSnippet(emoCtx.ctrlCompName, emoCtx.targetCompName)
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
              emoCtx
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
        emoCtx.targetCompName
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
        "目パチを解除するコンポをアクティブにしてください（または「解除(一覧)」を使用）"
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
      "解除するコンポを選択（そのコンポ内の目パチを一括解除）:"
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
        groups[i].comp.name + "（" + groups[i].layers.length + " レイヤー）"
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
    "再生ヘッド追従（立ち絵タブを触ると現在状態に同期）"
  );
  cbFollow.value = cfgFollowPlayhead;
  cbFollow.onClick = function () {
    cfgFollowPlayhead = cbFollow.value;
    setSettingBool("followPlayhead", cfgFollowPlayhead);
  };

  var cbForced = settingsPanel.add(
    "checkbox",
    undefined,
    "立ち絵タブで「!」常時表示レイヤーを表示"
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
    "非アクティブ階層を隠す（グレーアウトの代わりに非表示）"
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
    "PSD のルートコンポを選択してください。"
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
    rebuildPsdDropdown(
      psdCtrlRow.dropdown,
      ctrlCur,
      collectCtrlCandidates()
    );
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
          "PSD を「コンポジション」として読み込んだルートコンポを選択してください。"
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

    // レイヤー選択タブを即使える状態にする
    var firstGroup = null;
    for (var i = 0; i < selectedGroups.length; i++) {
      if (selectedGroups[i].exclusiveLayers.length > 0) {
        firstGroup = selectedGroups[i];
        break;
      }
    }
    rebuildDropdown(
      targetRow.dropdown,
      firstGroup ? firstGroup.comp.name : null
    );
    rebuildDropdown(ctrlRow.dropdown, ctrlComp.name);
    rebuildList();
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

  // ════════════════════════════════════════════════════════════════
  //
  //  タブ「立ち絵」: 統合パネル・階層表示
  //
  // ════════════════════════════════════════════════════════════════
  // 立ち絵ルートコンポを選ぶと、ネストをたどって階層ツリーを組み、
  // 各階層の選択肢を表示する（ラジオ=ボタン / 任意=チェックボックス）。
  // クリックで「表示中集合」マーカーを制御コンポの現在時刻に書き込む。

  // ── 文字列ヘルパー（純粋・テスト可能） ──────────────────────────
  function detectCommonPrefix(names) {
    if (!names || names.length < 2) return "";
    var prefix = names[0];
    for (var i = 1; i < names.length; i++) {
      var n = names[i];
      var j = 0;
      while (j < prefix.length && j < n.length && prefix.charAt(j) === n.charAt(j)) {
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
      // この名前が含む「_ まで」の各 prefix 候補を加点
      for (k = 0; k < n.length; k++) {
        if (n.charAt(k) === "_") {
          var cand = n.substring(0, k + 1);
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

  function buildStageNodes(rootComp) {
    var visited = {};
    if (!rootComp) return [];
    // uniquify が付けたルート名prefix（"<root>_"）を剥がしてから */! を判定する。
    // 親コンポ参照レイヤーは uniquify 後のソース名（例 "zunda_s_*閉じ"）に追従するため、
    // prefix を剥がさないと先頭の * を検出できない。
    var stageRootPrefix = rootComp.name + "_";
    function parseMarkerName(name) {
      var n =
        name.indexOf(stageRootPrefix) === 0
          ? name.substring(stageRootPrefix.length)
          : name;
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

      for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        if (isSystemLayerName(layer.name)) continue;
        // ヌルレイヤーは表示物ではないので選択肢にしない（「ヌル」表示の除去）
        var isNull = false;
        try {
          isNull = layer.nullLayer === true;
        } catch (eNull) {}
        if (isNull) continue;

        var parsed = parseMarkerName(layer.name);

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
          radio.push({ fullName: layer.name, label: parsed.base, layer: layer, flips: [] });
        } else if (parsed.forced) {
          // ! 強制表示。リーフのみ情報として出す（グレーアウト）。フォルダはコンテナ
          if (!isFolder) {
            forced.push({ fullName: layer.name, label: parsed.base, layer: layer, flips: [] });
          }
        } else if (!isFolder) {
          // 無印リーフ = 任意指定。無印/! フォルダは choice にしない
          optional.push({ fullName: layer.name, label: parsed.base, layer: layer, flips: [] });
        }

        if (!nodeCtrlName) {
          var ctx = parseEmoContext(layer);
          if (ctx) nodeCtrlName = ctx.ctrlCompName;
        }

        if (isFolder) {
          // * フォルダで中身に * が無い = 1ポーズを包むラッパー。フォルダ自体を
          // 親のラジオ選択肢に集約済みなので、冗長なサブノードは出さない。
          var isPoseWrapper =
            parsed.exclusive && !compHasExclusiveLayer(src, stageRootPrefix);
          if (!isPoseWrapper) {
            children = children.concat(
              walk(src, childDepth, false, {
                name: layer.name,
                exclusive: parsed.exclusive,
                forced: parsed.forced,
              })
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
  // 各ノードの visibleSet は事前に解決済みであること。
  function computeStageActive(nodes) {
    var lastAtDepth = {};
    for (var i = 0; i < nodes.length; i++) {
      var nn = nodes[i];
      var parent = nn.depth === 0 ? null : lastAtDepth[nn.depth - 1] || null;
      nn.parent = parent; // 折りたたみ判定にも使う
      if (nn.depth === 0) {
        nn.active = true;
      } else {
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
      lastAtDepth[nn.depth] = nn;
    }
  }

  // ── UI 構築 ──────────────────────────────────────────────────────
  var stageTopRow = tabStage.add("group");
  stageTopRow.orientation = "row";
  stageTopRow.alignment = ["fill", "top"];
  stageTopRow.alignChildren = ["left", "center"];
  stageTopRow.spacing = 4;

  stageTopRow.add("statictext", undefined, "立ち絵");
  var stageCtrlInfo = stageTopRow.add("statictext", undefined, "");
  stageCtrlInfo.preferredSize = [16, BUTTON_HEIGHT];
  setCheckState(stageCtrlInfo, false);

  var stageRootDropdown = stageTopRow.add("dropdownlist", undefined, []);
  stageRootDropdown.alignment = ["fill", "center"];
  stageRootDropdown.minimumSize = [DROPDOWN_MIN_W, BUTTON_HEIGHT];
  stageRootDropdown.preferredSize.height = BUTTON_HEIGHT;
  stageRootDropdown.helpTip = "立ち絵のルートコンポ（PSDタブで読み込んだコンポ）";

  var stageRefreshBtn = stageTopRow.add("button", undefined, "更新");
  stageRefreshBtn.preferredSize = [52, BUTTON_HEIGHT];
  stageRefreshBtn.helpTip = "コンポ一覧・階層・現在状態を再取得（再生ヘッド移動後に押す）";

  var stageHelpBtn = stageTopRow.add("button", undefined, "ヘルプ");
  stageHelpBtn.preferredSize = [52, BUTTON_HEIGHT];

  // ── 反転（立ち絵全体を Scale でミラー。左右/上下を独立トグル） ──
  var stageFlipRow = tabStage.add("group");
  stageFlipRow.orientation = "row";
  stageFlipRow.alignment = ["fill", "top"];
  stageFlipRow.alignChildren = ["left", "center"];
  stageFlipRow.spacing = 8;
  stageFlipRow.add("statictext", undefined, "反転");
  var cbFlipX = stageFlipRow.add("checkbox", undefined, "左右反転");
  cbFlipX.helpTip = "立ち絵全体を左右反転（Scale X を -100%）";
  var cbFlipY = stageFlipRow.add("checkbox", undefined, "上下反転");
  cbFlipY.helpTip = "立ち絵全体を上下反転（Scale Y を -100%）";
  function onStageFlipToggle() {
    // ネストした三項演算子は ExtendScript で誤評価され得る（左右が上下になる等）
    // ため if/else で明示する
    var st;
    if (cbFlipX.value && cbFlipY.value) {
      st = "flipxy";
    } else if (cbFlipX.value) {
      st = "flipx";
    } else if (cbFlipY.value) {
      st = "flipy";
    } else {
      st = "";
    }
    applyStageFlip(st);
  }
  cbFlipX.onClick = onStageFlipToggle;
  cbFlipY.onClick = onStageFlipToggle;
  stageFlipRow.visible = false;

  // 表情セット（ツリーの上に配置）
  var stageSetPanel = tabStage.add("panel", undefined, "表情セット (一括切替)");
  stageSetPanel.orientation = "row";
  stageSetPanel.alignment = ["fill", "top"];
  stageSetPanel.alignChildren = ["left", "center"];
  stageSetPanel.spacing = 4;
  stageSetPanel.margins = PANEL_MARGIN;

  var stageSetDropdown = stageSetPanel.add("dropdownlist", undefined, []);
  stageSetDropdown.alignment = ["fill", "center"];
  stageSetDropdown.minimumSize = [100, BUTTON_HEIGHT];
  stageSetDropdown.preferredSize.height = BUTTON_HEIGHT;

  var stageSetApplyBtn = stageSetPanel.add("button", undefined, "適用");
  stageSetApplyBtn.preferredSize = [48, BUTTON_HEIGHT];
  var stageSetSaveBtn = stageSetPanel.add("button", undefined, "保存");
  stageSetSaveBtn.preferredSize = [48, BUTTON_HEIGHT];
  var stageSetDeleteBtn = stageSetPanel.add("button", undefined, "削除");
  stageSetDeleteBtn.preferredSize = [48, BUTTON_HEIGHT];

  // ツリー直上の更新行（再生ヘッド移動後に押す。ScriptUIは再生ヘッド停止を検知できないため）
  var stageTreeBarRow = tabStage.add("group");
  stageTreeBarRow.orientation = "row";
  stageTreeBarRow.alignment = ["fill", "top"];
  stageTreeBarRow.alignChildren = ["left", "center"];
  stageTreeBarRow.spacing = 4;
  var stageTreeHint = stageTreeBarRow.add(
    "statictext",
    undefined,
    "再生ヘッドを動かしたら →"
  );
  stageTreeHint.alignment = ["fill", "center"];
  var stageRefreshBtn2 = stageTreeBarRow.add("button", undefined, "更新");
  stageRefreshBtn2.preferredSize = [80, BUTTON_HEIGHT];
  stageRefreshBtn2.helpTip = "現在の再生ヘッド位置の表示状態を取り込んで反映";

  var stageGridPanel = tabStage.add("panel");
  stageGridPanel.alignment = ["fill", "fill"];
  stageGridPanel.margins = PANEL_MARGIN;

  // 縦に溢れたときのスクロール用: 中身(stageGrid)を上下に動かし、パネルでクリップする。
  var stageGrid = stageGridPanel.add("group");
  stageGrid.orientation = "column";
  stageGrid.alignChildren = ["left", "top"];
  stageGrid.spacing = GRID_SPACING;

  var stageScroll = stageGridPanel.add("scrollbar", undefined, 0, 0, 100);
  stageScroll.visible = false;

  var stageStatusText = tabStage.add(
    "statictext",
    undefined,
    "立ち絵ルートコンポを選択してください。"
  );
  stageStatusText.alignment = ["fill", "bottom"];

  // ── 状態 ──
  var stageNodes = [];
  var stageCollapsed = {};
  var stageCtrlComp = null;
  var isRebuildingStage = false;
  var stageScrollValue = 0;
  var stageButtons = []; // 描画済み選択肢コントロール（追従の即時更新用）
  var stageWarnings = []; // 「未選択」警告ラベル（{ctrl, node}）
  var stageFlipState = ""; // グローバル反転状態（""=通常 / "flipx" / "flipy" / "flipxy"）

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
        "emo2layer: 立ち絵 自動登録"
      );
    }
  }

  // スクロールバー操作: 中身を上下に移動（再構築せず軽量）
  stageScroll.onChanging = stageScroll.onChange = function () {
    try {
      var m = getPanelMarginOf(stageGridPanel);
      stageScrollValue = stageScroll.value;
      stageGrid.location = [m, m - stageScroll.value];
    } catch (e) {}
  };

  // マウスホイールでのスクロール(#L)。AE の ScriptUI はホイールイベントの対応が
  // バージョン依存のため、try で防御しつつ複数のデルタ表現に対応する。
  // 対応していない環境ではスクロールバー操作にフォールバックする。
  function scrollStageBy(delta) {
    if (!stageScroll.visible) return;
    var v = stageScrollValue + delta;
    if (v < 0) v = 0;
    if (v > stageScroll.maxvalue) v = stageScroll.maxvalue;
    applyStageScroll(v);
  }
  function attachStageWheel(ctrl) {
    try {
      ctrl.addEventListener("mousewheel", function (ev) {
        var d = 0;
        try {
          if (ev.deltaY !== undefined && ev.deltaY !== null) d = ev.deltaY;
          else if (ev.wheelDelta !== undefined && ev.wheelDelta !== null)
            d = -ev.wheelDelta; // wheelDelta は上スクロールで正
          else if (ev.detail !== undefined && ev.detail !== null) d = ev.detail;
        } catch (eD) {}
        if (d === 0) return;
        scrollStageBy(d > 0 ? 36 : -36);
        try {
          ev.preventDefault();
        } catch (eP) {}
      });
    } catch (e) {}
  }
  attachStageWheel(stageGridPanel);
  attachStageWheel(stageGrid);

  function setStageStatus(text) {
    stageStatusText.text = text;
  }

  function rebuildStageEmoSetDropdown(selectedName) {
    var names = stageCtrlComp ? collectEmoSetNames(stageCtrlComp) : [];
    stageSetDropdown.removeAll();
    for (var i = 0; i < names.length; i++) {
      stageSetDropdown.add("item", names[i]);
    }
    if (stageSetDropdown.items.length === 0) return;
    for (var j = 0; j < stageSetDropdown.items.length; j++) {
      if (stageSetDropdown.items[j].text === selectedName) {
        stageSetDropdown.selection = j;
        return;
      }
    }
    stageSetDropdown.selection = 0;
  }

  function rebuildStageTree() {
    if (isRebuildingStage) return;
    isRebuildingStage = true;
    try {
      for (var d = stageGrid.children.length - 1; d >= 0; d--) {
        stageGrid.remove(stageGrid.children[d]);
      }

      if (stageNodes.length === 0) {
        var empty = stageGrid.add(
          "statictext",
          undefined,
          "階層が見つかりません。PSDタブでセットアップしたコンポをルートに選んでください。"
        );
        empty.alignment = ["fill", "top"];
        stageGrid.layout.layout(true);
        stageGridPanel.layout.layout(true);
        applyStageScroll(0);
        return;
      }

      var panelW = stageGridPanel.size ? stageGridPanel.size.width : 360;
      // スクロールバー分(約18px)を差し引いた幅で折り返す
      var availBase = panelW - getPanelMarginOf(stageGridPanel) * 2 - 18;

      stageButtons = [];
      stageWarnings = [];

      for (var n = 0; n < stageNodes.length; n++) {
        var node = stageNodes[n];
        // 祖先のいずれかが折りたたまれていれば隠す
        if (isCollapsedHidden(node)) continue;
        // 設定: 非アクティブ階層を隠す（グレーアウトの代わり）
        if (cfgHideInactive && !node.active) continue;

        var indent = node.depth * cfgIndentWidth;

        // 1ノード = ヘッダ行（インデント+トグル+ラベル）+ 折り返した選択肢行
        var block = stageGrid.add("group");
        block.orientation = "column";
        block.alignment = ["fill", "top"];
        block.alignChildren = ["left", "top"];
        block.spacing = 2;

        var head = block.add("group");
        head.orientation = "row";
        head.alignChildren = ["left", "center"];
        head.spacing = 4;
        if (indent > 0) {
          var sp = head.add("group");
          sp.preferredSize = [indent, 1];
        }

        var isCollapsed = !!stageCollapsed[node.comp.id];
        // 折りたたみ対象: 子コンポを持つ階層だけでなく、自身が選択肢を持つ階層
        // （目/口/服 のような末端グループ）も「コンポジションごとに」たためる(#J)
        var nodeHasChoices =
          node.radioChoices.length > 0 ||
          node.optionalChoices.length > 0 ||
          (cfgShowForced && node.forcedChoices.length > 0);
        var collapsible = node.hasChildren || nodeHasChoices;
        if (collapsible) {
          // AE標準のツイスト三角（▼=展開 / ▶=折りたたみ）。枠なしのクリック可能ラベル
          var tg = head.add("statictext", undefined, isCollapsed ? "▶" : "▼");
          tg.preferredSize = [14, BUTTON_HEIGHT];
          tg.helpTip = isCollapsed ? "展開" : "折りたたみ";
          setCheckColor(tg, [0.78, 0.78, 0.78, 1]);
          tg.addEventListener(
            "mousedown",
            (function (id) {
              return function () {
                stageCollapsed[id] = !stageCollapsed[id];
                rebuildStageTree();
              };
            })(node.comp.id)
          );
        } else {
          var sp2 = head.add("group");
          sp2.preferredSize = [14, 1];
        }

        var lbl = head.add("statictext", undefined, node.displayName);
        lbl.helpTip = node.comp.name;

        // すべてラジオなのに何も選択されていない階層は警告を出す
        var warn = head.add("statictext", undefined, "⚠ 未選択");
        warn.helpTip =
          "この階層は排他（ラジオ）のみですが、何も表示されていません。いずれかを選択してください。";
        setCheckColor(warn, [0.95, 0.45, 0.15, 1]);
        warn.visible = isRadioGroupUnselected(node);
        stageWarnings.push({ ctrl: warn, node: node });

        // 折りたたみ時は子ノードだけでなく、このノード直下の選択肢も隠す
        // （ヘッダ＋トグルのみ残す）
        if (isCollapsed) continue;

        // 選択肢を radio→optional の順でフラット化し、幅で折り返す
        var items = [];
        var rr;
        for (rr = 0; rr < node.radioChoices.length; rr++) {
          items.push({ ch: node.radioChoices[rr], kind: "radio" });
        }
        for (rr = 0; rr < node.optionalChoices.length; rr++) {
          items.push({ ch: node.optionalChoices[rr], kind: "opt" });
        }
        if (cfgShowForced) {
          for (rr = 0; rr < node.forcedChoices.length; rr++) {
            items.push({ ch: node.forcedChoices[rr], kind: "forced" });
          }
        }

        var choiceIndent = indent + 26;
        // 折り返し幅。安全マージンは小さめにして横幅を有効活用する
        var avail = availBase - choiceIndent - 8;
        if (avail < 80) avail = 80;
        var curRow = null;
        var curW = 0;
        for (var ci = 0; ci < items.length; ci++) {
          // ラジオ=radiobutton / 任意=checkbox / 強制=無効checkbox。幅で折返し
          var hasFlips =
            items[ci].ch.flips && items[ci].ch.flips.length > 0;
          // 反転中はラベルにグリフを付けて状態を見せる
          var curSuffix =
            items[ci].kind === "forced"
              ? null
              : choiceVisibleSuffix(items[ci].ch, node.visibleSet);
          var dispLabel =
            items[ci].ch.label +
            (curSuffix ? " " + flipGlyph(curSuffix) : "");
          // ボタン幅の見積もり（全角想定で控えめ過ぎると6割しか使わないので実寸に寄せる）
          var est = dispLabel.length * 13 + 28 + (hasFlips ? 8 : 0);
          if (curRow === null || (curW + est > avail && curW > 0)) {
            curRow = block.add("group");
            curRow.orientation = "row";
            curRow.alignChildren = ["left", "center"];
            curRow.spacing = 4;
            var spc = curRow.add("group");
            spc.preferredSize = [choiceIndent, 1];
            curW = 0;
          }
          (function (nd, it, parentRow, label) {
            var on = choiceIsVisible(it.ch, nd.visibleSet);
            var ctrl;
            if (it.kind === "radio") {
              ctrl = parentRow.add("radiobutton", undefined, label);
            } else {
              ctrl = parentRow.add("checkbox", undefined, label);
            }
            ctrl.value = it.kind === "forced" ? true : on;
            var flipTip =
              it.ch.flips && it.ch.flips.length > 0
                ? "（反転ペアあり: ヘッダの反転ボタンで切替）"
                : "";
            ctrl.helpTip =
              it.ch.fullName +
              (it.kind === "forced" ? "（常に表示 !）" : flipTip);
            stageButtons.push({
              ctrl: ctrl,
              node: nd,
              ch: it.ch,
              kind: it.kind,
            });

            if (it.kind === "forced") {
              ctrl.enabled = false;
              return;
            }
            ctrl.enabled = nd.active;
            ctrl.onClick = function () {
              if (!nd.ctrlComp) {
                setStageStatus("制御コンポが見つかりません。");
                return;
              }
              var time = nd.ctrlComp.time;
              beginUndo("emo2layer: 立ち絵 切替");
              try {
                // 未登録 / 目が消えたレイヤーでも切り替えられるように保証する
                ensureNodeRegistered(nd);
                // グローバル反転状態を反映した名前を書く（反転中は flip 側を選ぶ）
                var chosen = preferredVariantName(it.ch, stageFlipState);
                if (it.kind === "radio") {
                  setRadioSelection(
                    nd.ctrlComp,
                    nd.comp.name,
                    time,
                    chosen,
                    collectRadioVariantNames(nd)
                  );
                } else {
                  // 任意: 表示中なら全バリエーションOFF、非表示なら chosen をON
                  var curSet = readVisibleSet(nd.ctrlComp, nd.comp.name, time);
                  if (choiceIsVisible(it.ch, curSet)) {
                    removeNamesFromSet(
                      nd.ctrlComp,
                      nd.comp.name,
                      time,
                      choiceAllNames(it.ch)
                    );
                  } else {
                    setRadioSelection(
                      nd.ctrlComp,
                      nd.comp.name,
                      time,
                      chosen,
                      choiceAllNames(it.ch)
                    );
                  }
                }
              } finally {
                endUndo();
              }
              setStageStatus(nd.displayName + ": " + it.ch.label);
              // 構造は変えず表示状態だけ即時同期（再構築しないので排他選択が軽い）
              syncStageControls();
            };
          })(node, items[ci], curRow, dispLabel);
          curW += est + 4;
        }
      }

      stageGrid.layout.layout(true);
      stageGridPanel.layout.layout(true);
      applyStageScroll(stageScrollValue);
    } finally {
      isRebuildingStage = false;
    }
  }

  // ツリーのスクロール: 中身(stageGrid)を上下に動かし、パネルでクリップする。
  function applyStageScroll(value) {
    try {
      var m = getPanelMarginOf(stageGridPanel);
      var pw = stageGridPanel.size ? stageGridPanel.size.width : 360;
      var ph = stageGridPanel.size ? stageGridPanel.size.height : 200;
      var sbW = 14;
      var innerH = ph - m * 2;
      var contentH = stageGrid.size ? stageGrid.size.height : 0;
      var maxv = contentH - innerH;
      if (maxv < 0) maxv = 0;
      if (value === undefined || value === null || value < 0) value = 0;
      if (value > maxv) value = maxv;
      stageScrollValue = value;

      stageScroll.location = [pw - sbW - m, m];
      stageScroll.size = [sbW, innerH];
      stageScroll.minvalue = 0;
      stageScroll.maxvalue = maxv > 0 ? maxv : 1;
      stageScroll.value = value;
      stageScroll.visible = maxv > 0;

      stageGrid.location = [m, m - value];
    } catch (e) {}
  }

  // 設定済み（[Emo] 制御レイヤーを持つ）コンポだけを列挙する
  function rebuildStageRootDropdown(selectedName) {
    var comps = getProjectComps();
    stageRootDropdown.removeAll();
    for (var i = 0; i < comps.length; i++) {
      if (hasCtrlPrefixedLayer(comps[i])) {
        stageRootDropdown.add("item", comps[i].name);
      }
    }
    if (stageRootDropdown.items.length === 0) return;
    for (var j = 0; j < stageRootDropdown.items.length; j++) {
      if (stageRootDropdown.items[j].text === selectedName) {
        stageRootDropdown.selection = j;
        return;
      }
    }
    stageRootDropdown.selection = 0;
  }

  // 現在の stageNodes に対し ctrlComp / displayName / visibleSet / active を解決する
  // （構造は変えない。再生ヘッド追従の軽量同期でも使う）
  function resolveStageState() {
    var rootComp = getSelectedComp(stageRootDropdown);
    stageCtrlComp = null;
    var i;
    for (i = 0; i < stageNodes.length; i++) {
      if (stageNodes[i].ctrlCompName) {
        var c = findCompByName(stageNodes[i].ctrlCompName);
        if (c) {
          stageCtrlComp = c;
          break;
        }
      }
    }
    if (!stageCtrlComp) stageCtrlComp = rootComp;

    var names = [];
    for (i = 0; i < stageNodes.length; i++) names.push(stageNodes[i].comp.name);
    // 表示名の短縮prefix。ルート選択に依存せず短縮できるよう複数候補を用意し、
    // 各ノードごとに「始まる最長の prefix」を剥がす（prefix を持たないコンポや
    // 複数キャラ混在でも、支配的 prefix を多数決で拾う＝#N 冗長名対策）。
    var rootName = rootComp ? rootComp.name : null;
    var childNames = [];
    for (i = 0; i < stageNodes.length; i++) {
      if (stageNodes[i].comp.name !== rootName) {
        childNames.push(stageNodes[i].comp.name);
      }
    }
    var prefixCandidates = [];
    if (rootName) prefixCandidates.push(rootName + "_");
    var dom = detectDominantPrefix(names);
    if (dom) prefixCandidates.push(dom);
    var domChild = detectDominantPrefix(childNames);
    if (domChild) prefixCandidates.push(domChild);
    var common = detectCommonPrefix(childNames);
    if (common) prefixCandidates.push(common);
    for (i = 0; i < stageNodes.length; i++) {
      var nd = stageNodes[i];
      // ルート直下に置かれた選択肢は「立ち絵全体の切替」。立ち絵名そのままだと
      // 階層ヘッダと紛らわしいので（ルート）と明示する(#ルート対応)
      nd.displayName = nd.isRoot
        ? "（ルート）"
        : stageDisplayName(nd.comp.name, prefixCandidates);
      nd.ctrlComp =
        (nd.ctrlCompName ? findCompByName(nd.ctrlCompName) : null) ||
        stageCtrlComp;
      nd.visibleSet = nd.ctrlComp
        ? readVisibleSet(nd.ctrlComp, nd.comp.name, nd.ctrlComp.time)
        : [];
    }
    computeStageActive(stageNodes);
  }

  // コントロールを作り直さず、チェック状態と有効/無効だけ現在時刻に合わせて更新する。
  // （再生ヘッド追従＆クリック後の軽量反映。作り直さないので「2回クリック」問題も再生負荷も回避）
  function syncStageControls() {
    if (!stageNodes || stageNodes.length === 0) return;
    resolveStageState();
    for (var i = 0; i < stageButtons.length; i++) {
      var e = stageButtons[i];
      try {
        if (e.kind === "forced") continue;
        e.ctrl.value = choiceIsVisible(e.ch, e.node.visibleSet);
        e.ctrl.enabled = e.node.active;
      } catch (err) {}
    }
    for (var w = 0; w < stageWarnings.length; w++) {
      try {
        stageWarnings[w].ctrl.visible = isRadioGroupUnselected(
          stageWarnings[w].node
        );
      } catch (err2) {}
    }
  }

  // グローバル反転: state（""=通常 / flipx / flipy / flipxy）へ切り替える。
  //   1) ルートコンポ最上段の調整レイヤーで合成結果ごと中心線ミラー（冪等）
  //   2) 表示中のペアを手描き flip 側へ一括スワップ（非表示の選択肢は変更しない）
  // PSDToolKit の「立ち絵全体の反転状態」を、キャンバスミラー＋ペア差し替えで再現する。
  function applyStageFlip(state) {
    if (!stageNodes || stageNodes.length === 0) return;
    resolveStageState();
    var rootComp = getSelectedComp(stageRootDropdown);
    var changed = 0;
    var mirrored = 0;
    beginUndo("emo2layer: 立ち絵 反転");
    try {
      // 1) 直接ミラー（現在の記録状態との差分だけ適用＝冪等）
      if (rootComp) {
        var cur = readFlipState(rootComp);
        var needX = flipHasX(state) !== flipHasX(cur);
        var needY = flipHasY(state) !== flipHasY(cur);
        if (needX || needY) {
          mirrored = mirrorLayersInComp(rootComp, needX, needY);
        }
        writeFlipState(rootComp, state);
      }
      // 2) 表示中ペアの差し替え
      for (var n = 0; n < stageNodes.length; n++) {
        var node = stageNodes[n];
        if (!node.ctrlComp) continue;
        var pools = [node.radioChoices, node.optionalChoices];
        var hasFlip = false;
        var p, c;
        for (p = 0; p < pools.length; p++) {
          for (c = 0; c < pools[p].length; c++) {
            if (pools[p][c].flips && pools[p][c].flips.length > 0) {
              hasFlip = true;
              break;
            }
          }
        }
        if (!hasFlip) continue;
        ensureNodeRegistered(node);
        var time = node.ctrlComp.time;
        var set = readVisibleSet(node.ctrlComp, node.comp.name, time);
        var dirty = false;
        for (p = 0; p < pools.length; p++) {
          for (c = 0; c < pools[p].length; c++) {
            var choice = pools[p][c];
            var vis = choiceVisibleName(choice, set);
            if (vis === null) continue; // 非表示はそのまま
            var want = choiceVariantName(choice, state);
            if (want === null) want = choice.fullName; // 該当反転が無ければ base
            if (want !== vis) {
              var all = choiceAllNames(choice);
              var next = [];
              for (var s = 0; s < set.length; s++) {
                if (indexOfName(all, set[s]) < 0) next.push(set[s]);
              }
              next.push(want);
              set = next;
              dirty = true;
            }
          }
        }
        if (dirty) {
          writeMarkerNameAtTime(
            node.ctrlComp,
            node.comp.name,
            time,
            set.join(",")
          );
          changed++;
        }
      }
    } finally {
      endUndo();
    }
    stageFlipState = state;
    refreshStage(false); // ラベルのグリフ更新のため作り直す
    var msg = state ? "反転 " + flipGlyph(state) + " を適用" : "反転を解除";
    msg += "（ミラー " + mirrored + " レイヤー";
    if (changed > 0) msg += " / ペア差替 " + changed + " 階層";
    msg += "）。";
    setStageStatus(msg);
  }

  // 祖先のいずれかが折りたたまれているか（折りたたみ表示判定）
  function isCollapsedHidden(node) {
    var p = node.parent;
    while (p) {
      if (stageCollapsed[p.comp.id]) return true;
      p = p.parent;
    }
    return false;
  }

  function refreshStage(rebuildDropdownToo) {
    if (rebuildDropdownToo) {
      // カレントで開いているコンポが設定済みなら、それを優先選択（現在の立ち絵に追従）。
      // そうでなければ現在の選択を維持。
      var cur = stageRootDropdown.selection
        ? stageRootDropdown.selection.text
        : null;
      var ac = getActiveComp();
      var prefer = ac && hasCtrlPrefixedLayer(ac) ? ac.name : cur;
      rebuildStageRootDropdown(prefer);
    }

    var rootComp = getSelectedComp(stageRootDropdown);
    stageNodes = buildStageNodes(rootComp);
    resolveStageState();

    setCheckState(stageCtrlInfo, stageNodes.length > 0);

    // 反転は立ち絵があれば常に使える（単純な Scale ミラー）
    stageFlipRow.visible = stageNodes.length > 0;
    // 反転状態はルートコンポの comment が真実（再読込しても保持）
    stageFlipState = readFlipState(rootComp);
    cbFlipX.value = flipHasX(stageFlipState);
    cbFlipY.value = flipHasY(stageFlipState);

    rebuildStageTree();
    rebuildStageEmoSetDropdown(
      stageSetDropdown.selection ? stageSetDropdown.selection.text : null
    );

    if (!rootComp) setStageStatus("立ち絵ルートコンポを選択してください。");
  }

  function showStageHelpDialog() {
    var dlg = new Window("dialog", "立ち絵タブの使い方");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 16;
    dlg.spacing = 6;
    var lines = [
      "【立ち絵タブ】PSDToolKit 立ち絵の階層をまとめて切り替えます。",
      "1. 設定済みの立ち絵ルートコンポを選ぶ（PSDタブでセットアップ済みのもののみ表示）",
      "2. 目/口/服などの階層がインデントで並びます",
      "   - ラジオ（* レイヤー/コンポ）= ボタン（1つだけ表示）",
      "   - 任意指定（無印レイヤー）= チェックボックス（独立 ON/OFF）",
      "   - 常時表示（! レイヤー）= 常に出るので UI には出しません",
      "3. ∇ / ▸ でサブ階層を折りたためます。選択肢は幅に応じて折り返します",
      "4. 上位コンポが選択されていない階層はグレーアウトします",
      "5. 切り替えは制御コンポの現在時刻にマーカーとして書き込まれます",
      "",
      "【反転】「左右反転 / 上下反転」のチェックで立ち絵全体を Scale ミラーします",
      "  - ルートコンポの最上位レイヤーを中心線でミラー（Scale 反転＋位置を中心線で反転）",
      "    静的な値の書き換えだけなので描画は重くなりません（負荷ゼロ）。各軸は独立トグル",
      "  - 反転状態はルートコンポのコメントに記録（再読込しても保持）",
      "  ※ 最上位レイヤーにキーフレーム/式/親子付けがあると正しくミラーできない場合あり",
      "",
      "再生ヘッドを動かした後はパネルをクリックすると自動更新します",
      "（取れない場合は「更新」。ScriptUI は再生ヘッド移動を直接検知できません）。",
      "",
      "「表情セット」で全階層の表示状態をまとめて保存/適用できます。",
    ];
    for (var i = 0; i < lines.length; i++) {
      dlg.add("statictext", undefined, lines[i]);
    }
    dlg.add("button", undefined, "閉じる", { name: "ok" });
    dlg.show();
  }

  stageRefreshBtn.onClick = function () {
    refreshStage(true);
    setStageStatus("一覧を更新しました。");
  };

  stageRefreshBtn2.onClick = function () {
    refreshStage(false);
    setStageStatus("現在の再生ヘッド位置の状態を取り込みました。");
  };

  stageHelpBtn.onClick = function () {
    showStageHelpDialog();
  };

  stageRootDropdown.onChange = function () {
    refreshStage(false);
  };

  stageSetSaveBtn.onClick = function () {
    if (!stageCtrlComp) {
      setStageStatus("立ち絵ルートを選択してください。");
      return;
    }
    var entries = captureEmoSet(stageCtrlComp);
    if (entries.length === 0) {
      alert("保存できる状態がありません。先に表情を切り替えてください。");
      return;
    }
    var defaultName = stageSetDropdown.selection
      ? stageSetDropdown.selection.text
      : "セット1";
    var setName = promptForSetName(defaultName);
    if (!setName) return;
    saveEmoSet(stageCtrlComp, setName, entries);
    rebuildStageEmoSetDropdown(setName);
    setStageStatus(
      "表情セット「" + setName + "」を保存しました（" + entries.length + " グループ）。"
    );
  };

  stageSetApplyBtn.onClick = function () {
    if (!stageCtrlComp || !stageSetDropdown.selection) {
      setStageStatus("適用する表情セットを選択してください。");
      return;
    }
    var setName = stageSetDropdown.selection.text;
    var result = applyEmoSet(stageCtrlComp, setName);
    if (!result) {
      setStageStatus("表情セットが見つかりません: " + setName);
      rebuildStageEmoSetDropdown(null);
      return;
    }
    refreshStage(false);
    setStageStatus(
      "表情セット「" + setName + "」を適用しました（" + result.applied + " グループ）。"
    );
  };

  stageSetDeleteBtn.onClick = function () {
    if (!stageCtrlComp || !stageSetDropdown.selection) {
      setStageStatus("削除する表情セットを選択してください。");
      return;
    }
    var setName = stageSetDropdown.selection.text;
    var layer = findEmoSetLayer(stageCtrlComp, setName);
    if (!layer) {
      rebuildStageEmoSetDropdown(null);
      return;
    }
    if (!confirm("表情セット「" + setName + "」を削除しますか？")) return;
    beginUndo("emo2layer: 表情セット削除");
    try {
      layer.remove();
    } finally {
      endUndo();
    }
    rebuildStageEmoSetDropdown(null);
    setStageStatus("表情セット「" + setName + "」を削除しました。");
  };

  // リサイズ対応
  win.onResizing = win.onResize = function () {
    this.layout.resize();
    if (tabs.selection === tabSelector) resizeGrid();
    else if (tabs.selection === tabStage) rebuildStageTree();
    else if (tabs.selection === tabLab) refreshMouthScroll();
  };

  // タブ切替時に最新化（立ち絵=階層再取得 / PSD=コンポ一覧を更新）
  tabs.onChange = function () {
    if (tabs.selection === tabStage) refreshStage(true);
    else if (tabs.selection === tabPsd) refreshPsdDropdowns();
    else if (tabs.selection === tabLab) refreshMouthScroll();
  };

  // 再生ヘッド追従: パネルがアクティブになったら、既存ボタンのグリフ/有効状態だけ
  // その場で更新する（ボタンを作り直さないので「2回クリック」問題は起きない）。
  win.onActivate = function () {
    try {
      if (cfgFollowPlayhead && tabs.selection === tabStage) syncStageControls();
    } catch (e) {}
  };

  // ════════════════════════════════════════════════════════════════
  // 初期化
  // ════════════════════════════════════════════════════════════════

  (function init() {
    var activeComp = getActiveComp();
    var name = activeComp ? activeComp.name : null;
    rebuildDropdown(targetRow.dropdown, name);
    rebuildDropdown(ctrlRow.dropdown, name);
    rebuildPsdDropdown(psdRootRow.dropdown, name);
    rebuildPsdDropdown(psdCtrlRow.dropdown, name, collectCtrlCandidates());
    rebuildStageRootDropdown(name);
    rebuildList();
    refreshStage(false);
    refreshMouthScroll();
  })();

  if (win instanceof Window) {
    win.center();
    win.show();
  } else {
    win.layout.layout(true);
  }
})(this);
