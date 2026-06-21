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
   * 口形マッピング式で使う。
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
  mouthMapPanel.alignment = ["fill", "top"];
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
  // 縦スクロール対応にし、追加/削除ボタンは常に下に残す(#C)。
  // 口パクは固定高さ + スクロールバー（リサイズ・追加で壊れないシンプル方式）。
  var MOUTH_SCROLL_H = 150;
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
      // クリップ枠の size は設定しない（preferredSize/maximumSize で固定済み。
      // 動的に size を設定するとリサイズ/追加で値が壊れるため）。幅だけ
      // ウィンドウ由来でスクロールバー位置に使う（画面外へ消えるのを防ぐ）。
      var pw = availWidthForPanel(mouthRowsClip, tabLab);
      var ph = MOUTH_SCROLL_H;
      var sbW = 14;
      var innerH = ph - m * 2;
      // 中身の高さは子要素の合計で測る（伸縮・頭打ちに影響されない）
      var contentH = contentHeightOf(mouthRowsGroup);
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

  // 1つの口形（行）に複数の口パクレイヤーが一致したとき、使う 1 枚を選ばせる。
  // （「<口パク1>,<口パク2>」のように 2 枚割り当てると口が二重表示になるため）
  // 戻り値: 選んだ layer / スキップ(割り当てない)なら null。
  function pickMouthLayerDialog(rowLabel, candidateLayers) {
    var dlg = new Window("dialog", "口パクレイヤーを選択");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 8;
    dlg.margins = 14;

    var msg = dlg.add(
      "statictext",
      undefined,
      "「" +
        rowLabel +
        "」に使う口パクレイヤーを 1 つ選んでください（2 つ割り当てると口が二重表示になります）。",
      { multiline: true }
    );
    msg.preferredSize = [340, 40];

    var listGroup = dlg.add("group");
    listGroup.orientation = "column";
    listGroup.alignChildren = ["fill", "top"];
    var dd = listGroup.add("dropdownlist");
    dd.alignment = ["fill", "top"];
    for (var i = 0; i < candidateLayers.length; i++) {
      dd.add("item", candidateLayers[i].name);
    }
    dd.selection = 0;

    var btnRow = dlg.add("group");
    btnRow.orientation = "row";
    btnRow.alignment = ["right", "top"];
    var skipBtn = btnRow.add("button", undefined, "割り当てない");
    var okBtn = btnRow.add("button", undefined, "割当", { name: "ok" });

    var result = { chosen: null };
    okBtn.onClick = function () {
      result.chosen =
        dd.selection !== null ? candidateLayers[dd.selection.index] : null;
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

    // 行（口形）ごとに、一致する口パクレイヤーを集める。閉じ口を先に処理して
    // 「閉」が母音より先にレイヤーを取れるようにする。
    var order = [];
    for (r = 0; r < mouthRows.length; r++) {
      if (mouthRows[r].closedCheck.value) order.push(mouthRows[r]);
    }
    for (r = 0; r < mouthRows.length; r++) {
      if (!mouthRows[r].closedCheck.value) order.push(mouthRows[r]);
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
        for (var m = 0; m < matches.length; m++) layersOnly.push(matches[m].layer);
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
    alert("現在のマッピングを取り込みました（" + groups.length + " 口形）。");
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

