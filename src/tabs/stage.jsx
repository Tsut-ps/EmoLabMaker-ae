// ════════════════════════════════════════════════════════════════
//
//  タブ「立ち絵」: 統合パネル・階層表示
//
// ════════════════════════════════════════════════════════════════
// 立ち絵ルートコンポを選ぶと、ネストをたどって階層ツリーを組み、
// 各階層の選択肢を表示する（ラジオ=ボタン / 任意=チェックボックス）。
// クリックで「表示中集合」マーカーを制御コンポの現在時刻に書き込む。

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
stageRootDropdown.helpTip =
  "立ち絵のルートコンポ（セットアップタブで読み込んだコンポ）";

var stageRefreshBtn = stageTopRow.add("button", undefined, "↺");
stageRefreshBtn.preferredSize = [28, BUTTON_HEIGHT];
stageRefreshBtn.helpTip =
  "コンポ一覧・階層・現在状態を再取得（再生ヘッド移動後に押す）";

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
  "再生ヘッドを動かしたら →",
);
stageTreeHint.alignment = ["fill", "center"];
var stageRefreshBtn2 = stageTreeBarRow.add("button", undefined, "↺");
stageRefreshBtn2.preferredSize = [40, BUTTON_HEIGHT];
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

// 下部の状態表示はウィンドウ共通の statusText を使う（バージョンと同じ行）
var stageStatusText = statusText;

// ── 状態 ──
var stageNodes = [];
var stageCollapsed = {};
var stageCtrlComp = null;
var isRebuildingStage = false;
var stageScrollValue = 0;
var stageButtons = []; // 描画済み選択肢コントロール（追従の即時更新用）
var stageWarnings = []; // 「未選択」警告ラベル（{ctrl, node}）
var stageFlipState = ""; // グローバル反転状態（""=通常 / "flipx" / "flipy" / "flipxy"）

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

