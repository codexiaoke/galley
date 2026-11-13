/**
 * 在沙箱里、作者的代码之前运行的一段 JavaScript：定义作者可以调用的函数。
 * 作者每调用一次会产生动作的函数（compare、swap、set、focus、visit、step……），这里就记下一帧：
 * 所有已经建好的结构（数组、表格、网格、图、树）当时的样子、这一步的说明、
 * 调用发生在作者代码的第几行、变量面板的值。
 *
 * 一段演示里可以同时有几种结构（每种最多一个），按建立的先后从上往下排；
 * 产生这一帧的那个结构上会标出临时的状态（比如正在比较的两个位置）。
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
var __structs = [];
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
function __int(v) { return typeof v === "number" && v % 1 === 0; }
function __register(kind, views) {
  if (__structs.some(function (s) { return s.kind === kind; })) __fail("一段演示里每种结构只能建一个（这里建了两个 " + kind + "）。");
  if (__structs.length >= 3) __fail("一段演示里最多同时显示 3 个结构。");
  var s = { kind: kind, views: views };
  __structs.push(s);
  return s;
}
/** 记一帧。owner 是产生这一帧的结构，temp 是只在这一帧标出的状态。 */
function __push(owner, temp, note, fallback) {
  if (__frames.length >= __MAX) __fail("演示超过了 " + __MAX + " 步。换一个小一点的输入，或者少记几步。");
  var views = [];
  __structs.forEach(function (s) { views = views.concat(s.views(s === owner ? temp : null)); });
  __frames.push({ view: views[0], extra: views.length > 1 ? views.slice(1) : undefined, note: note === undefined || note === null ? fallback : String(note), line: __line(), vars: __vars.slice() });
}

