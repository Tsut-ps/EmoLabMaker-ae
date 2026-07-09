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
  "function MarkerValue(comment) { this.comment = comment; }",
  // instanceof CompItem をモックで通す（__isComp フラグで判定）
  "var CompItem = function CompItem() {};",
  "Object.defineProperty(CompItem, Symbol.hasInstance, {",
  "  value: function (o) { return !!(o && o.__isComp); },",
  "});",
  // PSD 由来ルート判定（05_open.jsx 相当のスタブ。テストから __psdRootIds で指定）
  "var __psdRootIds = {};",
  "function hasPsdLayersFolder(c) { return !!(c && __psdRootIds[c.id]); }",
  // コンポ選択ダイアログ（ui/dialogs.jsx 相当のスタブ）。
  // 呼び出しを __promptCompCalls に記録し、__promptCompResult を返す
  "var __promptCompCalls = [];",
  "var __promptCompResult = null;",
  "function promptCompSelection(message, compNames, defaultName) {",
  "  __promptCompCalls.push({ message: message, compNames: compNames, defaultName: defaultName });",
  "  return __promptCompResult;",
  "}",
  // confirm（ExtendScript 組み込み相当のスタブ）
  "var __confirmCalls = [];",
  "var __confirmResult = true;",
  "function confirm(message) {",
  "  __confirmCalls.push(message);",
  "  return __confirmResult;",
  "}",
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

// マーカー: スクリプト API（keyTime/keyValue/setValueAtTime/removeKey）と
// 式 API（nearestKey/key）の両対応。書き込みは時刻昇順を維持（AE と同じ）
function makeMarker(markers) {
  return {
    numKeys: markers.length,
    keyTime: function (i) {
      return markers[i - 1].time;
    },
    keyValue: function (i) {
      return { comment: markers[i - 1].comment };
    },
    setValueAtTime: function (t, mv) {
      for (var i = 0; i < markers.length; i++) {
        if (Math.abs(markers[i].time - t) < 1e-9) {
          markers[i] = { time: t, comment: mv.comment }; // 同時刻は置換
          return;
        }
      }
      var k = 0;
      while (k < markers.length && markers[k].time <= t) k++;
      markers.splice(k, 0, { time: t, comment: mv.comment });
      this.numKeys = markers.length;
    },
    removeKey: function (i) {
      markers.splice(i - 1, 1);
      this.numKeys = markers.length;
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
  var ly = {
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
    moveAfter: function (target) {
      var c = ly.containingComp;
      if (c && c._removeLayer && c._insertAfter) {
        c._removeLayer(ly);
        c._insertAfter(ly, target);
      }
    },
    remove: function () {
      if (ly.containingComp && ly.containingComp._removeLayer) {
        ly.containingComp._removeLayer(ly);
      }
    },
  };
  return ly;
}

var compIdSeq = 1;

function makeComp(name, layers, duration) {
  var comp = {
    id: compIdSeq++,
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
    // レイヤーコレクション（createCtrlLayer 用）。addNull は最上位に積む（AE と同じ）
    layers: {
      addNull: function (dur) {
        var ly = makeLayer("ヌル " + (layers.length + 1), {
          inPoint: 0,
          outPoint: dur !== undefined ? dur : duration,
        });
        ly.nullLayer = true;
        ly.source = { name: ly.name };
        ly.containingComp = comp;
        layers.unshift(ly);
        comp.numLayers = layers.length;
        return ly;
      },
    },
    // モック内部用（copyToComp / remove の実装から使う）
    _insertTop: function (ly) {
      layers.unshift(ly);
      comp.numLayers = layers.length;
      ly.containingComp = comp;
    },
    _removeLayer: function (ly) {
      for (var r = 0; r < layers.length; r++) {
        if (layers[r] === ly) {
          layers.splice(r, 1);
          comp.numLayers = layers.length;
          return;
        }
      }
    },
    _insertAfter: function (ly, target) {
      for (var r = 0; r < layers.length; r++) {
        if (layers[r] === target) {
          layers.splice(r + 1, 0, ly);
          comp.numLayers = layers.length;
          ly.containingComp = comp;
          return;
        }
      }
      layers.push(ly);
      comp.numLayers = layers.length;
      ly.containingComp = comp;
    },
  };
  for (var i = 0; i < layers.length; i++) layers[i].containingComp = comp;
  comp.__isComp = true; // sandbox の instanceof CompItem を通す
  return comp;
}

/**
 * コンポを参照するフォルダレイヤー。AE の実挙動（PSD 由来のフォルダレイヤーは
 * 明示リネームされるまで名前がソースコンポ名に追従する）を再現する。
 */
function makeFolderLayer(sourceComp, opts) {
  opts = opts || {};
  var ly = makeLayer(sourceComp.name, opts);
  ly.source = sourceComp;
  var explicit = opts.explicitName !== undefined ? opts.explicitName : null;
  Object.defineProperty(ly, "name", {
    get: function () {
      return explicit !== null ? explicit : sourceComp.name;
    },
    set: function (v) {
      explicit = v; // 明示的に設定したら以後は追従しない（AE と同じ）
    },
    enumerable: true,
    configurable: true,
  });
  return ly;
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
  makeFolderLayer: makeFolderLayer,
  makeComp: makeComp,
  makeExprEvaluator: makeExprEvaluator,
  steppedValue: steppedValue,
};