// ノードのヘッダ部にラベル（とフォルダ自身の表示コントロール）を出す。
//   ルート       → ただのラベル（statictext）
//   ! フォルダ   → グレーの☑（常時表示。cfgShowForced オフ時はラベルのみ）
//   * フォルダ   → ラジオ（親の排他グループの一員。クリックで親に書き込み）
//   無印フォルダ → チェックボックス（丸ごと表示/非表示。クリックで親に書き込み）
// 親側ではこのフォルダを選択肢として重複表示しない（emittedRefNames で除外済み）。
function renderStageHeader(head, node, soleWrappedRef) {
  var lblText = node.displayName;
  var parent = node.parent;
  var kind = null;
  // 実質ルート（立ち絵を包むだけの外側コンポの唯一の子）はチェックを出さない
  var isWrapperRoot = soleWrappedRef && node.refName === soleWrappedRef;
  // シーン直下に並ぶ独立立ち絵もトグルにしない（押すと誤登録で全体が壊れるため）
  if (
    !node.isRoot &&
    !isWrapperRoot &&
    !isIndependentStageRoot(node) &&
    node.refName &&
    parent
  ) {
    if (node.refForced) {
      kind = cfgShowForced ? "headerForced" : null;
    } else if (node.refExclusive) {
      kind = "headerRadio";
    } else {
      kind = "headerOpt";
    }
  }

  if (!kind) {
    var lbl = head.add("statictext", undefined, lblText);
    lbl.helpTip = node.comp.name;
    return;
  }

  var ctrl =
    kind === "headerRadio"
      ? head.add("radiobutton", undefined, lblText)
      : head.add("checkbox", undefined, lblText);
  ctrl.helpTip =
    node.refName + (kind === "headerForced" ? "（常に表示 !）" : "");
  var on = indexOfName(parent.visibleSet, node.refName) >= 0;
  ctrl.value = kind === "headerForced" ? true : on;
  stageButtons.push({ ctrl: ctrl, headerNode: node, kind: kind });

  if (kind === "headerForced") {
    ctrl.enabled = false;
    return;
  }
  ctrl.enabled = parent.active;
  ctrl.onClick = function () {
    if (!parent.ctrlComp) {
      setStageStatus("制御コンポが見つかりません。");
      return;
    }
    var time = parent.ctrlComp.time;
    beginUndo("emo2layer: 立ち絵 切替");
    try {
      ensureNodeRegistered(parent);
      if (kind === "headerRadio") {
        setRadioSelection(
          parent.ctrlComp,
          parent.comp.name,
          time,
          node.refName,
          collectRadioVariantNames(parent),
        );
      } else {
        toggleLayerInSet(parent.ctrlComp, parent.comp.name, time, node.refName);
      }
    } finally {
      endUndo();
    }
    setStageStatus(node.displayName);
    syncStageControls();
  };
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
        "階層が見つかりません。セットアップタブでセットアップしたコンポをルートに選んでください。",
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

    // 自分のノード（ヘッダ）を持つフォルダ参照の集合。これらは親の選択肢として
    // 重複表示せず、ヘッダ行の ☑/◉ に集約する（▼☑その他 の形）。
    var emittedRefNames = {};
    for (var en = 0; en < stageNodes.length; en++) {
      if (stageNodes[en].refName) {
        emittedRefNames[stageNodes[en].refName] = true;
      }
    }

    // 外側コンポをルートに選び、それが「立ち絵フォルダ1つを包むだけ」のとき、
    // 包まれた立ち絵ノードはツリーの実質ルート。全体トグルは不要なので
    // チェックボックスを出さずプレーンなヘッダにする（ルートにチェック不要）。
    var soleWrappedRef = null;
    for (var rn = 0; rn < stageNodes.length; rn++) {
      if (!stageNodes[rn].isRoot) continue;
      var rnode = stageNodes[rn];
      var total =
        rnode.radioChoices.length +
        rnode.optionalChoices.length +
        rnode.forcedChoices.length;
      if (total === 1) {
        var only =
          rnode.radioChoices[0] ||
          rnode.optionalChoices[0] ||
          rnode.forcedChoices[0];
        if (only && emittedRefNames[only.fullName]) {
          soleWrappedRef = only.fullName;
        }
      }
      break;
    }

    for (var n = 0; n < stageNodes.length; n++) {
      var node = stageNodes[n];
      // 祖先のいずれかが折りたたまれていれば隠す
      if (isCollapsedHidden(node)) continue;
      // 設定: 非アクティブ階層を隠す（グレーアウトの代わり）
      if (cfgHideInactive && !node.active) continue;

      var indent = node.depth * cfgIndentWidth;

      // 選択肢を radio→optional(→forced) の順にフラット化。ただしヘッダを持つ
      // 子フォルダ（emittedRefNames）は親の選択肢として出さない（ヘッダに集約）。
      var items = [];
      var rr;
      for (rr = 0; rr < node.radioChoices.length; rr++) {
        if (emittedRefNames[node.radioChoices[rr].fullName]) continue;
        items.push({ ch: node.radioChoices[rr], kind: "radio" });
      }
      for (rr = 0; rr < node.optionalChoices.length; rr++) {
        if (emittedRefNames[node.optionalChoices[rr].fullName]) continue;
        items.push({ ch: node.optionalChoices[rr], kind: "opt" });
      }
      if (cfgShowForced) {
        for (rr = 0; rr < node.forcedChoices.length; rr++) {
          if (emittedRefNames[node.forcedChoices[rr].fullName]) continue;
          items.push({ ch: node.forcedChoices[rr], kind: "forced" });
        }
      }

      // ルート（外側コンポ含む）が、フォルダ参照しか持たず自前のリーフ選択肢が
      // 無ければ「（ルート）」行ごと省略（各パートは自分のヘッダに ☑/◉ で出る）。
      if (node.isRoot && items.length === 0) {
        continue;
      }

      // 1ノード = ヘッダ行（インデント+トグル+自身の☑/◉+ラベル）+ 折り返した選択肢行
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
      // 折りたたみ対象: 子コンポを持つ階層、または自身が選択肢を持つ階層
      var collapsible = node.hasChildren || items.length > 0;
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
          })(node.comp.id),
        );
      } else {
        var sp2 = head.add("group");
        sp2.preferredSize = [14, 1];
      }

      // 非ルートのフォルダ参照は、ヘッダ自体を ☑(無印)/◉(*)/グレー☑(!) にして
      // ラベルと一体化する（▼☑その他）。親側の重複選択肢は出していない。
      renderStageHeader(head, node, soleWrappedRef);

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

      var choiceIndent = indent + 26;
      // 折り返し幅。安全マージンは小さめにして横幅を有効活用する
      var avail = availBase - choiceIndent - 8;
      if (avail < 80) avail = 80;
      var curRow = null;
      var curW = 0;
      for (var ci = 0; ci < items.length; ci++) {
        // ラジオ=radiobutton / 任意=checkbox / 強制=無効checkbox。幅で折返し
        var hasFlips = items[ci].ch.flips && items[ci].ch.flips.length > 0;
        // 反転中はラベルにグリフを付けて状態を見せる
        var curSuffix =
          items[ci].kind === "forced"
            ? null
            : choiceVisibleSuffix(items[ci].ch, node.visibleSet);
        var dispLabel =
          items[ci].ch.label + (curSuffix ? " " + flipGlyph(curSuffix) : "");
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
                  collectRadioVariantNames(nd),
                );
              } else {
                // 任意: 表示中なら全バリエーションOFF、非表示なら chosen をON
                var curSet = readVisibleSet(nd.ctrlComp, nd.comp.name, time);
                if (choiceIsVisible(it.ch, curSet)) {
                  removeNamesFromSet(
                    nd.ctrlComp,
                    nd.comp.name,
                    time,
                    choiceAllNames(it.ch),
                  );
                } else {
                  setRadioSelection(
                    nd.ctrlComp,
                    nd.comp.name,
                    time,
                    chosen,
                    choiceAllNames(it.ch),
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

    // 作り直し時は中身とパネルをレイアウトしてから配置する。
    // （リサイズ時はここを通らず、軽量に applyStageScroll で再フィットする）
    stageGrid.layout.layout(true);
    stageGridPanel.layout.layout(true);
    applyStageScroll(stageScrollValue);
  } finally {
    isRebuildingStage = false;
  }
}

// パネルの実寸を返す。リサイズ直後は size が古いことがあるため bounds を優先。
function panelActualSize(p, defW, defH) {
  var w = 0;
  var h = 0;
  try {
    if (p.bounds) {
      w = p.bounds.width;
      h = p.bounds.height;
    }
  } catch (eB) {}
  if (!w || !h) {
    try {
      if (p.size) {
        w = p.size.width;
        h = p.size.height;
      }
    } catch (eS) {}
  }
  if (!w) w = defW;
  if (!h) h = defH;
  return [w, h];
}
// 中身グループの「本来の高さ」を返す。子要素の高さを合計して求める。
// size はパネルに引き伸ばされ、preferredSize は上限で頭打ちになることがあり、
// どちらも当てにならない。子の合計なら伸縮・頭打ちの影響を受けず正確。
function contentHeightOf(grp) {
  var h = 0;
  var n = 0;
  try {
    var kids = grp.children;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      var vis = true;
      try {
        vis = c.visible !== false;
      } catch (eV) {}
      if (!vis) continue;
      var ch = 0;
      try {
        ch = c.size ? c.size.height : 0;
      } catch (eC) {}
      h += ch;
      n++;
    }
    if (n > 1) h += (n - 1) * (grp.spacing || 0);
  } catch (e) {}
  // フォールバック（子から測れない場合）
  if (!h) {
    try {
      h = grp.preferredSize ? grp.preferredSize.height : 0;
    } catch (e2) {}
    if (!h) {
      try {
        h = grp.size ? grp.size.height : 0;
      } catch (e3) {}
    }
  }
  return h;
}
function stageGridContentHeight() {
  return contentHeightOf(stageGrid);
}

