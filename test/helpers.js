// ════════════════════════════════════════════════════════════════
// テスト共通基盤: core/*.jsx の読み込みと AE モック
// ════════════════════════════════════════════════════════════════
// src/core/*.jsx は UI 非依存の関数宣言のみなので、Node の vm サンドボックスへ
// そのまま読み込める（05_open.jsx は UI 生成を含むため読み込まず、テストに
// 必要な定数・関数だけ HEAD でスタブする）。
// AE のエクスプレッションは「最後の文の値が結果」＝ vm.runInNewContext の
// 完了値セマンティクスと同じなので、生成された式を本物どおり評価できる。
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var SRC_DIR = path.join(__dirname, "..", "src");

var CORE_FILES = [
  "core/layers.jsx",
  "core/expressions.jsx",
  "core/markers.jsx",
  "core/emoset.jsx",
  "core/lab.jsx",
  "core/psd.jsx",
  "core/blink.jsx",
  "core/stage-model.jsx",
  "core/bake.jsx",
];

// 05_open.jsx 相当のスタブ（必要分のみ）
var HEAD = [
  'var LAB_MAP_SIGNATURE = "lab2layerPhonemeMap";',
  'var BLINK_SIGNATURE = "emoBlinkAuto";',
  'var SUBTITLE_SIGNATURE = "emoSubtitle2layer";',
  'var KeyframeInterpolationType = { HOLD: "HOLD" };',
  "var __compsByName = {};",
  "var __projectComps = [];",
  "function findCompByName(n) { return __compsByName[n] || null; }",
  "function getProjectComps() { return __projectComps; }",
  "function beginUndo() {}",
  "function endUndo() {}",
].join("\n") + "\n";

/** core/*.jsx を読み込んだ vm サンドボックスを返す */
function loadSandbox() {
  var code = CORE_FILES.map(function (f) {
    return fs.readFileSync(path.join(SRC_DIR, f), "utf8");
  }).join("\n");
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(HEAD + code, sandbox);
  return sandbox;
}

/** findCompByName / getProjectComps が返すコンポ群を登録する */
function registerComps(sandbox, comps) {
  sandbox.__compsByName = {};
  sandbox.__projectComps = [];
  for (var i = 0; i < comps.length; i++) {
    sandbox.__compsByName[comps[i].name] = comps[i];
    sandbox.__projectComps.push(comps[i]);
  }
}

// ── AE モック ────────────────────────────────────────────────────

// マーカー: スクリプト API（keyTime/keyValue）と式 API（nearestKey/key）の両対応
function makeMarker(markers) {
  return {
    numKeys: markers.length,
    keyTime: function (i) {
      return markers[i - 1].time;
    },
    keyValue: function (i) {
      return { comment: markers[i - 1].comment };
    },
    nearestKey: function (t) {
      var best = 1;
      var bestD = Infinity;
      for (var i = 0; i < markers.length; i++) {
        var d = Math.abs(markers[i].time - t);
        if (d < bestD) {
          bestD = d;
          best = i + 1;
        }
      }
      return { index: best };
    },
    key: function (i) {
      return { time: markers[i - 1].time, comment: markers[i - 1].comment };
    },
  };
}

function makeOpacityProp(expr) {
  return {
    expression: expr || "",
    expressionEnabled: true,
    numKeys: 0,
    _t: [],
    _v: [],
    _static: 100,
    removeKey: function (i) {
      this._t.splice(i - 1, 1);
      this._v.splice(i - 1, 1);
      this.numKeys--;
    },
    setValuesAtTimes: function (ts, vs) {
      this._t = ts.slice();
      this._v = vs.slice();
      this.numKeys = ts.length;
    },
    setInterpolationTypeAtKey: function () {},
    setValue: function (v) {
      this._static = v;
    },
  };
}

// opts: { inPoint, outPoint, markers: [{time, comment}], expression }
function makeLayer(name, opts) {
  opts = opts || {};
  var marker = makeMarker(opts.markers || []);
  return {
    name: name,
    enabled: true,
    inPoint: opts.inPoint !== undefined ? opts.inPoint : 0,
    outPoint: opts.outPoint !== undefined ? opts.outPoint : 1e9,
    marker: marker,
    property: function (n) {
      if (n === "Marker") return marker;
      throw new Error("unsupported property: " + n);
    },
    transform: { opacity: makeOpacityProp(opts.expression) },
  };
}

function makeComp(name, layers, duration) {
  var comp = {
    name: name,
    duration: duration,
    numLayers: layers.length,
    layer: function (ref) {
      if (typeof ref === "number") return layers[ref - 1];
      for (var i = 0; i < layers.length; i++) {
        if (layers[i].name === ref) return layers[i];
      }
      throw new Error("layer not found: " + ref);
    },
  };
  for (var i = 0; i < layers.length; i++) layers[i].containingComp = comp;
  return comp;
}

// ── 式評価 / KF 階段値 ──────────────────────────────────────────

/** 式をコンパイルし「時刻 t の評価値」を返す関数を作る */
function makeExprEvaluator(expr, comps, layerName) {
  var script = new vm.Script(expr);
  return function (t) {
    var ctx = {
      Math: Math,
      String: String,
      time: t,
      thisLayer: { name: layerName },
      comp: function (n) {
        if (comps[n]) return comps[n];
        throw new Error("comp not found: " + n);
      },
    };
    return script.runInNewContext(ctx);
  };
}

/** ベイク済みホールド KF の階段値（キー時刻ちょうどから適用＝AE と同じ厳密比較） */
function steppedValue(prop, t) {
  var v = prop._v.length > 0 ? prop._v[0] : prop._static;
  for (var i = 0; i < prop._t.length; i++) {
    if (prop._t[i] > t) break;
    v = prop._v[i];
  }
  return v;
}

/**
 * vm サンドボックス内で生成された値をホスト側のプレーンな値に変換する。
 * サンドボックスのオブジェクト/配列はプロトタイプが別レルムのため、
 * そのままだと assert.deepStrictEqual が一致とみなさない。
 */
function plain(v) {
  return JSON.parse(JSON.stringify(v));
}

module.exports = {
  loadSandbox: loadSandbox,
  plain: plain,
  registerComps: registerComps,
  makeMarker: makeMarker,
  makeOpacityProp: makeOpacityProp,
  makeLayer: makeLayer,
  makeComp: makeComp,
  makeExprEvaluator: makeExprEvaluator,
  steppedValue: steppedValue,
};
