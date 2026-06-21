// ════════════════════════════════════════════════════════════════
// 共通定数
// ════════════════════════════════════════════════════════════════
var BUTTON_HEIGHT = 24;
var EMO_VERSION = "2.0.3";
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
  "a,i,u,e,o,N,pau,sil,cl,Q,br",
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
var versionText = versionRow.add("statictext", undefined, "v" + EMO_VERSION);
versionText.alignment = ["right", "center"];
versionText.helpTip = "EmoLabMaker version " + EMO_VERSION;
try {
  versionText.graphics.foregroundColor = versionText.graphics.newPen(
    versionText.graphics.PenType.SOLID_COLOR,
    [0.5, 0.5, 0.5, 1],
    1,
  );
} catch (eVc) {}

// 表示順は作業フロー基準: セットアップ(PSD取込・初期準備) → 立ち絵(日常のハブ) → 口パク → 目パチ
var tabPsd = tabs.add("tab", undefined, "セットアップ");
var tabStage = tabs.add("tab", undefined, "立ち絵");
var tabLab = tabs.add("tab", undefined, "口パク");
var tabBlink = tabs.add("tab", undefined, "目パチ");
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

// 並びは PSD が先頭だが、日常のハブである立ち絵を初期選択にする
tabs.selection = tabStage;
