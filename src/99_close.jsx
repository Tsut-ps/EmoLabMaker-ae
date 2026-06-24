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
})();

if (win instanceof Window) {
  win.center();
  win.show();
} else {
  win.layout.layout(true);
}

// ウィンドウが実体化してサイズが確定してから、スクロール枠を測り直す
// （init 時点では win.size が未確定で、口パク枠などが初期表示で崩れるため）。
try {
  refreshStage(false);
  refreshMouthScroll();
} catch (eInit) {}
