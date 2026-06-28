// リサイズ対応
win.onResizing = win.onResize = function () {
  this.layout.resize();
  if (tabs.selection === tabStage) {
    // リサイズ時は作り直さず、中身を測り直してスクロールを再フィットするだけ。
    // パネル自体を layout(true) すると中身高さへ伸縮してスクロールバーが壊れる。
    try {
      stageGrid.layout.layout(true);
    } catch (eS) {}
    applyStageScroll(stageScrollValue);
  } else if (tabs.selection === tabLab) {
    try {
      mouthRowsGroup.layout.layout(true);
    } catch (eM) {}
    applyMouthScroll(mouthRowsScrollValue);
  }
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
  // パネルがアクティブになった時点ではウィンドウ幅が確定しているので、
  // 口パクの口形スクロールを測り直す（タブ表示直後に幅が遅れて出ない対策）。
  try {
    if (tabs.selection === tabLab) refreshMouthScroll();
  } catch (e2) {}
};

// ════════════════════════════════════════════════════════════════
// 初期化
// ════════════════════════════════════════════════════════════════

(function init() {
  var activeComp = getActiveComp();
  var name = activeComp ? activeComp.name : null;
  rebuildPsdDropdown(psdRootRow.dropdown, name);
  rebuildPsdDropdown(psdCtrlRow.dropdown, name, collectCtrlCandidates());
  rebuildStageRootDropdown(name);
  refreshStage(false);
  refreshPhonemeChecklist(); // 一般音素(baseline)を最初から表示
  refreshMouthScroll();
  refreshMouthCoverage();
  // 初期表示はセットアップタブなので、共通の下部ステータスもその案内にする
  // （refreshStage が立ち絵向けの文言を入れた後に上書き）
  statusText.text = "PSD のルートコンポを選択してください。";
})();

if (win instanceof Window) {
  win.center();
  win.show();
} else {
  win.layout.layout(true);
}

// ウィンドウが実体化してサイズが確定してから、スクロール枠を測り直す
// （init 時点では win.size が未確定で、口パク枠などが初期表示で崩れるため）。
// 立ち絵ツリーは init で構築済みなので、ここでは正しい幅での再描画＋スクロール
// 再フィット（rebuildStageTree）だけ行う。buildStageNodes の再走査・全マーカー
// 読み直し（refreshStage）はしない（起動時のツリー走査・読み込みを1回で済ます）。
try {
  rebuildStageTree();
  refreshMouthScroll();
} catch (eInit) {}