// スクロールパネルが使える高さを「ウィンドウ高さ − 他要素の高さ」で算出する。
// パネル自身の size/bounds はリサイズに追従しないことがあるため、固定高さの
// 兄弟要素（ヘッダ行・ボタン行など）を引いて求める方が確実（ユーザー案）。
function availHeightForPanel(panel, topTab) {
  var avail = 0;
  try {
    avail = win.size ? win.size.height : 0;
  } catch (eW) {}
  if (!avail) avail = 560;
  // ウィンドウ枠のオーバーヘッド（マージン + 下部バー(状態+版) + タブバー）
  try {
    avail -= (win.margins.top || 0) + (win.margins.bottom || 0);
  } catch (eM) {}
  try {
    if (statusRow && statusRow.visible && statusRow.size) {
      avail -= statusRow.size.height;
    }
  } catch (eV) {}
  avail -= 28; // タブバー（tabbedpanel のタブ見出し）+ 下要素との安全余白
  // panel から topTab まで遡り、各階層で「自分以外の兄弟＋spacing＋margins」を引く。
  // 非表示の兄弟はレイアウト上の場所を取らないので引かない（高さ不足の原因）。
  var node = panel;
  var guard = 0;
  while (node && node !== topTab && guard < 20) {
    guard++;
    var parent = node.parent;
    if (!parent) break;
    var sib = 0;
    var visKids = 0;
    var kids = parent.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] === node) continue;
      var vis = true;
      try {
        vis = kids[i].visible !== false;
      } catch (eVi) {}
      if (!vis) continue;
      visKids++;
      var h = 0;
      try {
        h = kids[i].size ? kids[i].size.height : 0;
      } catch (eK) {}
      sib += h;
    }
    sib += visKids * (parent.spacing || 0); // panel と各兄弟の間の spacing
    try {
      sib += (parent.margins.top || 0) + (parent.margins.bottom || 0);
    } catch (eP) {}
    avail -= sib;
    node = parent;
  }
  if (avail < 80) avail = 80;
  return avail;
}

