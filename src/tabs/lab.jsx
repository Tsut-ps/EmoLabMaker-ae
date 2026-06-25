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
labPanel.margins = 8;

// ========== ファイル選択グループ ==========
var fileSelectGroup = labPanel.add("group");
fileSelectGroup.orientation = "row";
fileSelectGroup.alignChildren = ["left", "center"];
fileSelectGroup.alignment = ["fill", "top"];

fileSelectGroup.add("statictext", undefined, "labファイル");

var filePathText = fileSelectGroup.add("edittext", undefined, "ファイル未選択");
filePathText.alignment = ["fill", "center"];
filePathText.preferredSize.height = BUTTON_HEIGHT;
filePathText.enabled = false;

var browseBtn = fileSelectGroup.add("button", undefined, "...");
browseBtn.preferredSize = [30, BUTTON_HEIGHT];
browseBtn.alignment = ["right", "center"];
browseBtn.helpTip = "labファイルを選択";

// ========== ファイル一括読み込み (wav/txt/lab) ==========
var bulkPanel = tabLab.add(
  "panel",
  undefined,
  "ファイル一括読み込み (wav/txt/lab)",
);
bulkPanel.orientation = "column";
bulkPanel.alignChildren = ["fill", "top"];
bulkPanel.alignment = ["fill", "top"];
bulkPanel.spacing = 4;
bulkPanel.margins = 8;

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

// 配置する音素は「音素マーカー (lab)」パネルの『音素:』欄（単体配置と共通）。
// 一括もそこで指定した cfgImportPhonemes（空＝すべて）で絞り込む。

var bulkBtnRow = bulkPanel.add("group");
bulkBtnRow.orientation = "row";
bulkBtnRow.alignChildren = ["fill", "center"];
bulkBtnRow.alignment = ["fill", "top"];
bulkBtnRow.spacing = 5;
var bulkPickBtn = bulkBtnRow.add("button", undefined, "ファイルを選択して配置");
bulkPickBtn.preferredSize.height = BUTTON_HEIGHT;
bulkPickBtn.helpTip =
  "wav/txt/lab をまとめて選択し、同名どうしを1組として現在のコンポに配置（A方式）";
var bulkSiblingBtn = bulkBtnRow.add("button", undefined, "選択音声の隣を取込");
bulkSiblingBtn.preferredSize.height = BUTTON_HEIGHT;
bulkSiblingBtn.helpTip =
  "選択した音声レイヤーのソースと同じ名前の .lab/.txt が隣にあれば取り込む（B方式）";

bulkPanel.add(
  "statictext",
  undefined,
  "テキストは UTF-8 のtxtをそのまま字幕レイヤーにします（連携は今後対応）",
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
    true,
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
    phonemeFilter: normalizeCsvTokens(cfgImportPhonemes),
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
        : ""),
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
      f =
        sel[i].source &&
        sel[i].source.mainSource &&
        sel[i].source.mainSource.file;
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
            normalizeCsvTokens(cfgImportPhonemes),
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
      (noneCount > 0 ? "\n隣に該当ファイルが無かった: " + noneCount : ""),
  );
};

// ========== 配置する音素（単体配置・一括配置で共通） ==========
// 「音素: [入力欄] [音素を選択…]」の1行。入力欄(cfgImportPhonemes, 空＝すべて)が
// 単一ソースで、直接編集もダイアログ選択も同じ欄を書き換える。
var phonemeSelectRow = labPanel.add("group");
phonemeSelectRow.orientation = "row";
phonemeSelectRow.alignment = ["fill", "top"];
phonemeSelectRow.alignChildren = ["left", "center"];
phonemeSelectRow.spacing = 4;

phonemeSelectRow.add("statictext", undefined, "音素:");
var phonemeInput = phonemeSelectRow.add("edittext", undefined, cfgImportPhonemes);
phonemeInput.alignment = ["fill", "center"];
phonemeInput.preferredSize.height = BUTTON_HEIGHT;
phonemeInput.helpTip =
  "配置する音素をカンマ区切りで指定（空＝すべて）。単体配置・一括配置で共通。既定は母音＋ん＋閉じ系";
phonemeInput.onChange = function () {
  cfgImportPhonemes = phonemeInput.text;
  setSettingStr("importPhonemes", cfgImportPhonemes);
  onPhonemeSelectionChanged();
};