/* ---------- 数组 ---------- */
var __A = null;
function array(data, options) {
  if (!Array.isArray(data)) __fail("array() 需要一个数组，例如 array([5, 2, 9])。");
  if (data.length === 0 || data.length > 40) __fail("array() 的数组要有 1 到 40 个元素。");
  options = options || {};
  var style = options.style;
  if (style !== undefined && style !== "bars" && style !== "boxes") __fail("array() 的 style 只能是 bars 或 boxes。");
  __A = {
    arr: data,
    ids: data.map(function (_, i) { return i; }),
    next: data.length,
    style: style || (data.every(function (v) { return typeof v === "number" && v >= 0; }) ? "bars" : "boxes"),
    heap: !!options.heap,
    marks: {},
    pointers: {},
    range: null,
    aux: null,
  };
  __A.struct = __register("array", function (temp) {
    var v = __arrayView(temp);
    return __A.heap ? [v, { kind: "heap", items: v.items, tones: v.tones, range: v.range }] : [v];
  });
  return data;
}
function __needArray(fn) { if (!__A) __fail(fn + "() 要先用 array() 建一个数组。"); }
function __index(i, fn) {
  __needArray(fn);
  if (!__int(i) || i < 0 || i >= __A.arr.length) __fail(fn + "() 的下标 " + i + " 超出了数组范围（0 到 " + (__A.arr.length - 1) + "）。");
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
      .filter(function (k) { var i = __A.pointers[k]; return __int(i) && i >= 0 && i < a.length; })
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
  __push(__A.struct, t, note, "比较 a[" + i + "] = " + __fmt(a[i]) + " 和 a[" + j + "] = " + __fmt(a[j]) + "。");
  return a[i] > a[j] ? 1 : a[i] < a[j] ? -1 : 0;
}
function swap(i, j, note) {
  __index(i, "swap"); __index(j, "swap"); __syncIds();
  var a = __A.arr, x = a[i], id = __A.ids[i], t = {};
  a[i] = a[j]; a[j] = x;
  __A.ids[i] = __A.ids[j]; __A.ids[j] = id;
  t[i] = "swap"; t[j] = "swap";
  __push(__A.struct, t, note, i === j ? "a[" + i + "] 不动。" : "交换 a[" + i + "] 和 a[" + j + "]。");
}
function set(i, value, note) {
  __index(i, "set");
  __A.arr[i] = value;
  var t = {}; t[i] = "active";
  __push(__A.struct, t, note, "a[" + i + "] = " + __fmt(value) + "。");
}
function focus(i, note) {
  __index(i, "focus");
  var t = {}; t[i] = "active";
  __push(__A.struct, t, note, "看 a[" + i + "] = " + __fmt(__A.arr[i]) + "。");
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
function table(rows, cols, options) {
  if (!(rows >= 1 && rows <= 16 && cols >= 1 && cols <= 16)) __fail("table(行数, 列数) 的行数和列数要在 1 到 16 之间。");
  options = options || {};
  var head = function (h, n) { var out = []; for (var k = 0; k < n; k++) out.push(h && h[k] !== undefined ? String(h[k]) : String(k)); return out; };
  var T = { cells: [], marks: {}, rowHead: head(options.rowHead, rows), colHead: head(options.colHead, cols) };
  for (var r = 0; r < rows; r++) { var line = []; for (var c = 0; c < cols; c++) line.push(null); T.cells.push(line); }
  var cell = function (i, j, fn) {
    if (!(__int(i) && __int(j) && i >= 0 && i < rows && j >= 0 && j < cols)) __fail(fn + " 的位置 (" + i + ", " + j + ") 超出了表格范围。");
  };
  var struct = __register("table", function (temp) {
    var tones = {};
    Object.keys(T.marks).forEach(function (k) { tones[k] = T.marks[k]; });
    Object.keys(temp || {}).forEach(function (k) { tones[k] = temp[k]; });
    return [{ kind: "table", rowHead: T.rowHead, colHead: T.colHead, cells: T.cells.map(function (r) { return r.map(function (v) { return v === null || v === undefined ? null : __value(v); }); }), tones: tones }];
  });
  return {
    rows: rows,
    cols: cols,
    get: function (i, j) { cell(i, j, "get"); return T.cells[i][j]; },
    set: function (i, j, value, opts) {
      cell(i, j, "set");
      opts = typeof opts === "string" ? { note: opts } : opts || {};
      T.cells[i][j] = value;
      var temp = {};
      (opts.from || []).forEach(function (p) { cell(p[0], p[1], "set 的 from"); temp[p[0] + "," + p[1]] = "compare"; });
      temp[i + "," + j] = "active";
      __push(struct, temp, opts.note, "填 (" + i + ", " + j + ") = " + __fmt(value) + "。");
    },
    mark: function (i, j, tone) {
      cell(i, j, "mark");
      var t = __tone(tone, "mark");
      if (t) T.marks[i + "," + j] = t; else delete T.marks[i + "," + j];
    },
    focus: function (i, j, note) {
      cell(i, j, "focus");
      var temp = {}; temp[i + "," + j] = "active";
      __push(struct, temp, note, "看 (" + i + ", " + j + ")。");
    },
  };
}

/* ---------- 网格（迷宫） ---------- */
function grid(lines) {
  if (typeof lines === "string") lines = lines.split(/[\/\n]/);
  if (!Array.isArray(lines) || lines.length === 0) __fail("grid() 需要几行字符串，例如 grid([\"S..#\", \".#.E\"])。");
  var cols = lines[0].length;
  if (lines.some(function (l) { return typeof l !== "string" || l.length !== cols; })) __fail("grid() 每一行的长度要一样。");
  if (lines.length > 16 || cols > 30) __fail("grid() 最大 16 行、30 列。");
  var rows = lines.length;
  var cells = lines.join("").split("").map(function (c) { return c === "#" || c === "S" || c === "E" ? c : "."; });
  var at = function (r, c, fn) {
    if (!(__int(r) && __int(c) && r >= 0 && r < rows && c >= 0 && c < cols)) __fail(fn + " 的位置 (" + r + ", " + c + ") 超出了网格范围。");
    return r * cols + c;
  };
  var find = function (ch) { var k = cells.indexOf(ch); return k === -1 ? null : { r: Math.floor(k / cols), c: k % cols }; };
  var struct = __register("grid", function (current) {
    var out = cells.slice();
    if (typeof current === "number" && out[current] !== "S" && out[current] !== "E") out[current] = "c";
    return [{ kind: "grid", rows: rows, cols: cols, cells: out.join("") }];
  });
  var paint = function (r, c, code, fn) { var k = at(r, c, fn); if (cells[k] !== "S" && cells[k] !== "E" && cells[k] !== "#") cells[k] = code; return k; };
  return {
    rows: rows,
    cols: cols,
    start: find("S"),
    end: find("E"),
    isWall: function (r, c) { return r < 0 || c < 0 || r >= rows || c >= cols || cells[r * cols + c] === "#"; },
    visit: function (r, c, note) { var k = paint(r, c, "v", "visit"); __push(struct, k, note, "访问 (" + r + ", " + c + ")。"); },
    frontier: function (r, c) { paint(r, c, "f", "frontier"); },
    path: function (r, c, note) { paint(r, c, "p", "path"); if (note !== undefined) __push(struct, null, note, ""); },
    clear: function (r, c) { paint(r, c, ".", "clear"); },
  };
}

/* ---------- 图 ---------- */
function graph(spec, options) {
  options = options || {};
  var names = [], edges = [];
  var node = function (name) { name = String(name); var i = names.indexOf(name); if (i === -1) i = names.push(name) - 1; return i; };
  if (typeof spec === "string") {
    spec.split(/[,，]/).map(function (p) { return p.trim(); }).filter(Boolean).forEach(function (part) {
      var m = /^([^\s\->:]{1,6})\s*(-|>)\s*([^\s\->:]{1,6})\s*(?::\s*(-?\d+(?:\.\d+)?))?$/.exec(part);
      if (m) edges.push({ from: node(m[1]), to: node(m[3]), weight: m[4] === undefined ? undefined : Number(m[4]), directed: m[2] === ">" });
      else if (/^[^\s\->:]{1,6}$/.test(part)) node(part);
      else __fail("graph() 看不懂 \"" + part + "\"。边写成 \"A-B\"（无向）或 \"A>B\"（有向），带权重写成 \"A-B:4\"；节点名最多 6 个字符。");
    });
  } else if (spec && Array.isArray(spec.edges)) {
    (spec.nodes || []).forEach(node);
    spec.edges.forEach(function (e) { edges.push({ from: node(e[0]), to: node(e[1]), weight: e[2], directed: !!options.directed }); });
  } else __fail("graph() 需要边的列表，例如 graph(\"A-B:4, B-C:2\")。");
  if (names.length < 2 || names.length > 12) __fail("graph() 要有 2 到 12 个节点。");
  var n = names.length;
  var pos = names.map(function (_, i) { var a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) }; });
  var nodeTone = {}, edgeTone = {}, labels = {};
  var id = function (name, fn) { var i = names.indexOf(String(name)); if (i === -1) __fail(fn + "() 里的节点 " + name + " 不在图里。"); return i; };
  var edgeOf = function (a, b, fn) {
    var x = id(a, fn), y = id(b, fn);
    for (var k = 0; k < edges.length; k++) {
      var e = edges[k];
      if ((e.from === x && e.to === y) || (!e.directed && e.from === y && e.to === x)) return k;
    }
    __fail(fn + "() 里没有从 " + a + " 到 " + b + " 的边。");
  };
  var struct = __register("graph", function (temp) {
    temp = temp || { nodes: {}, edges: {} };
    return [{
      kind: "graph",
      nodes: names.map(function (name, i) { return { name: name, x: pos[i].x, y: pos[i].y, tone: temp.nodes[i] || nodeTone[i] || null, label: labels[i] }; }),
      edges: edges.map(function (e, k) { return { from: e.from, to: e.to, weight: e.weight, directed: e.directed, tone: temp.edges[k] || edgeTone[k] || null }; }),
    }];
  });
  return {
    nodes: names.slice(),
    edges: edges.map(function (e) { return { from: names[e.from], to: names[e.to], weight: e.weight }; }),
    neighbors: function (name) {
      var i = id(name, "neighbors"), out = [];
      edges.forEach(function (e) {
        if (e.from === i) out.push({ node: names[e.to], weight: e.weight });
        else if (!e.directed && e.to === i) out.push({ node: names[e.from], weight: e.weight });
      });
      return out;
    },
    weight: function (a, b) { return edges[edgeOf(a, b, "weight")].weight; },
    mark: function (name, tone) { var i = id(name, "mark"), t = __tone(tone, "mark"); if (t) nodeTone[i] = t; else delete nodeTone[i]; },
    markEdge: function (a, b, tone) { var k = edgeOf(a, b, "markEdge"), t = __tone(tone, "markEdge"); if (t) edgeTone[k] = t; else delete edgeTone[k]; },
    label: function (name, text) { var i = id(name, "label"); if (text === null || text === undefined) delete labels[i]; else labels[i] = __fmt(text); },
    focus: function (name, note) { var t = { nodes: {}, edges: {} }; t.nodes[id(name, "focus")] = "active"; __push(struct, t, note, "看节点 " + name + "。"); },
    visit: function (name, note) {
      var i = id(name, "visit"), t = { nodes: {}, edges: {} };
      t.nodes[i] = "active"; nodeTone[i] = "visited";
      __push(struct, t, note, "访问 " + name + "。");
    },
    focusEdge: function (a, b, note) {
      var t = { nodes: {}, edges: {} };
      t.edges[edgeOf(a, b, "focusEdge")] = "compare"; t.nodes[id(a, "focusEdge")] = "active"; t.nodes[id(b, "focusEdge")] = "compare";
      __push(struct, t, note, "看 " + a + " 到 " + b + " 这条边。");
    },
  };
}