// スクロールパネルが使える幅を「ウィンドウ幅 − 左右マージン」で算出する。
// パネル幅を直接読むとリサイズに追従せずスクロールバーが画面外へ消える
// （= 壊れて見える）ため、ウィンドウ幅から求める。横方向は段積みの兄弟が
// 無い前提（全幅パネル）なので、各階層のマージンだけ引く。
function availWidthForPanel(panel, topTab) {
  var avail = 0;
  try {
    avail = win.size ? win.size.width : 0;
  } catch (eW) {}
  if (!avail) avail = 460;
  try {
    avail -= (win.margins.left || 0) + (win.margins.right || 0);
  } catch (eM) {}
  avail -= 6; // tabbedpanel の左右枠 概算
  var node = panel;
  var guard = 0;
  while (node && node !== topTab && guard < 20) {
    guard++;
    var parent = node.parent;
    if (!parent) break;
    try {
      avail -= (parent.margins.left || 0) + (parent.margins.right || 0);
    } catch (eP) {}
    node = parent;
  }
  if (avail < 60) avail = 60;
  return avail;
}

// ツリーのスクロール: 中身(stageGrid)を上下に動かし、パネルでクリップする。
function applyStageScroll(value) {
  try {
    var m = getPanelMarginOf(stageGridPanel);
    // 幅・高さともウィンドウから算出する（パネル自身の size を読んで設定すると
    // フィードバックで値が壊れていくため、ウィンドウ由来の値だけを使う）。
    var pw = availWidthForPanel(stageGridPanel, tabStage);
    var ph = availHeightForPanel(stageGridPanel, tabStage);
    try {
      stageGridPanel.size = [pw, ph];
    } catch (ePh) {}
    var sbW = 14;
    var innerH = ph - m * 2;
    // 中身の高さは preferredSize（=コンテンツ本来の高さ）で測る。size はパネルに
    // 引き伸ばされて実際のコンテンツ量と一致しないことがあり、スクロールバーが
    // 出ない/壊れる原因になる（ウィンドウ高さ変更時に顕著）。
    var contentH = stageGridContentHeight();
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

    // 中身をコンテンツ高さに固定する（パネルに引き伸ばされると下端が描画されず、
    // スクロールしても見えない＝壊れて見える）。幅はスクロールバー分を確保。
    var innerW = pw - m * 2 - (maxv > 0 ? sbW : 0);
    if (innerW < 20) innerW = 20;
    try {
      stageGrid.size = [innerW, contentH];
    } catch (eSz) {}
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
  // 親リンクを先に確定しておき、制御コンポを「自前→祖先から継承→全体既定」の
  // 順で解決する。これでシーンに複数の立ち絵があっても、各立ち絵の中身は
  // それぞれ自分の制御コンポに紐づく（1体目の制御に巻き込まれない）。
  assignStageParents(stageNodes);
  for (i = 0; i < stageNodes.length; i++) {
    var nd = stageNodes[i];
    // ルート直下に置かれた選択肢は「立ち絵全体の切替」。立ち絵名そのままだと
    // 階層ヘッダと紛らわしいので（ルート）と明示する(#ルート対応)
    nd.displayName = nd.isRoot
      ? "（ルート）"
      : stageDisplayName(nd.comp.name, prefixCandidates);
    var ownCtrl = nd.ctrlCompName ? findCompByName(nd.ctrlCompName) : null;
    if (ownCtrl) {
      nd.ctrlComp = ownCtrl;
    } else if (nd.parent && nd.parent.ctrlComp) {
      nd.ctrlComp = nd.parent.ctrlComp; // 祖先の立ち絵の制御を継承
    } else {
      nd.ctrlComp = stageCtrlComp;
    }
    nd.visibleSet = nd.ctrlComp
      ? readVisibleSet(nd.ctrlComp, nd.comp.name, nd.ctrlComp.time)
      : [];
  }
  computeStageActive(stageNodes);
}

// 構造（prefix・表示名・親子・制御コンポ）は変えず、時刻依存の状態だけ再解決する
// 軽量版。再生ヘッド追従やクリック後の同期は構造が不変なので、prefix 計算
// （detectDominantPrefix など）や displayName の作り直しを省いてマーカー読みだけ行う。
// 事前に一度 resolveStageState（フル）が走っていること（ctrlComp/parent が設定済み）が前提。
function resolveStageVisibleState() {
  for (var i = 0; i < stageNodes.length; i++) {
    var nd = stageNodes[i];
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
  resolveStageVisibleState();
  for (var i = 0; i < stageButtons.length; i++) {
    var e = stageButtons[i];
    try {
      if (e.kind === "forced" || e.kind === "headerForced") continue;
      if (e.kind === "headerRadio" || e.kind === "headerOpt") {
        // ヘッダのフォルダ参照コントロール: 親の visibleSet で状態を更新
        var hp = e.headerNode.parent;
        e.ctrl.value = hp
          ? indexOfName(hp.visibleSet, e.headerNode.refName) >= 0
          : false;
        e.ctrl.enabled = hp ? hp.active : true;
        continue;
      }
      e.ctrl.value = choiceIsVisible(e.ch, e.node.visibleSet);
      e.ctrl.enabled = e.node.active;
    } catch (err) {}
  }
  for (var w = 0; w < stageWarnings.length; w++) {
    try {
      stageWarnings[w].ctrl.visible = isRadioGroupUnselected(
        stageWarnings[w].node,
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
          set.join(","),
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
    stageSetDropdown.selection ? stageSetDropdown.selection.text : null,
  );

  if (!rootComp) setStageStatus("立ち絵ルートコンポを選択してください。");
}

stageRefreshBtn.onClick = function () {
  refreshStage(true);
  setStageStatus("一覧を更新しました。");
};

stageRefreshBtn2.onClick = function () {
  refreshStage(false);
  setStageStatus("現在の再生ヘッド位置の状態を取り込みました。");
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
    "表情セット「" +
      setName +
      "」を保存しました（" +
      entries.length +
      " グループ）。",
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
    "表情セット「" +
      setName +
      "」を適用しました（" +
      result.applied +
      " グループ）。",
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