var phonemeSelectBtn = phonemeSelectRow.add("button", undefined, "音素を選択…");
phonemeSelectBtn.preferredSize = [96, BUTTON_HEIGHT];
phonemeSelectBtn.alignment = ["right", "center"];
phonemeSelectBtn.helpTip =
  "配置する音素をチェックで選びます（母音+ん/子音/すべて 等）";

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

// 最初から出しておく「おすすめ子音」（母音+ん＋特殊＝commonPhonemes と合わせて baseline）。
// よく使う・口形を付けやすい子音に絞る（多すぎ防止。残りはダイアログの「子音」で追加可能）。
var RECOMMENDED_CONSONANTS = ["k", "s", "t", "n", "h", "m", "r", "w"];

// 配置する音素の単一ソースは cfgImportPhonemes（CSV 文字列。空＝すべて）。
// phonemeCandidates はダイアログ表示用の候補一覧（baseline ∪ 直近 lab）。
var phonemeCandidates = []; // [{phoneme, count, data}]（buildMergedPhonemeList の結果）
var labFile = null;
var labFileEntries = []; // 直近に読み込んだ lab の音素＋出現回数（確認表示用）
var extraPhonemes = []; // 予約: baseline に上乗せする追加音素（現状は未使用）

// 発話終了時に打つ「閉じ音素」。どの母音にも属さない pau を使い、閉じ口へ戻す。
var LAB_CLOSE_PHONEME = "pau";

// baseline（最初から出す一般音素）= 母音+ん+特殊 ＋ おすすめ子音 ＋ ユーザー追加分
function baselinePhonemes() {
  return commonPhonemes.concat(RECOMMENDED_CONSONANTS).concat(extraPhonemes);
}

// 候補一覧 (list=[{phoneme,count,data}]) を取り込む。選択そのものは
// cfgImportPhonemes（CSV）が単一ソースなので、ここでは候補と配置可否だけ更新する。
function setPhonemeCandidates(list) {
  phonemeCandidates = list;
  var hasFile = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i].count > 0) hasFile = true;
  }
  createBtn.enabled = hasFile; // ファイルに音素があるときだけ「音素配置」可
  refreshMouthCoverage();
}

// baseline（最初から出す一般音素）＋ 直近 lab をマージして候補を再構築
function refreshPhonemeChecklist() {
  setPhonemeCandidates(
    buildMergedPhonemeList(labFileEntries, baselinePhonemes()),
  );
}

// その音素が配置対象か（cfgImportPhonemes が空＝すべて）。
function isPhonemeSelected(name) {
  var toks = normalizeCsvTokens(cfgImportPhonemes);
  if (toks.length === 0) return true; // 空＝すべて
  return indexOfName(toks, name) >= 0;
}

// 配置する音素が変わったとき: 口形に無い音素は新規行で自動追加し、警告を更新する。
function onPhonemeSelectionChanged() {
  autoAddPhonemesToMouthRows();
  refreshMouthCoverage();
}

// 「使う音素」のうち、どの口形行(CSV)にも無いものを口形マッピングへ新規行で追加する。
function autoAddPhonemesToMouthRows() {
  var existing = {};
  var r, t;
  for (r = 0; r < mouthRows.length; r++) {
    var toks = normalizeCsvTokens(mouthRows[r].csvInput.text);
    for (t = 0; t < toks.length; t++) existing[toks[t]] = true;
  }
  var used = collectUsedPhonemes();
  var added = 0;
  for (var i = 0; i < used.length; i++) {
    var p = used[i];
    if (existing[p]) continue;
    existing[p] = true;
    addMouthRow(p, p, false); // ラベル=音素・CSV=音素・閉じでない
    added++;
  }
  if (added > 0) {
    try {
      mouthMapPanel.layout.layout(true);
      refreshMouthScroll();
    } catch (e) {}
  }
  return added;
}