/* ---------- 二叉树 ---------- */
function tree(levelOrder) {
  var nodes = []; // { value, left, right, parent }
  var add = function (value, parent, side) {
    var k = nodes.push({ value: value, left: null, right: null, parent: parent }) - 1;
    if (parent !== null) nodes[parent][side] = k;
    return k;
  };
  levelOrder = levelOrder || [];
  if (!Array.isArray(levelOrder)) __fail("tree() 需要一个按层排列的数组，空位写 null，例如 tree([5, 3, 8, null, 4])。");
  if (levelOrder.length && levelOrder[0] !== null) {
    var slots = [add(levelOrder[0], null, null)];
    for (var q = 0, k = 1; k < levelOrder.length; q++) {
      if (q >= slots.length) break;
      var p = slots[q];
      if (p === undefined) continue; // 空位没有孩子（和力扣上的写法一样）
      ["left", "right"].forEach(function (side) {
        if (k < levelOrder.length) { var v = levelOrder[k++]; slots.push(v === null ? undefined : add(v, p, side)); }
      });
    }
  }
  var tones = {}, output = null;
  var check = function (i, fn) { if (!__int(i) || i < 0 || i >= nodes.length) __fail(fn + "() 的节点编号 " + i + " 不存在。"); return i; };
  var struct = __register("tree", function (temp) {
    temp = temp || {};
    var order = [], depth = {};
    var walk = function (i, d) { if (i === null) return; depth[i] = d; walk(nodes[i].left, d + 1); order.push(i); walk(nodes[i].right, d + 1); };
    if (nodes.length) walk(0, 0);
    var maxDepth = Math.max(0, Math.max.apply(null, Object.keys(depth).map(function (k) { return depth[k]; })));
    var toneOf = function (i) { return temp[i] || tones[i] || null; };
    var view = {
      kind: "tree",
      nodes: order.map(function (i, k) { return { id: i, value: __value(nodes[i].value), x: ((k + 0.5) / order.length) * 100, y: maxDepth === 0 ? 50 : 12 + (depth[i] / maxDepth) * 76, tone: toneOf(i) }; }),
      edges: order.filter(function (i) { return nodes[i].parent !== null; }).map(function (i) { var p = nodes[i].parent; return { from: p, to: i, tone: toneOf(i) && toneOf(p) ? toneOf(i) : null }; }),
    };
    if (output) view.output = { label: output.label, items: output.list.map(__value) };
    return [view];
  });
  return {
    get root() { return nodes.length ? 0 : null; },
    get size() { return nodes.length; },
    value: function (i) { return nodes[check(i, "value")].value; },
    left: function (i) { return nodes[check(i, "left")].left; },
    right: function (i) { return nodes[check(i, "right")].right; },
    parent: function (i) { return nodes[check(i, "parent")].parent; },
    add: function (parent, side, value, note) {
      if (parent === null && nodes.length === 0) { var r = add(value, null, null); if (note !== undefined) { var t0 = {}; t0[r] = "found"; __push(struct, t0, note, ""); } return r; }
      check(parent, "add");
      if (side !== "left" && side !== "right") __fail("add() 的第二个参数要写 \"left\" 或 \"right\"。");
      if (nodes[parent][side] !== null) __fail("节点 " + parent + " 的 " + side + " 已经有孩子了。");
      var k = add(value, parent, side);
      var t = {}; t[k] = "found";
      __push(struct, t, note, "在 " + __fmt(nodes[parent].value) + " 的" + (side === "left" ? "左" : "右") + "边加上 " + __fmt(value) + "。");
      return k;
    },
    set: function (i, value, note) { check(i, "set"); nodes[i].value = value; var t = {}; t[i] = "active"; __push(struct, t, note, "改成 " + __fmt(value) + "。"); },
    mark: function (i, tone) { check(i, "mark"); var t = __tone(tone, "mark"); if (t) tones[i] = t; else delete tones[i]; },
    focus: function (i, note) { check(i, "focus"); var t = {}; t[i] = "active"; __push(struct, t, note, "看 " + __fmt(nodes[i].value) + "。"); },
    visit: function (i, note) { check(i, "visit"); var t = {}; t[i] = "active"; tones[i] = "visited"; __push(struct, t, note, "访问 " + __fmt(nodes[i].value) + "。"); },
    output: function (label, list) {
      if (list === null || list === undefined) { output = null; return; }
      if (!Array.isArray(list)) __fail("output() 的第二个参数要是一个数组。");
      output = { label: String(label), list: list };
    },
  };
}

/* ---------- 通用 ---------- */
function step(note) {
  if (!__structs.length) __fail("step() 之前要先用 array()、table()、grid()、graph() 或 tree() 建一个要演示的东西。");
  __push(null, null, note, "");
}
function vars(obj) {
  if (obj === null || typeof obj !== "object") __fail("vars() 需要一个对象，例如 vars({ i, j })。");
  __vars = Object.keys(obj).map(function (k) { return [k, __fmt(obj[k])]; });
}
function legend(obj) {
  Object.keys(obj || {}).forEach(function (k) { __tone(k, "legend"); __legend[k] = String(obj[k]); });
}
function __finish() {
  if (!__structs.length) __fail("代码里没有用 array()、table()、grid()、graph() 或 tree() 建要演示的东西。");
  if (__frames.length === 0) __fail("代码运行完了，但一步都没有记录。调用 compare()、swap()、set()、focus()、visit() 或 step() 来记录每一步。");
  return JSON.stringify({ frames: __frames, legend: __legend });
}
`;
