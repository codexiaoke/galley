/**
 * 在沙箱里、作者的代码之前运行的一段 JavaScript：定义作者可以调用的函数。
 * 作者每调用一次会产生动作的函数（compare、swap、set、step……），这里就记下一帧：
 * 当前的数组 / 表格 / 网格、这一步的说明、调用发生在作者代码的第几行、变量面板的值。
 *
 * 行号的取法：在调用处生成一个错误对象，从调用栈里找第一个 algo.js 的位置。
 * 作者的代码以 algo.js 的名字运行，这里以 prelude.js 运行，所以第一个 algo.js 就是作者调用的那一行。
 *
 * 这段代码不能用模板字符串里的 ${}（外面是 TypeScript 的字符串），需要拼接时用 + 号。
 */
export const TRACE_PRELUDE = String.raw`
"use strict";
var __frames = [];
var __MAX = 800;
var __view = null;
var __vars = [];
var __legend = {};
var __TONES = ["compare", "swap", "active", "pivot", "sorted", "found", "dim", "visited", "frontier", "path"];

function __fail(msg) { throw new Error(msg); }
function __line() {
  var m = /algo\.js:(\d+)/.exec(new Error().stack || "");
  return m ? Number(m[1]) - 1 : undefined;
}
function __fmt(v) {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return v.length ? v.map(__fmt).join(" ") : "空";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function __value(v) { return typeof v === "number" ? v : __fmt(v); }
function __tone(t, fn) {
  if (t === null || t === undefined) return null;
  if (__TONES.indexOf(t) === -1) __fail(fn + "() 的状态只能是：" + __TONES.join("、") + "。");
  return t;
}
function __push(view, note, fallback) {
  if (__frames.length >= __MAX) __fail("演示超过了 " + __MAX + " 步。换一个小一点的输入，或者少记几步。");
  __frames.push({ view: view, note: note === undefined || note === null ? fallback : String(note), line: __line(), vars: __vars.slice() });
}

/* ---------- 数组 ---------- */
var __A = null;
function array(data, options) {
  if (__view) __fail("一段演示里只能有一个数组、表格或网格。");
  if (!Array.isArray(data)) __fail("array() 需要一个数组，例如 array([5, 2, 9])。");
  if (data.length === 0 || data.length > 40) __fail("array() 的数组要有 1 到 40 个元素。");
  __view = "array";
  var style = options && options.style;
  if (style !== undefined && style !== "bars" && style !== "boxes") __fail("array() 的 style 只能是 bars 或 boxes。");
  __A = {
    arr: data,
    ids: data.map(function (_, i) { return i; }),
    next: data.length,
    style: style || (data.every(function (v) { return typeof v === "number" && v >= 0; }) ? "bars" : "boxes"),
    marks: {},
    pointers: {},
    range: null,
    aux: null,
  };
  return data;
}
function __needArray(fn) { if (__view !== "array") __fail(fn + "() 要先用 array() 建一个数组。"); }
function __index(i, fn) {
  __needArray(fn);
  if (typeof i !== "number" || i % 1 !== 0 || i < 0 || i >= __A.arr.length) __fail(fn + "() 的下标 " + i + " 超出了数组范围（0 到 " + (__A.arr.length - 1) + "）。");
  return i;
}
function __syncIds() {
  while (__A.ids.length < __A.arr.length) __A.ids.push(__A.next++);
  if (__A.ids.length > __A.arr.length) __A.ids.length = __A.arr.length;
}
function __arrayView(temp) {
  __syncIds();
  var a = __A.arr;
  var view = {
    kind: "array",
    style: __A.style,
    items: a.map(function (v, i) { return { id: __A.ids[i], value: __value(v) }; }),
    tones: a.map(function (_, i) { return (temp && temp[i]) || __A.marks[i] || null; }),
    pointers: Object.keys(__A.pointers)
      .filter(function (k) { var i = __A.pointers[k]; return typeof i === "number" && i >= 0 && i < a.length; })
      .map(function (k) { return { name: k, index: __A.pointers[k] }; }),
  };
  if (__A.range) view.range = __A.range.slice();
  if (__A.aux) view.aux = { label: __A.aux.label, items: __A.aux.list.map(function (v, i) { return { id: i, value: __value(v) }; }) };
  return view;
}
function compare(i, j, note) {
  __index(i, "compare"); __index(j, "compare");
  var a = __A.arr, t = {};
  t[i] = "compare"; t[j] = "compare";
  __push(__arrayView(t), note, "比较 a[" + i + "] = " + __fmt(a[i]) + " 和 a[" + j + "] = " + __fmt(a[j]) + "。");
  return a[i] > a[j] ? 1 : a[i] < a[j] ? -1 : 0;
}
function swap(i, j, note) {
  __index(i, "swap"); __index(j, "swap"); __syncIds();
  var a = __A.arr, x = a[i], id = __A.ids[i], t = {};
  a[i] = a[j]; a[j] = x;
  __A.ids[i] = __A.ids[j]; __A.ids[j] = id;
  t[i] = "swap"; t[j] = "swap";
  __push(__arrayView(t), note, i === j ? "a[" + i + "] 不动。" : "交换 a[" + i + "] 和 a[" + j + "]。");
}
function set(i, value, note) {
  __index(i, "set");
  __A.arr[i] = value;
  var t = {}; t[i] = "active";
  __push(__arrayView(t), note, "a[" + i + "] = " + __fmt(value) + "。");
}
function focus(i, note) {
  __index(i, "focus");
  var t = {}; t[i] = "active";
  __push(__arrayView(t), note, "看 a[" + i + "] = " + __fmt(__A.arr[i]) + "。");
}
function mark(i, tone) {
  __needArray("mark");
  var list = Array.isArray(i) ? i : [i];
  var t = __tone(tone, "mark");
  list.forEach(function (k) { __index(k, "mark"); if (t) __A.marks[k] = t; else delete __A.marks[k]; });
}
function pointer(name, i) {
  __needArray("pointer");
  if (i === null || i === undefined) delete __A.pointers[name]; else __A.pointers[String(name)] = i;
}
function range(lo, hi) {
  __needArray("range");
  __A.range = lo === null || lo === undefined ? null : [lo, hi === undefined ? lo : hi];
}
function aux(label, list) {
  __needArray("aux");
  if (list === null || list === undefined) { __A.aux = null; return; }
  if (!Array.isArray(list)) __fail("aux() 的第二个参数要是一个数组，例如 aux(\"栈\", stack)。");
  __A.aux = { label: String(label), list: list };
}

/* ---------- 表格（动态规划） ---------- */
var __T = null;
function table(rows, cols, options) {
  if (__view) __fail("一段演示里只能有一个数组、表格或网格。");
  if (!(rows >= 1 && rows <= 16 && cols >= 1 && cols <= 16)) __fail("table(行数, 列数) 的行数和列数要在 1 到 16 之间。");
  __view = "table";
  options = options || {};
  var head = function (h, n) { var out = []; for (var k = 0; k < n; k++) out.push(h && h[k] !== undefined ? String(h[k]) : String(k)); return out; };
  __T = { rows: rows, cols: cols, cells: [], marks: {}, rowHead: head(options.rowHead, rows), colHead: head(options.colHead, cols) };
  for (var r = 0; r < rows; r++) { var line = []; for (var c = 0; c < cols; c++) line.push(null); __T.cells.push(line); }
  var cell = function (i, j, fn) {
    if (!(i >= 0 && i < rows && j >= 0 && j < cols && i % 1 === 0 && j % 1 === 0)) __fail(fn + " 的位置 (" + i + ", " + j + ") 超出了表格范围。");
  };
  var view = function (temp) {
    var tones = {};
    Object.keys(__T.marks).forEach(function (k) { tones[k] = __T.marks[k]; });
    Object.keys(temp || {}).forEach(function (k) { tones[k] = temp[k]; });
    return { kind: "table", rowHead: __T.rowHead, colHead: __T.colHead, cells: __T.cells.map(function (r) { return r.map(function (v) { return v === null || v === undefined ? null : __value(v); }); }), tones: tones };
  };
  __T.view = view;
  return {
    rows: rows,
    cols: cols,
    get: function (i, j) { cell(i, j, "get"); return __T.cells[i][j]; },
    set: function (i, j, value, opts) {
      cell(i, j, "set");
      opts = typeof opts === "string" ? { note: opts } : opts || {};
      __T.cells[i][j] = value;
      var temp = {};
      (opts.from || []).forEach(function (p) { cell(p[0], p[1], "set 的 from"); temp[p[0] + "," + p[1]] = "compare"; });
      temp[i + "," + j] = "active";
      __push(view(temp), opts.note, "填 (" + i + ", " + j + ") = " + __fmt(value) + "。");
    },
    mark: function (i, j, tone) {
      cell(i, j, "mark");
      var t = __tone(tone, "mark");
      if (t) __T.marks[i + "," + j] = t; else delete __T.marks[i + "," + j];
    },
    focus: function (i, j, note) {
      cell(i, j, "focus");
      var temp = {}; temp[i + "," + j] = "active";
      __push(view(temp), note, "看 (" + i + ", " + j + ")。");
    },
  };
}

/* ---------- 网格（迷宫） ---------- */
var __G = null;
function grid(lines) {
  if (__view) __fail("一段演示里只能有一个数组、表格或网格。");
  if (typeof lines === "string") lines = lines.split(/[\/\n]/);
  if (!Array.isArray(lines) || lines.length === 0) __fail("grid() 需要几行字符串，例如 grid([\"S..#\", \".#.E\"])。");
  var cols = lines[0].length;
  if (lines.some(function (l) { return typeof l !== "string" || l.length !== cols; })) __fail("grid() 每一行的长度要一样。");
  if (lines.length > 16 || cols > 30) __fail("grid() 最大 16 行、30 列。");
  __view = "grid";
  var cells = lines.join("").split("").map(function (c) { return c === "#" || c === "S" || c === "E" ? c : "."; });
  __G = { rows: lines.length, cols: cols, cells: cells };
  var at = function (r, c, fn) {
    if (!(r >= 0 && r < __G.rows && c >= 0 && c < cols && r % 1 === 0 && c % 1 === 0)) __fail(fn + " 的位置 (" + r + ", " + c + ") 超出了网格范围。");
    return r * cols + c;
  };
  var find = function (ch) { var k = cells.indexOf(ch); return k === -1 ? null : { r: Math.floor(k / cols), c: k % cols }; };
  var view = function (current) {
    var out = __G.cells.slice();
    if (current !== undefined && out[current] !== "S" && out[current] !== "E") out[current] = "c";
    return { kind: "grid", rows: __G.rows, cols: cols, cells: out.join("") };
  };
  __G.view = view;
  var paint = function (r, c, code, fn) { var k = at(r, c, fn); if (cells[k] !== "S" && cells[k] !== "E" && cells[k] !== "#") cells[k] = code; return k; };
  return {
    rows: __G.rows,
    cols: cols,
    start: find("S"),
    end: find("E"),
    isWall: function (r, c) { return r < 0 || c < 0 || r >= __G.rows || c >= cols || cells[r * cols + c] === "#"; },
    visit: function (r, c, note) { var k = paint(r, c, "v", "visit"); __push(view(k), note, "访问 (" + r + ", " + c + ")。"); },
    frontier: function (r, c) { paint(r, c, "f", "frontier"); },
    path: function (r, c, note) { paint(r, c, "p", "path"); if (note !== undefined) __push(view(), note, ""); },
    clear: function (r, c) { paint(r, c, ".", "clear"); },
  };
}

/* ---------- 通用 ---------- */
function step(note) {
  if (!__view) __fail("step() 之前要先用 array()、table() 或 grid() 建一个要演示的东西。");
  var view = __view === "array" ? __arrayView() : __view === "table" ? __T.view() : __G.view();
  __push(view, note, "");
}
function vars(obj) {
  if (obj === null || typeof obj !== "object") __fail("vars() 需要一个对象，例如 vars({ i, j })。");
  __vars = Object.keys(obj).map(function (k) { return [k, __fmt(obj[k])]; });
}
function legend(obj) {
  Object.keys(obj || {}).forEach(function (k) { __tone(k, "legend"); __legend[k] = String(obj[k]); });
}
function __finish() {
  if (!__view) __fail("代码里没有用 array()、table() 或 grid() 建要演示的东西。");
  if (__frames.length === 0) __fail("代码运行完了，但一步都没有记录。调用 compare()、swap()、set() 或 step() 来记录每一步。");
  return JSON.stringify({ frames: __frames, legend: __legend });
}
`;