// 「音素を選択…」ダイアログ。phonemeCandidates をチェックボックスで描画し、
// 初期チェックは cfgImportPhonemes から。OK で CSV へ書き戻す（Cancel で破棄）。
// すべてチェック＝空 CSV（=すべて）にして「未知の音素も配置」を保つ。
function openPhonemeDialog() {
  if (phonemeCandidates.length === 0) {
    alert("選択できる音素がありません。labファイルを読み込んでください。");
    return;
  }
  var dlg = new Window("dialog", "音素を選択");
  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];
  dlg.margins = 14;
  dlg.spacing = 8;

  dlg.add(
    "statictext",
    undefined,
    "配置する音素をチェックしてください（ファイルにある音素は「a(3)」のように回数付き）:",
  );

  // チェックボックスを 3 列で並べる
  var listGroup = dlg.add("group");
  listGroup.orientation = "column";
  listGroup.alignChildren = ["fill", "top"];
  listGroup.spacing = 2;

  // 表示候補 = phonemeCandidates ∪ 入力欄に直接書かれた音素（OK で消えないように）
  var dlgItems = [];
  var seenItem = {};
  var di;
  for (di = 0; di < phonemeCandidates.length; di++) {
    dlgItems.push(phonemeCandidates[di]);
    seenItem[phonemeCandidates[di].phoneme] = true;
  }
  var csvToks = normalizeCsvTokens(cfgImportPhonemes);
  for (di = 0; di < csvToks.length; di++) {
    if (!seenItem[csvToks[di]]) {
      seenItem[csvToks[di]] = true;
      dlgItems.push({ phoneme: csvToks[di], count: 0, data: { times: [] } });
    }
  }

  var boxes = []; // [{checkbox, phoneme}]
  var currentRow = null;
  var colCount = 0;
  for (var i = 0; i < dlgItems.length; i++) {
    var item = dlgItems[i];
    if (colCount === 0) {
      currentRow = listGroup.add("group");
      currentRow.orientation = "row";
      currentRow.alignment = ["fill", "top"];
      currentRow.alignChildren = ["left", "center"];
      currentRow.spacing = 5;
    }
    var labelText =
      item.count > 0 ? item.phoneme + "(" + item.count + ")" : item.phoneme;
    var cb = currentRow.add("checkbox", undefined, labelText);
    cb.value = isPhonemeSelected(item.phoneme);
    cb.minimumSize.width = 64;
    // ファイルに無い音素（baseline のみ）は淡色にして「候補」だと分かるように
    if (item.count <= 0) setCheckColor(cb, [0.5, 0.5, 0.5, 1]);
    cb.helpTip =
      item.count > 0
        ? "このファイルに " + item.count + " 回出現"
        : "このファイルには含まれていません（一般音素として候補表示）";
    boxes.push({ checkbox: cb, phoneme: item.phoneme });
    colCount++;
    if (colCount >= 3) colCount = 0;
  }

  // 一括選択ボタン（ダイアログ内のチェックを操作。OK まで本体には書き戻さない）
  function selectInDialog(selector) {
    for (var b = 0; b < boxes.length; b++) {
      boxes[b].checkbox.value = selector(
        boxes[b].phoneme,
        boxes[b].checkbox.value,
      );
    }
  }
  var selRow = dlg.add("group");
  selRow.orientation = "row";
  selRow.alignChildren = ["fill", "center"];
  selRow.spacing = 5;
  var dAllBtn = selRow.add("button", undefined, "すべて");
  var dCommonBtn = selRow.add("button", undefined, "母音+ん");
  var dConsonantBtn = selRow.add("button", undefined, "子音");
  var dNoneBtn = selRow.add("button", undefined, "解除");
  dCommonBtn.helpTip = "母音・ん・無音/閉じ系を選択（基本はこれでOK）";
  dConsonantBtn.helpTip = "子音(k/s/t…)も追加でチェック（より細かい口の動き）";
  dAllBtn.onClick = function () {
    selectInDialog(function () {
      return true;
    });
  };
  dNoneBtn.onClick = function () {
    selectInDialog(function () {
      return false;
    });
  };
  dCommonBtn.onClick = function () {
    selectInDialog(function (p) {
      return isCommonPhoneme(p);
    });
  };
  dConsonantBtn.onClick = function () {
    selectInDialog(function (p, cur) {
      return cur || isConsonantPhoneme(p);
    });
  };

  var btnRow = dlg.add("group");
  btnRow.orientation = "row";
  btnRow.alignment = ["right", "top"];
  btnRow.add("button", undefined, "OK", { name: "ok" });
  btnRow.add("button", undefined, "キャンセル", { name: "cancel" });

  if (dlg.show() !== 1) return;

  // OK: チェック結果を CSV にまとめる（全候補チェック → 空＝すべて で catch-all を維持）
  var chosen = [];
  var allChecked = true;
  for (var k = 0; k < boxes.length; k++) {
    if (boxes[k].checkbox.value) chosen.push(boxes[k].phoneme);
    else allChecked = false;
  }
  cfgImportPhonemes = allChecked ? "" : chosen.join(",");
  setSettingStr("importPhonemes", cfgImportPhonemes);
  phonemeInput.text = cfgImportPhonemes;
  onPhonemeSelectionChanged();
}
phonemeSelectBtn.onClick = openPhonemeDialog;

