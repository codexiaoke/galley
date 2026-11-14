/**
 * 在沙箱里、作者的场景代码之前运行的一段 JavaScript：定义作者可以调用的函数。
 *
 * 作者的代码做两件事：
 * 1. 摆东西：box、circle、text、code、frame、arrow、line 各建一个东西，返回它的"把手"；
 * 2. 写步骤：step(讲解, () => { show(a); move(b, { x: 300 }); send(link) })。
 *
 * 这里不画任何东西，只记账：每个东西一开始的属性，以及每一步里
 * "谁的哪个属性、在这一步的第几毫秒、用多久、变成多少"。最后 __finish() 把账本交出去。
 *
 * 一步里的动作默认一个接一个（后一个在前一个快结束时开始，看起来是连贯的）；
 * 写在 together(() => { ... }) 里的动作同时开始。
 *
 * 写在第一个 step 之前的动作不是动画，而是直接改一开始的样子（比如先 show 出底图）。
 *
 * W、H（舞台的宽高）在这段代码之前由 run.ts 设好。
 * 这段代码不能用模板字符串里的 ${}（外面是 TypeScript 的字符串），需要拼接时用 + 号。
 */
export const SCENE_PRELUDE = String.raw`
"use strict";
var __LIMITS = { nodes: 80, steps: 24, tweens: 400, codeLines: 16 };
var __COLORS = ["ink", "soft", "faint", "accent", "paper", "raised", "sunken", "rule", "code", "c1", "c2", "c3", "c4", "c5", "none"];
var __EASES = ["out", "in", "inOut", "linear", "back"];
var __nodes = [];
var __byId = {};
var __handles = {};
var __state = {};
var __base = {};
var __dimmed = {};
var __steps = [];
var __cur = null;
var __t = 0;
var __group = null;
var __seq = 0;

function __fail(msg) { throw new Error(msg); }
function __isNode(v) { return v instanceof __Node; }
function __plain(v) { return v !== null && typeof v === "object" && !Array.isArray(v) && !__isNode(v); }
function __num(v, name, fn) {
  if (typeof v !== "number" || !isFinite(v)) __fail(fn + "() 的 " + name + " 要是一个数字。");
  return v;
}
function __known(o, allowed, fn) {
  Object.keys(o).forEach(function (k) {
    if (allowed.indexOf(k) === -1) __fail(fn + "() 不认识「" + k + "」这个选项，可以用的有：" + allowed.join("、") + "。");
  });
}
function __color(v, fn) {
  var m = typeof v === "string" ? /^([a-z0-9]+)(?:\/(\d{1,3}))?$/.exec(v) : null;
  if (!m || __COLORS.indexOf(m[1]) === -1 || (m[2] !== undefined && Number(m[2]) > 100)) {
    __fail(fn + "() 的颜色只能用这些名字：" + __COLORS.join("、") + "；后面可以加 /数字 表示浓度，例如 \"accent/15\"。这样换主题、换深色模式时画面才跟着变。");
  }
  return v;
}
function __ease(v, fallback, fn) {
  if (v === undefined) return fallback;
  if (__EASES.indexOf(v) === -1) __fail(fn + "() 的 ease 只能是：" + __EASES.join("、") + "。");
  return v;
}
/** 估一段文字有多宽：汉字算一个字宽，字母数字算半个多一点 */
function __measure(str, size) {
  var widest = 0;
  String(str).split("\n").forEach(function (line) {
    var w = 0;
    for (var i = 0; i < line.length; i++) {
      var c = line.charCodeAt(i);
      w += c > 0x2e7f ? 1 : c === 32 ? 0.3 : c >= 65 && c <= 90 ? 0.68 : 0.56;
    }
    if (w > widest) widest = w;
  });
  return widest * size;
}

/* ---------- 把手：作者拿到的是它，可以读位置和大小 ---------- */
function __Node(id, kind) { this.id = id; this.kind = kind; }
function __half(n) {
  var s = __state[n.id];
  if (n.kind === "link" || n.kind === "camera") __fail("连线没有自己的位置和大小，它跟着两端走。");
  if (n.kind === "circle" || n.kind === "packet") return { w: s.r, h: s.r };
  return { w: s.w / 2, h: s.h / 2 };
}
["x", "y", "w", "h", "r"].forEach(function (k) {
  Object.defineProperty(__Node.prototype, k, { get: function () { return __state[this.id][k]; } });
});
Object.defineProperty(__Node.prototype, "left", { get: function () { return this.x - __half(this).w; } });
Object.defineProperty(__Node.prototype, "right", { get: function () { return this.x + __half(this).w; } });
Object.defineProperty(__Node.prototype, "top", { get: function () { return this.y - __half(this).h; } });
Object.defineProperty(__Node.prototype, "bottom", { get: function () { return this.y + __half(this).h; } });

function __add(kind, props, extra) {
  // 沿着连线走的小圆点（send）单独算：它们是一次性的，不占画面上东西的名额
  var same = __nodes.filter(function (r) { return (r.kind === "packet") === (kind === "packet"); }).length;
  if (kind === "packet" && same >= __LIMITS.nodes * 3) __fail("send() 用得太多了（超过 " + __LIMITS.nodes * 3 + " 次）。");
  if (kind !== "packet" && same >= __LIMITS.nodes) __fail("画面上的东西太多了（超过 " + __LIMITS.nodes + " 个）。一个场景只讲一件事，拆成两个场景。");
  var id = kind.charAt(0) + (++__seq);
  var rec = { id: id, kind: kind, props: props };
  if (extra) Object.keys(extra).forEach(function (k) { rec[k] = extra[k]; });
  __nodes.push(rec);
  __byId[id] = rec;
  __state[id] = Object.assign({}, props);
  __base[id] = { fill: props.fill, stroke: props.stroke, color: props.color };
  return (__handles[id] = new __Node(id, kind));
}

/** tone：一个名字同时定下边框、底色、文字的颜色 */
function __tone(kind, t) {
  if (kind === "box" || kind === "circle") return { stroke: t, fill: t + "/14" };
  if (kind === "frame" || kind === "link") return { stroke: t, color: t };
  if (kind === "text") return { color: t };
  if (kind === "packet") return { fill: t };
  return { stroke: t };
}
function __paint(p, kind, o, fn) {
  if (o.tone !== undefined) {
    __color(o.tone, fn);
    if (o.tone.indexOf("/") !== -1) __fail(fn + "() 的 tone 写颜色的名字就行，不要带 /数字。");
    Object.assign(p, __tone(kind, o.tone));
  }
  ["fill", "stroke", "color"].forEach(function (k) { if (o[k] !== undefined) p[k] = __color(o[k], fn); });
}
function __ref(v, fn, name) {
  if (!__isNode(v) || v.kind === "link") __fail(fn + "() 的 " + name + " 要是画面上的一个东西（不能是连线）。");
  return v;
}
function __position(p, hw, hh, o, fn) {
  if (o.rightOf) { var a = __ref(o.rightOf, fn, "rightOf"); p.x = a.right + (o.gap === undefined ? 56 : o.gap) + hw; p.y = a.y; }
  if (o.leftOf) { var b = __ref(o.leftOf, fn, "leftOf"); p.x = b.left - (o.gap === undefined ? 56 : o.gap) - hw; p.y = b.y; }
  if (o.below) { var c = __ref(o.below, fn, "below"); p.x = c.x; p.y = c.bottom + (o.gap === undefined ? 36 : o.gap) + hh; }
  if (o.above) { var d = __ref(o.above, fn, "above"); p.x = d.x; p.y = d.top - (o.gap === undefined ? 36 : o.gap) - hh; }
  if (o.x !== undefined) p.x = __num(o.x, "x", fn);
  if (o.y !== undefined) p.y = __num(o.y, "y", fn);
}
var __PLACE = ["x", "y", "rightOf", "leftOf", "above", "below", "gap"];
var __PAINT = ["tone", "fill", "stroke", "color"];
function __shape(kind, extra) {
  return Object.assign({ x: W / 2, y: H / 2, opacity: 0, scale: 1, rotate: 0, ox: 0, oy: 0 }, extra);
}

/* ---------- 摆东西 ---------- */
function box(label, o) {
  o = o || {};
  __known(o, __PLACE.concat(__PAINT, ["w", "h", "sub", "size", "radius", "dashed"]), "box");
  var size = o.size === undefined ? 15 : __num(o.size, "size", "box");
  var sub = o.sub === undefined ? "" : String(o.sub);
  var w = o.w === undefined ? Math.max(88, Math.ceil(Math.max(__measure(label, size), __measure(sub, size * 0.78))) + 36) : __num(o.w, "w", "box");
  var h = o.h === undefined ? (sub ? 62 : 46) : __num(o.h, "h", "box");
  var p = __shape("box", { w: w, h: h, radius: o.radius === undefined ? 10 : __num(o.radius, "radius", "box"), text: String(label), sub: sub, size: size, fill: "raised", stroke: "ink", color: "ink", dashed: o.dashed ? 1 : 0 });
  __paint(p, "box", o, "box");
  __position(p, w / 2, h / 2, o, "box");
  return __add("box", p);
}
function circle(label, o) {
  o = o || {};
  __known(o, __PLACE.concat(__PAINT, ["r", "size", "dashed"]), "circle");
  var size = o.size === undefined ? 14 : __num(o.size, "size", "circle");
  var r = o.r === undefined ? Math.max(24, Math.ceil(__measure(label, size) / 2) + 12) : __num(o.r, "r", "circle");
  var p = __shape("circle", { r: r, text: String(label === undefined ? "" : label), size: size, fill: "raised", stroke: "ink", color: "ink", dashed: o.dashed ? 1 : 0 });
  __paint(p, "circle", o, "circle");
  __position(p, r, r, o, "circle");
  return __add("circle", p);
}
function text(str, o) {
  o = o || {};
  __known(o, __PLACE.concat(["tone", "color", "size", "bold", "mono", "align"]), "text");
  var size = o.size === undefined ? 15 : __num(o.size, "size", "text");
  if (o.align !== undefined && ["start", "middle", "end"].indexOf(o.align) === -1) __fail("text() 的 align 只能是 start、middle、end。");
  var lines = String(str).split("\n").length;
  var w = Math.ceil(__measure(str, size)), h = Math.ceil(size * 1.5 * lines);
  var p = __shape("text", { w: w, h: h, text: String(str), size: size, color: "ink", bold: o.bold ? 1 : 0, mono: o.mono ? 1 : 0, align: o.align || "middle" });
  __paint(p, "text", o, "text");
  __position(p, w / 2, h / 2, o, "text");
  return __add("text", p);
}
function code(src, o) {
  o = o || {};
  __known(o, __PLACE.concat(["w", "size", "stroke", "tone", "lines"]), "code");
  var size = o.size === undefined ? 13 : __num(o.size, "size", "code");
  var rows = String(src).split("\n");
  if (rows.length > __LIMITS.codeLines) __fail("code() 最多 " + __LIMITS.codeLines + " 行。场景里的代码只放讲到的那几行。");
  var longest = rows.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
  var w = o.w === undefined ? Math.max(120, Math.ceil(longest * size * 0.62) + 32) : __num(o.w, "w", "code");
  var h = Math.ceil(rows.length * size * 1.7) + 20;
  var p = __shape("code", { w: w, h: h, text: String(src), size: size, lines: __lines(o.lines, "code"), fill: "code", stroke: "rule", color: "ink" });
  __paint(p, "code", o, "code");
  __position(p, w / 2, h / 2, o, "code");
  return __add("code", p);
}
/** 一圈虚线框，标题在左上角：表示边界（一个进程、一个沙箱、一台服务器） */
function frame(title, o) {
  o = o || {};
  __known(o, __PLACE.concat(__PAINT, ["w", "h", "around", "pad", "radius", "dashed", "size"]), "frame");
  var p = __shape("frame", { w: 200, h: 120, radius: o.radius === undefined ? 14 : __num(o.radius, "radius", "frame"), text: String(title === undefined ? "" : title), size: o.size === undefined ? 12 : __num(o.size, "size", "frame"), fill: "none", stroke: "faint", color: "soft", dashed: o.dashed === false ? 0 : 1 });
  if (o.around !== undefined) {
    var list = Array.isArray(o.around) ? o.around : [o.around];
    if (!list.length) __fail("frame() 的 around 里要有东西。");
    var pad = o.pad === undefined ? 22 : __num(o.pad, "pad", "frame");
    var l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    list.forEach(function (n) { __ref(n, "frame", "around"); l = Math.min(l, n.left); r = Math.max(r, n.right); t = Math.min(t, n.top); b = Math.max(b, n.bottom); });
    var top = t - pad - (p.text ? 18 : 0);
    p.w = r - l + pad * 2; p.h = b + pad - top; p.x = (l + r) / 2; p.y = (top + b + pad) / 2;
  }
  if (o.w !== undefined) p.w = __num(o.w, "w", "frame");
  if (o.h !== undefined) p.h = __num(o.h, "h", "frame");
  __paint(p, "frame", o, "frame");
  __position(p, p.w / 2, p.h / 2, o, "frame");
  return __add("frame", p);
}
function __end(v, fn) {
  if (__isNode(v)) {
    if (v.kind === "link" || v.kind === "camera") __fail(fn + "() 的两端不能是另一条连线。");
    return v.id;
  }
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number" && isFinite(v[0]) && isFinite(v[1])) return [v[0], v[1]];
  __fail(fn + "() 的两端要是画面上的东西，或者一个点 [x, y]。");
}
function __link(a, b, o, head, fn) {
  o = o || {};
  __known(o, ["label", "bend", "dashed", "width", "both", "tone", "stroke", "color", "size"], fn);
  var p = { opacity: 0, draw: 0, bend: o.bend === undefined ? 0 : __num(o.bend, "bend", fn), text: o.label === undefined ? "" : String(o.label), width: o.width === undefined ? 1.6 : __num(o.width, "width", fn), size: o.size === undefined ? 12 : __num(o.size, "size", fn), stroke: "soft", color: "soft", dashed: o.dashed ? 1 : 0, head: o.both ? "both" : head };
  __paint(p, "link", o, fn);
  return __add("link", p, { from: __end(a, fn), to: __end(b, fn) });
}
function arrow(a, b, o) { return __link(a, b, o, "end", "arrow"); }
function line(a, b, o) { return __link(a, b, o, "none", "line"); }

var __camera = __add("camera", { x: W / 2, y: H / 2, zoom: 1 });

/* ---------- 时间 ---------- */
function __tw(n, prop, to, at, dur, ease) {
  var id = n.id;
  if (!__cur) {
    if (__steps.length) __fail("第一个 step 之后，动作都要写在 step(讲解, () => { ... }) 的函数里面。");
    __byId[id].props[prop] = to;
    __state[id][prop] = to;
    return;
  }
  if (__cur.tweens.length >= __LIMITS.tweens) __fail("这一步里的动作太多了（超过 " + __LIMITS.tweens + " 个）。把这一步拆成两步。");
  __cur.tweens.push({ id: id, prop: prop, to: to, at: Math.max(0, Math.round(at)), dur: Math.max(0, Math.round(dur)), ease: ease || "out" });
  __state[id][prop] = to;
}
function __at(o, fn) { return __t + (o.delay === undefined ? 0 : __num(o.delay, "delay", fn)); }
function __dur(o, fallback, fn) { return o.dur === undefined ? fallback : Math.max(0, __num(o.dur, "dur", fn)); }
/** 一个动作记完之后：end 是它结束的时间，next 是下一个动作可以开始的时间 */
function __done(end, next) {
  if (!__cur) return;
  if (end > __cur.end) __cur.end = end;
  if (__group) { if (next > __group.next) __group.next = next; }
  else if (next > __t) __t = next;
}
function __args(args, fn) {
  var list = Array.prototype.slice.call(args);
  var opts = {};
  if (list.length && __plain(list[list.length - 1])) opts = list.pop();
  var els = [];
  (function walk(a) { a.forEach(function (v) { if (Array.isArray(v)) walk(v); else els.push(v); }); })(list);
  els.forEach(function (v) { if (!__isNode(v)) __fail(fn + "() 的参数要是画面上的东西（box、arrow 这些函数返回的值）。"); });
  return { els: els, opts: opts };
}

function step(note, fn) {
  if (__cur) __fail("step 不能写在另一个 step 里面。");
  if (typeof note !== "string" || !note.trim()) __fail("step() 的第一个参数是这一步的讲解（一句话），第二个是这一步里的动作：step(\"主线程把代码发过去。\", () => { ... })。");
  if (fn !== undefined && typeof fn !== "function") __fail("step() 的第二个参数要是一个函数：step(讲解, () => { ... })。");
  if (__steps.length >= __LIMITS.steps) __fail("步骤太多了（超过 " + __LIMITS.steps + " 步）。一个场景只讲一件事，拆成两个场景。");
  __cur = { text: note.trim(), tweens: [], end: 0 };
  __t = 0;
  __group = null;
  try { if (fn) fn(); }
  finally { var s = __cur; __cur = null; __group = null; }
  __steps.push({ text: s.text, tweens: s.tweens, duration: Math.max(300, Math.round(s.end)) });
}
/** 里面的动作同时开始 */
function together(fn) {
  if (typeof fn !== "function") __fail("together() 的参数要是一个函数：together(() => { show(a); move(b, { x: 300 }) })。");
  var g = { next: __t, prev: __group };
  __group = g;
  try { fn(); }
  finally { __group = g.prev; }
  if (__group) { if (g.next > __group.next) __group.next = g.next; }
  else if (g.next > __t) __t = g.next;
}
function wait(ms) {
  __num(ms, "时长", "wait");
  if (!__cur) return;
  __done(__t + ms, __t + ms);
}

/* ---------- 动作 ---------- */
var __ENTER = { rise: { oy: 14 }, drop: { oy: -14 }, left: { ox: -28 }, right: { ox: 28 }, pop: { scale: 0.7 }, fade: {} };

function show() {
  var a = __args(arguments, "show"), o = a.opts;
  __known(o, ["from", "dur", "delay", "stagger", "ease"], "show");
  var from = o.from === undefined ? "rise" : o.from;
  var enter = __ENTER[from];
  if (!enter) __fail("show() 的 from 只能是：" + Object.keys(__ENTER).join("、") + "。");
  var dur = __dur(o, 520, "show"), at0 = __at(o, "show");
  var stagger = o.stagger === undefined ? 70 : __num(o.stagger, "stagger", "show");
  var end = at0;
  a.els.forEach(function (n, i) {
    var at = at0 + i * stagger, s = __state[n.id];
    if (n.kind === "link") {
      __tw(n, "opacity", 1, at, Math.min(160, dur));
      __tw(n, "draw", 1, at, dur, __ease(o.ease, "inOut", "show"));
    } else {
      if (enter.ox) { __tw(n, "ox", enter.ox, at, 0); __tw(n, "ox", 0, at, dur, __ease(o.ease, "out", "show")); }
      if (enter.oy) { __tw(n, "oy", enter.oy, at, 0); __tw(n, "oy", 0, at, dur, __ease(o.ease, "out", "show")); }
      if (enter.scale) { var sc = s.scale; __tw(n, "scale", sc * enter.scale, at, 0); __tw(n, "scale", sc, at, dur, __ease(o.ease, "back", "show")); }
      __tw(n, "opacity", 1, at, dur * 0.8);
    }
    delete __dimmed[n.id];
    end = Math.max(end, at + dur);
  });
  __done(end, at0 + Math.max(0, a.els.length - 1) * stagger + dur * 0.6);
}
function hide() {
  var a = __args(arguments, "hide"), o = a.opts;
  __known(o, ["dur", "delay"], "hide");
  var dur = __dur(o, 320, "hide"), at = __at(o, "hide");
  a.els.forEach(function (n) {
    __tw(n, "opacity", 0, at, dur);
    if (n.kind === "link") __tw(n, "draw", 0, at + dur, 0);
    delete __dimmed[n.id];
  });
  __done(at + dur, at + dur * 0.6);
}
function __moveAll(list, o, fn) {
  var dur = __dur(o, 650, fn), at = __at(o, fn), ease = __ease(o.ease, "inOut", fn);
  list.forEach(function (m) {
    if (m[1] !== undefined) __tw(m[0], "x", m[1], at, dur, ease);
    if (m[2] !== undefined) __tw(m[0], "y", m[2], at, dur, ease);
  });
  __done(at + dur, at + dur * 0.6);
}
function move(target, pos, o) {
  var els = Array.isArray(target) ? target : [target];
  o = o || {};
  if (!__plain(pos)) __fail("move() 的第二个参数是去哪儿：{ x, y } 是绝对位置，{ dx, dy } 是挪多少。");
  __known(pos, ["x", "y", "dx", "dy"], "move");
  __known(o, ["dur", "delay", "ease"], "move");
  __moveAll(els.map(function (n) {
    __ref(n, "move", "第一个参数");
    var x = pos.x !== undefined ? __num(pos.x, "x", "move") : pos.dx !== undefined ? n.x + __num(pos.dx, "dx", "move") : undefined;
    var y = pos.y !== undefined ? __num(pos.y, "y", "move") : pos.dy !== undefined ? n.y + __num(pos.dy, "dy", "move") : undefined;
    return [n, x, y];
  }), o, "move");
}
function __lines(v, fn) {
  if (v === undefined || v === null || v === "") return "";
  var list = Array.isArray(v) ? v : [v];
  list.forEach(function (n) { if (typeof n !== "number" || n % 1 !== 0 || n < 1) __fail(fn + "() 的 lines 写行号（从 1 开始），例如 [2, 3]。"); });
  return list.join(",");
}
var __SETTABLE = {
  box: ["x", "y", "w", "h", "radius", "opacity", "scale", "rotate", "size", "fill", "stroke", "color", "text", "sub"],
  circle: ["x", "y", "r", "opacity", "scale", "rotate", "size", "fill", "stroke", "color", "text"],
  text: ["x", "y", "opacity", "scale", "rotate", "size", "color", "text"],
  code: ["x", "y", "opacity", "scale", "stroke", "text", "lines"],
  frame: ["x", "y", "w", "h", "radius", "opacity", "fill", "stroke", "color", "text"],
  link: ["opacity", "bend", "width", "stroke", "color", "text", "draw"],
};
function set(target, props, o) {
  var els = Array.isArray(target) ? target : [target];
  o = o || {};
  if (!__plain(props)) __fail("set() 的第二个参数是要改的属性：set(a, { fill: \"accent/15\", text: \"新的文字\" })。");
  __known(o, ["dur", "delay", "ease"], "set");
  var dur = __dur(o, 420, "set"), at = __at(o, "set"), ease = __ease(o.ease, "out", "set");
  els.forEach(function (n) {
    if (!__isNode(n) || n.kind === "camera" || n.kind === "packet") __fail("set() 的第一个参数要是画面上的东西。");
    var change = {};
    Object.keys(props).forEach(function (k) {
      if (k === "tone") { __color(props.tone, "set"); Object.assign(change, __tone(n.kind, props.tone)); return; }
      if (k === "label" && n.kind === "link") { change.text = props.label; return; }
      if (__SETTABLE[n.kind].indexOf(k) === -1) __fail("set() 不能改" + n.kind + "的「" + k + "」，可以改的有：" + __SETTABLE[n.kind].concat("tone").join("、") + "。");
      change[k] = props[k];
    });
    Object.keys(change).forEach(function (k) {
      var v = change[k];
      if (k === "fill" || k === "stroke" || k === "color") v = __color(v, "set");
      else if (k === "text" || k === "sub") v = String(v);
      else if (k === "lines") v = __lines(v, "set");
      else v = __num(v, k, "set");
      __tw(n, k, v, at, dur, ease);
    });
  });
  __done(at + dur, at + dur * 0.6);
}
/** 文字一个字一个字打出来 */
function type(n, str, o) {
  o = o || {};
  __known(o, ["dur", "delay"], "type");
  if (!__isNode(n) || ["box", "circle", "text", "code"].indexOf(n.kind) === -1) __fail("type() 的第一个参数要是方块、圆、文字或代码。");
  str = String(str);
  var dur = __dur(o, Math.min(2600, Math.max(320, str.length * 45)), "type"), at = __at(o, "type");
  __tw(n, "text", str, at, dur, "type");
  __done(at + dur, at + dur);
}
function __pulse(n, at) {
  if (n.kind === "link") return;
  var sc = __state[n.id].scale;
  __tw(n, "scale", sc * 1.07, at, 170, "out");
  __tw(n, "scale", sc, at + 170, 280, "inOut");
}
function pulse() {
  var a = __args(arguments, "pulse");
  __known(a.opts, ["delay"], "pulse");
  var at = __at(a.opts, "pulse");
  a.els.forEach(function (n) { __pulse(n, at); });
  __done(at + 450, at + 300);
}
/** 标出来：换成强调色，轻轻跳一下 */
function highlight() {
  var a = __args(arguments, "highlight"), o = a.opts;
  __known(o, ["tone", "delay", "dur"], "highlight");
  var tone = o.tone === undefined ? "accent" : __color(o.tone, "highlight");
  var dur = __dur(o, 360, "highlight"), at = __at(o, "highlight");
  a.els.forEach(function (n) {
    var t = __tone(n.kind, tone);
    Object.keys(t).forEach(function (k) { __tw(n, k, t[k], at, dur); });
    if (n.kind === "link") __tw(n, "width", 2.4, at, dur);
    __pulse(n, at);
  });
  __done(at + Math.max(dur, 450), at + dur * 0.6);
}
/** 恢复成建出来时的颜色 */
function reset() {
  var a = __args(arguments, "reset"), o = a.opts;
  __known(o, ["delay", "dur"], "reset");
  var dur = __dur(o, 360, "reset"), at = __at(o, "reset");
  a.els.forEach(function (n) {
    var base = __base[n.id];
    ["fill", "stroke", "color"].forEach(function (k) { if (base[k] !== undefined && __state[n.id][k] !== base[k]) __tw(n, k, base[k], at, dur); });
    if (n.kind === "link" && __state[n.id].width !== __byId[n.id].props.width) __tw(n, "width", __byId[n.id].props.width, at, dur);
  });
  __done(at + dur, at + dur * 0.6);
}
function dim() {
  var a = __args(arguments, "dim"), o = a.opts;
  __known(o, ["delay", "dur"], "dim");
  var dur = __dur(o, 360, "dim"), at = __at(o, "dim");
  a.els.forEach(function (n) { __tw(n, "opacity", 0.22, at, dur); __dimmed[n.id] = true; });
  __done(at + dur, at + dur * 0.6);
}
function undim() {
  var a = __args(arguments, "undim"), o = a.opts;
  __known(o, ["delay", "dur"], "undim");
  var dur = __dur(o, 360, "undim"), at = __at(o, "undim");
  a.els.forEach(function (n) { __tw(n, "opacity", 1, at, dur); delete __dimmed[n.id]; });
  __done(at + dur, at + dur * 0.6);
}
/** 只看这几个：其余已经出现的东西都淡下去。不给参数时全部恢复 */
function focus() {
  var a = __args(arguments, "focus"), o = a.opts;
  __known(o, ["delay", "dur"], "focus");
  var dur = __dur(o, 360, "focus"), at = __at(o, "focus");
  var keep = {};
  a.els.forEach(function (n) { keep[n.id] = true; });
  __nodes.forEach(function (rec) {
    if (rec.kind === "camera" || rec.kind === "packet") return;
    var n = __handles[rec.id];
    if (a.els.length && !keep[rec.id]) {
      if (__state[rec.id].opacity > 0.5) { __tw(n, "opacity", 0.22, at, dur); __dimmed[rec.id] = true; }
    } else if (__dimmed[rec.id]) {
      __tw(n, "opacity", 1, at, dur);
      delete __dimmed[rec.id];
    }
  });
  __done(at + dur, at + dur * 0.6);
}
/** 一个小圆点沿着连线走过去：表示一条消息、一次请求 */
function send(link, o) {
  o = o || {};
  if (!__isNode(link) || link.kind !== "link") __fail("send() 的第一个参数要是一条连线（arrow 或 line 返回的值）。");
  if (!__cur) __fail("send() 是动画，要写在 step(讲解, () => { ... }) 的函数里面。");
  __known(o, ["label", "tone", "dur", "delay", "reverse", "r"], "send");
  var dur = __dur(o, 900, "send"), at = __at(o, "send");
  var tone = o.tone === undefined ? "accent" : __color(o.tone, "send");
  var dot = __add("packet", { opacity: 0, pos: o.reverse ? 1 : 0, r: o.r === undefined ? 5 : __num(o.r, "r", "send"), text: o.label === undefined ? "" : String(o.label), fill: tone, color: "ink", size: 11 }, { along: link.id });
  __tw(dot, "opacity", 1, at, 120);
  __tw(dot, "pos", o.reverse ? 0 : 1, at, dur, "inOut");
  __tw(dot, "opacity", 0, at + dur, 160);
  __done(at + dur + 160, at + dur);
}
/** 镜头：看向哪里、放大多少 */
function camera(to, o) {
  o = o || {};
  if (!__plain(to)) __fail("camera() 的第一个参数是 { x, y, zoom }。");
  __known(to, ["x", "y", "zoom"], "camera");
  __known(o, ["dur", "delay", "ease"], "camera");
  var dur = __dur(o, 900, "camera"), at = __at(o, "camera"), ease = __ease(o.ease, "inOut", "camera");
  if (to.x !== undefined) __tw(__camera, "x", __num(to.x, "x", "camera"), at, dur, ease);
  if (to.y !== undefined) __tw(__camera, "y", __num(to.y, "y", "camera"), at, dur, ease);
  if (to.zoom !== undefined) __tw(__camera, "zoom", Math.min(6, Math.max(0.4, __num(to.zoom, "zoom", "camera"))), at, dur, ease);
  __done(at + dur, at + dur * 0.8);
}
/** 镜头推近到这几个东西 */
function zoomTo() {
  var a = __args(arguments, "zoomTo"), o = a.opts;
  __known(o, ["pad", "dur", "delay"], "zoomTo");
  if (!a.els.length) __fail("zoomTo() 要给出看向哪些东西；回到全景用 zoomOut()。");
  var pad = o.pad === undefined ? 48 : __num(o.pad, "pad", "zoomTo");
  var l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  a.els.forEach(function (n) { __ref(n, "zoomTo", "参数"); l = Math.min(l, n.left); r = Math.max(r, n.right); t = Math.min(t, n.top); b = Math.max(b, n.bottom); });
  var zoom = Math.min(W / (r - l + pad * 2), H / (b - t + pad * 2));
  camera({ x: (l + r) / 2, y: (t + b) / 2, zoom: Math.min(4, Math.max(1, zoom)) }, { dur: o.dur, delay: o.delay });
}
function zoomOut(o) {
  o = o || {};
  camera({ x: W / 2, y: H / 2, zoom: 1 }, { dur: o.dur, delay: o.delay });
}

/* ---------- 排版 ---------- */
function __list(els, fn) {
  if (!Array.isArray(els) || !els.length) __fail(fn + "() 的第一个参数是一组东西：" + fn + "([a, b, c])。");
  els.forEach(function (n) { __ref(n, fn, "每一项"); });
  return els;
}
/** 排成一行，整体居中 */
function row(els, o) {
  __list(els, "row");
  o = o || {};
  __known(o, ["x", "y", "gap", "dur", "delay", "ease"], "row");
  var gap = o.gap === undefined ? 56 : __num(o.gap, "gap", "row");
  var total = -gap;
  els.forEach(function (n) { total += __half(n).w * 2 + gap; });
  var x = (o.x === undefined ? W / 2 : __num(o.x, "x", "row")) - total / 2;
  var y = o.y === undefined ? H / 2 : __num(o.y, "y", "row");
  __moveAll(els.map(function (n) { var hw = __half(n).w; var m = [n, x + hw, y]; x += hw * 2 + gap; return m; }), o, "row");
  return els;
}
/** 排成一列，整体居中 */
function column(els, o) {
  __list(els, "column");
  o = o || {};
  __known(o, ["x", "y", "gap", "dur", "delay", "ease"], "column");
  var gap = o.gap === undefined ? 28 : __num(o.gap, "gap", "column");
  var total = -gap;
  els.forEach(function (n) { total += __half(n).h * 2 + gap; });
  var x = o.x === undefined ? W / 2 : __num(o.x, "x", "column");
  var y = (o.y === undefined ? H / 2 : __num(o.y, "y", "column")) - total / 2;
  __moveAll(els.map(function (n) { var hh = __half(n).h; var m = [n, x, y + hh]; y += hh * 2 + gap; return m; }), o, "column");
  return els;
}
/** 排成几列的网格，整体居中 */
function grid(els, o) {
  __list(els, "grid");
  o = o || {};
  __known(o, ["cols", "x", "y", "gapX", "gapY", "dur", "delay", "ease"], "grid");
  var cols = o.cols === undefined ? Math.ceil(Math.sqrt(els.length)) : __num(o.cols, "cols", "grid");
  if (cols % 1 !== 0 || cols < 1) __fail("grid() 的 cols 要是正整数。");
  var rows = Math.ceil(els.length / cols);
  var cw = 0, ch = 0;
  els.forEach(function (n) { var h = __half(n); cw = Math.max(cw, h.w * 2); ch = Math.max(ch, h.h * 2); });
  var gx = o.gapX === undefined ? 40 : __num(o.gapX, "gapX", "grid"), gy = o.gapY === undefined ? 28 : __num(o.gapY, "gapY", "grid");
  var x0 = (o.x === undefined ? W / 2 : __num(o.x, "x", "grid")) - (cols * cw + (cols - 1) * gx) / 2 + cw / 2;
  var y0 = (o.y === undefined ? H / 2 : __num(o.y, "y", "grid")) - (rows * ch + (rows - 1) * gy) / 2 + ch / 2;
  __moveAll(els.map(function (n, i) { return [n, x0 + (i % cols) * (cw + gx), y0 + Math.floor(i / cols) * (ch + gy)]; }), o, "grid");
  return els;
}

function __finish() {
  if (!__steps.length) __fail("场景里至少要有一步：step(\"这一步讲什么\", () => { show(a) })。");
  return JSON.stringify({ w: W, h: H, nodes: __nodes, steps: __steps });
}
`;