// ========== タイミング設定グループ（全て app.settings で永続化） ==========
var offsetGroup = labPanel.add("group");
offsetGroup.orientation = "row";
offsetGroup.alignment = ["fill", "top"];
offsetGroup.alignChildren = ["left", "center"];
offsetGroup.spacing = 5;

var offsetLabel = offsetGroup.add("statictext", undefined, "オフセット(ms)");
offsetLabel.alignment = ["left", "center"];

var offsetInput = offsetGroup.add(
  "edittext",
  undefined,
  String(cfgLabOffsetMs),
);
offsetInput.preferredSize = [48, BUTTON_HEIGHT];
offsetInput.helpTip =
  "動画先行の法則: 映像は音声より数フレーム速いほうが自然に見えます（負の値=映像先行）。全マーカーを一律シフト";

var frameMinus = offsetGroup.add("button", undefined, "<");
frameMinus.preferredSize = [30, BUTTON_HEIGHT];
frameMinus.alignment = ["left", "center"];
frameMinus.helpTip = "1フレーム戻す（映像をさらに先行）";

var framePlus = offsetGroup.add("button", undefined, ">");
framePlus.preferredSize = [30, BUTTON_HEIGHT];
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

var autoCloseCheck = offsetGroup.add("checkbox", undefined, "終了に閉じ口");
autoCloseCheck.value = cfgLabAutoClose;
autoCloseCheck.helpTip =
  "ラボの終了時刻に閉じ音素(pau)を自動追加し、発話後に口を閉じる（末尾の口が開いたまま残るのを防ぐ）";
autoCloseCheck.onClick = function () {
  cfgLabAutoClose = autoCloseCheck.value;
  setSettingBool("labAutoClose", cfgLabAutoClose);
};

// ========== 口形状の割り当て (PSDToolKit互換) ==========
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

var mouthMapPanel = tabLab.add("panel", undefined, "口形状の割り当て");
mouthMapPanel.orientation = "column";
mouthMapPanel.alignChildren = ["fill", "top"];
mouthMapPanel.alignment = ["fill", "top"];
mouthMapPanel.spacing = 4;
mouthMapPanel.margins = 8;

var mouthMapHint = mouthMapPanel.add(
  "statictext",
  undefined,
  "各口形にレイヤーを「割当」→「適用」。音素⇔口形は編集して再「適用」で後から変更できます",
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
// 縦スクロール対応にし、追加/削除ボタンは常に下に残す(#C)。
// 口パクは固定高さ + スクロールバー（リサイズ・追加で壊れないシンプル方式）。
var MOUTH_SCROLL_H = 130;
var mouthRowsClip = mouthMapPanel.add("panel");
mouthRowsClip.alignment = ["fill", "top"];
mouthRowsClip.margins = 2;
mouthRowsClip.minimumSize = [60, MOUTH_SCROLL_H];
mouthRowsClip.maximumSize = [4000, MOUTH_SCROLL_H];
mouthRowsClip.preferredSize.height = MOUTH_SCROLL_H;

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
    // 口パクは固定高さ + スクロールバー。高さは固定値（クリップ枠の高さ）。
    // スクロールバーの横位置は「クリップ枠の実寸幅」を使う。ウィンドウ由来の
    // 推定幅(availWidthForPanel)だと実幅より広く見積もったとき、スクロールバーが
    // 右端の外に出て見えなくなるため（＝今回の不具合）。実寸が取れなければ推定で代替。
    var clipW = 0;
    try {
      if (mouthRowsClip.size && mouthRowsClip.size.width) {
        clipW = mouthRowsClip.size.width;
      }
    } catch (eW0) {}
    if (!clipW || clipW < 40) clipW = availWidthForPanel(mouthRowsClip, tabLab);
    var pw = clipW;
    var ph = MOUTH_SCROLL_H;
    var sbW = 14;
    var innerH = ph - m * 2;
    // 中身の高さは子要素の合計で測る（伸縮・頭打ちに影響されない）。
    // 非表示タブでは子のサイズが未確定で 0 になり得るので、行数からの概算を下限にする
    // （これがないと行が増えてもスクロールバーが出ないことがある）。
    var contentH = contentHeightOf(mouthRowsGroup);
    var estH =
      mouthRows.length * (BUTTON_HEIGHT + (mouthRowsGroup.spacing || 2));
    if (contentH < estH) contentH = estH;
    var maxv = contentH - innerH;
    if (maxv < 0) maxv = 0;
    if (value === undefined || value === null || value < 0) value = 0;
    if (value > maxv) value = maxv;
    mouthRowsScrollValue = value;
    // 中身をコンテンツ高さに固定（引き伸ばされると下端が描画されない）
    var innerW = pw - m * 2 - (maxv > 0 ? sbW : 0);
    if (innerW < 20) innerW = 20;
    try {
      mouthRowsGroup.size = [innerW, contentH];
    } catch (eSz) {}
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
  csvInput.preferredSize = [110, BUTTON_HEIGHT];
  csvInput.helpTip = "この口形で表示する音素（カンマ区切り）";
  csvInput.onChange = function () {
    refreshMouthCoverage();
  };

  var assignBtn = row.add("button", undefined, "割当");
  assignBtn.preferredSize = [40, BUTTON_HEIGHT];
  assignBtn.helpTip = "アクティブコンポの選択レイヤーをこの口形に割当";

  var delBtn = row.add("button", undefined, "×");
  delBtn.preferredSize = [22, BUTTON_HEIGHT];
  delBtn.helpTip = "この口形の行を削除";

  var namesText = row.add("statictext", undefined, "（未割当）");
  namesText.alignment = ["fill", "center"];

  // ん(閉) が唯一の閉じ口。閉じかどうかは内部フラグで固定（行ごとの編集はしない）。
  var rowData = {
    row: row,
    labelInput: labelInput,
    csvInput: csvInput,
    isClosed: !!isClosed,
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
    refreshMouthCoverage();
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
    refreshMouthCoverage();
  };
  return rowData;
}

// 既定の6行（あ/い/う/え/お/ん(閉)）
for (var msIdx = 0; msIdx < MOUTH_SHAPES.length; msIdx++) {
  addMouthRow(
    MOUTH_SHAPES[msIdx].label,
    MOUTH_SHAPES[msIdx].preset,
    !!MOUTH_SHAPES[msIdx].closedFallback,
  );
}

// 編集系（行追加・自動割当・初期化）を 1 行に、横幅 3 等分で
var mouthEditBtnRow = mouthMapPanel.add("group");
mouthEditBtnRow.orientation = "row";
mouthEditBtnRow.alignment = ["fill", "top"];
mouthEditBtnRow.alignChildren = ["fill", "center"];
mouthEditBtnRow.spacing = 5;

var mouthAddBtn = mouthEditBtnRow.add("button", undefined, "＋口形を追加");
mouthAddBtn.alignment = ["fill", "center"];
mouthAddBtn.preferredSize.height = BUTTON_HEIGHT;
mouthAddBtn.helpTip = "「あいうえおん」以外の口形（特殊口など）の行を追加";
mouthAddBtn.onClick = function () {
  addMouthRow("", "", false);
  try {
    mouthMapPanel.layout.layout(true);
    refreshMouthScroll();
  } catch (e) {}
};
var mouthAutoBtn = mouthEditBtnRow.add("button", undefined, "自動割当");
mouthAutoBtn.alignment = ["fill", "center"];
mouthAutoBtn.preferredSize.height = BUTTON_HEIGHT;
mouthAutoBtn.helpTip =
  "選択レイヤー名に「あ/い/う/え/お/ん」が含まれていれば自動で割当";
var mouthPresetBtn = mouthEditBtnRow.add("button", undefined, "プリセット");
mouthPresetBtn.alignment = ["fill", "center"];
mouthPresetBtn.preferredSize.height = BUTTON_HEIGHT;
mouthPresetBtn.helpTip = "口形マッピングを初期状態（あ/い/う/え/お/ん）に戻す";

// 実行系（適用・解除）
var mouthMapBtnRow = mouthMapPanel.add("group");
mouthMapBtnRow.orientation = "row";
mouthMapBtnRow.alignment = ["fill", "top"];
mouthMapBtnRow.alignChildren = ["fill", "center"];
mouthMapBtnRow.spacing = 5;

var mouthApplyBtn = mouthMapBtnRow.add("button", undefined, "適用");
mouthApplyBtn.alignment = ["fill", "center"];
mouthApplyBtn.preferredSize.height = BUTTON_HEIGHT;
mouthApplyBtn.helpTip =
  "割当済みレイヤーに不透明度エクスプレッションを設定（表情登録済みなら共存）";
var mouthRemoveBtn = mouthMapBtnRow.add("button", undefined, "解除");
mouthRemoveBtn.alignment = ["fill", "center"];
mouthRemoveBtn.preferredSize.height = BUTTON_HEIGHT;
mouthRemoveBtn.helpTip =
  "選択レイヤーのマッピングを解除（表情登録済みなら表情切替に戻す）";

// 口形カバレッジ警告: 音素の未割当（閉じ口になる）／口形のレイヤー未割当 を示す
var mouthCoverageWarn = mouthMapPanel.add("statictext", undefined, "", {
  multiline: true,
});
mouthCoverageWarn.alignment = ["fill", "top"];
setCheckColor(mouthCoverageWarn, [0.95, 0.45, 0.15, 1]); // 立ち絵ツリーの ⚠ と同系色
mouthCoverageWarn.visible = false;

// 「使う音素」= 配置する音素（cfgImportPhonemes）。空＝すべての扱いなので、
// 列挙できない代表として母音+ん（commonPhonemes）をカバレッジ判定に使う。
function collectUsedPhonemes() {
  var out = [];
  var seen = {};
  var i;
  function add(p) {
    if (p && !seen[p]) {
      seen[p] = true;
      out.push(p);
    }
  }
  var f = normalizeCsvTokens(cfgImportPhonemes);
  for (i = 0; i < f.length; i++) add(f[i]);
  if (out.length === 0) {
    // 空＝すべて。代表として母音+ん
    for (i = 0; i < commonPhonemes.length; i++) add(commonPhonemes[i]);
  }
  return out;
}

// 口形マッピングの警告を再計算して表示を更新する。2 種類を出す:
//   1) 使う音素のうち、どの口形にも未割当（＝閉じ口になる）もの
//   2) 音素はあるのにレイヤーが未割当の口形行（割り当て忘れ）
function refreshMouthCoverage() {
  if (!mouthCoverageWarn) return; // UI 構築前のガード
  var mapped = [];
  var noLayer = [];
  for (var r = 0; r < mouthRows.length; r++) {
    var toks = normalizeCsvTokens(mouthRows[r].csvInput.text);
    for (var t = 0; t < toks.length; t++) mapped.push(toks[t]);
    if (toks.length > 0 && mouthRows[r].layers.length === 0) {
      var lbl = mouthRows[r].labelInput.text.replace(/^\s+|\s+$/g, "");
      noLayer.push(lbl.length > 0 ? lbl : toks.join("/"));
    }
  }
  var unmapped = findUnmappedPhonemes(collectUsedPhonemes(), mapped);
  var lines = [];
  if (unmapped.length > 0) {
    lines.push("⚠ 口形に未割当（閉じ口になります）: " + unmapped.join(", "));
  }
  if (noLayer.length > 0) {
    lines.push("⚠ レイヤー未割当の口形: " + noLayer.join(", "));
  }
  if (lines.length > 0) {
    mouthCoverageWarn.text = lines.join("\n");
    mouthCoverageWarn.visible = true;
  } else {
    mouthCoverageWarn.text = "";
    mouthCoverageWarn.visible = false;
  }
  try {
    mouthMapPanel.layout.layout(true);
  } catch (e) {}
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

  // 行（口形）ごとに、一致する口パクレイヤーを集める。閉じ口を先に処理して
  // 「閉」が母音より先にレイヤーを取れるようにする。
  var order = [];
  for (r = 0; r < mouthRows.length; r++) {
    if (mouthRows[r].isClosed) order.push(mouthRows[r]);
  }
  for (r = 0; r < mouthRows.length; r++) {
    if (!mouthRows[r].isClosed) order.push(mouthRows[r]);
  }

  // 1 レイヤーは 1 行までしか使わない（重複割当を防ぐ）
  var used = {};
  for (var oi = 0; oi < order.length; oi++) {
    var rowData = order[oi];
    var keys = mouthMatchKeys(rowData.labelInput.text);
    var matches = [];
    for (var i = 0; i < comp.selectedLayers.length; i++) {
      if (used[i]) continue;
      var layer = comp.selectedLayers[i];
      var hit = false;
      for (var ki = 0; ki < keys.length; ki++) {
        if (keys[ki] && layer.name.indexOf(keys[ki]) >= 0) {
          hit = true;
          break;
        }
      }
      if (hit) matches.push({ idx: i, layer: layer });
    }
    if (matches.length === 0) continue;

    var chosenIdx = -1;
    if (matches.length === 1) {
      chosenIdx = matches[0].idx;
    } else {
      // 複数の口パクレイヤーが一致 → 1 枚だけ選ばせる（二重表示を防ぐ）
      var layersOnly = [];
      for (var m = 0; m < matches.length; m++)
        layersOnly.push(matches[m].layer);
      var picked = pickMouthLayerDialog(rowData.labelInput.text, layersOnly);
      if (!picked) continue; // 割り当てない
      for (var m2 = 0; m2 < matches.length; m2++) {
        if (matches[m2].layer === picked) {
          chosenIdx = matches[m2].idx;
          break;
        }
      }
      if (chosenIdx < 0) continue;
    }
    // 1 行 = 1 口パクレイヤー（二重表示にしない）
    rowData.layers = [comp.selectedLayers[chosenIdx]];
    used[chosenIdx] = true;
    assignedCount++;
  }

  for (var k = 0; k < mouthRows.length; k++) {
    mouthRows[k].namesText.text = describeAssignedLayers(mouthRows[k].layers);
    mouthRows[k].namesText.helpTip = mouthRows[k].namesText.text;
  }

  if (assignedCount === 0) {
    alert(
      "割当できるレイヤーがありませんでした。\n各行のラベル（あ/い/う/閉 など）がレイヤー名に含まれている必要があります。",
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
      !!MOUTH_SHAPES[s].closedFallback,
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
      "口形マッピングを PSDToolKit 互換の初期状態（あ/い/う/え/お/ん の6行）に戻します。\n追加した口形の行や割当もリセットされます。よろしいですか？",
    )
  ) {
    return;
  }
  resetMouthRowsToDefault();
  refreshMouthCoverage();
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
      "口形レイヤーが割り当てられていません。\n各行の「割当」または「自動割当」で設定してください。",
    );
    return;
  }

  var activeComp = getActiveComp();
  var phonemeCompName = resolvePhonemeComp(activeComp ? activeComp.name : null);
  if (!phonemeCompName) return;

  var allCsv = allTokens.join(",");

  // 全行のレイヤーを items 化して一括適用
  var items = [];
  var mappedNames = {};
  for (var i = 0; i < mouthRows.length; i++) {
    var row = mouthRows[i];
    var myCsv = row.tokens.join(",");
    var isClosedFallback = row.isClosed;
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
      mouthLabTagInput.text.replace(/^\s+|\s+$/g, ""),
    );
  } finally {
    endUndo();
  }
  var appliedCount = result.applied;
  var staleCount = result.stale;

  var message =
    "完了: " +
    appliedCount +
    " レイヤーにマッピングを設定しました。\n音素ソース: " +
    phonemeCompName;
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
          emoCtx.targetCompName,
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
createBtn.preferredSize.height = BUTTON_HEIGHT;
createBtn.enabled = false;

var deleteMarkersBtn = labBtnRow.add("button", undefined, "一括削除");
deleteMarkersBtn.alignment = ["fill", "center"];
deleteMarkersBtn.preferredSize.height = BUTTON_HEIGHT;

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

  labFile.open("r");
  var content = labFile.read();
  labFile.close();

  labFileEntries = parseLabPhonemeEntries(content);
  refreshPhonemeChecklist(); // baseline ＋ このファイルの音素(回数付き)で再構築

  try {
    tabLab.layout.layout(true);
    win.layout.layout(true);
    win.layout.resize();
  } catch (eW) {}
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
  for (var i = 0; i < phonemeCandidates.length; i++) {
    var cand = phonemeCandidates[i];
    if (cand.count <= 0 || !isPhonemeSelected(cand.phoneme)) continue;

    var times = cand.data && cand.data.times ? cand.data.times : [];
    for (var j = 0; j < times.length; j++) {
      selectedPhonemes.push({
        startTime: times[j].start,
        endTime: times[j].end,
        phoneme: cand.phoneme,
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
      cfgLabAutoClose,
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
        " layer(s).",
    );
  } else {
    alert("No markers found on selected layer(s).");
  }
};
