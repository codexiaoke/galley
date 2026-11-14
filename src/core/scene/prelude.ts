/**
 * 在沙箱里、作者的场景代码之前运行的一段 JavaScript：定义作者可以调用的函数。
 *
 * 作者的代码做两件事：
 * 1. 摆东西：box、circle、text、code、frame、arrow、line、image、path（以及 axes 画出来的坐标系和函数图像）
 *    各建一个东西，返回它的"把手"；
 * 2. 写步骤：step(写给读者的一句话, () => { say(讲的时候说的话); show(a); move(b, { x: 300 }); send(link) })。
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
var __LIMITS = { nodes: 120, steps: 24, tweens: 900, codeLines: 16 };
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
var __homeTweens = [];
var __cameraSet = false;

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

/* ---------- 图片 ---------- */
function image(src, o) {
  o = o || {};
  __known(o, __PLACE.concat(["w", "h", "radius"]), "image");
  if (typeof src !== "string" || !/^\/media\/[a-z0-9]+\.[a-z0-9]+$/.test(src)) __fail("image() 只能用媒体库里的图片，地址以 /media/ 开头（用 list_media 查）。");
  if (o.w === undefined || o.h === undefined) __fail("image() 要给出 w 和 h（在画面上占多大），按图片本身的宽高比给。");
  var w = __num(o.w, "w", "image"), h = __num(o.h, "h", "image");
  var p = __shape("image", { w: w, h: h, src: src, radius: o.radius === undefined ? 8 : __num(o.radius, "radius", "image") });
  __position(p, w / 2, h / 2, o, "image");
  return __add("image", p);
}
/** 图片上的一块：位置按占图片的比例给（0 到 1），返回一个框，用来圈出截图上的某个地方 */
function spot(img, area, o) {
  o = o || {};
  if (!__isNode(img) || img.kind !== "image") __fail("spot() 的第一个参数要是一张图片（image 返回的值）。");
  if (!__plain(area)) __fail("spot() 的第二个参数是圈出哪一块：{ x, y, w, h }，都是占图片的比例（0 到 1）。");
  __known(area, ["x", "y", "w", "h"], "spot");
  __known(o, ["tone", "pad", "dashed"], "spot");
  ["x", "y", "w", "h"].forEach(function (k) {
    var v = __num(area[k], k, "spot");
    if (v < 0 || v > 1) __fail("spot() 的 x、y、w、h 是占图片的比例，写 0 到 1 之间的数。");
  });
  var pad = o.pad === undefined ? 3 : __num(o.pad, "pad", "spot");
  var w = img.w * area.w, h = img.h * area.h;
  return frame("", { x: img.left + img.w * area.x + w / 2, y: img.top + img.h * area.y + h / 2, w: w + pad * 2, h: h + pad * 2, tone: o.tone === undefined ? "accent" : o.tone, dashed: !!o.dashed, radius: 6 });
}

/* ---------- 自由绘图：任意的线和形状 ---------- */
var __MAX_POINTS = 400;
function __pts(list, fn) {
  if (!Array.isArray(list) || list.length < 2) __fail(fn + "() 需要至少两个点：[[x1, y1], [x2, y2], ...]。");
  if (list.length > __MAX_POINTS) __fail(fn + "() 的点太多了（超过 " + __MAX_POINTS + " 个）。曲线取几十个点就够平滑了。");
  return list.map(function (p) {
    if (__plain(p)) p = [p.x, p.y];
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "number" || typeof p[1] !== "number" || !isFinite(p[0]) || !isFinite(p[1])) {
      __fail(fn + "() 的每个点写成 [x, y]，两个都是数字。");
    }
    return [p[0], p[1]];
  });
}
function __bbox(subs) {
  var l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  subs.forEach(function (s) { s.forEach(function (p) { l = Math.min(l, p[0]); r = Math.max(r, p[0]); t = Math.min(t, p[1]); b = Math.max(b, p[1]); }); });
  return { l: l, r: r, t: t, b: b };
}
function __r1(v) { return Math.round(v * 10) / 10; }
/** 点存成相对于中心的坐标：整条线挪动时只改中心 */
function __encode(subs, cx, cy) {
  return subs.map(function (s) { return s.map(function (p) { return __r1(p[0] - cx) + "," + __r1(p[1] - cy); }).join(" "); }).join(";");
}
function __decode(str) {
  return String(str).split(";").map(function (s) { return s.split(" ").map(function (p) { var xy = p.split(","); return [Number(xy[0]), Number(xy[1])]; }); });
}
function __path(subs, o, fn) {
  __known(o, ["closed", "smooth", "fill", "stroke", "tone", "width", "dashed"], fn);
  var b = __bbox(subs), cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
  var p = { x: cx, y: cy, w: Math.max(1, b.r - b.l), h: Math.max(1, b.b - b.t), opacity: 0, scale: 1, rotate: 0, ox: 0, oy: 0, draw: 0, points: __encode(subs, cx, cy), closed: o.closed ? 1 : 0, smooth: o.smooth ? 1 : 0, width: o.width === undefined ? 1.8 : __num(o.width, "width", fn), fill: "none", stroke: "ink", dashed: o.dashed ? 1 : 0 };
  __paint(p, "path", o, fn);
  return __add("path", p);
}
/** 一条任意的线：折线、曲线（smooth）、封闭的形状（closed）。点是代码算出来的，想画什么都行 */
function path(points, o) { return __path([__pts(points, "path")], o || {}, "path"); }

/** 给点数少的那条线在最长的线段上加点，直到两条线点数一样。原来的顶点一个不动，形状不变 */
function __densify(points, count, closed) {
  var out = points.slice();
  while (out.length < count) {
    var best = 0, longest = -1, n = closed ? out.length : out.length - 1;
    for (var i = 0; i < n; i++) {
      var a = out[i], b = out[(i + 1) % out.length];
      var d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d > longest) { longest = d; best = i; }
    }
    var p = out[best], q = out[(best + 1) % out.length];
    out.splice(best + 1, 0, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
  }
  return out;
}
/** 一条线变成另一个形状 */
function morph(n, points, o) {
  o = o || {};
  if (!__isNode(n) || n.kind !== "path") __fail("morph() 的第一个参数要是一条线（path 或 plot 返回的值）。");
  __known(o, ["dur", "delay", "ease"], "morph");
  var s = __state[n.id], cur = __decode(s.points);
  if (cur.length !== 1) __fail("morph() 只能用在一条连续的线上（断开的函数图像、坐标系的刻度不行）。");
  var to = __pts(points, "morph");
  var from = cur[0].map(function (p) { return [p[0] + s.x, p[1] + s.y]; });
  var dur = __dur(o, 900, "morph"), at = __at(o, "morph"), ease = __ease(o.ease, "inOut", "morph");
  if (from.length !== to.length) {
    var count = Math.max(from.length, to.length);
    from = __densify(from, count, !!s.closed);
    to = __densify(to, count, !!s.closed);
    // 先换成点数一样的同一条线（看起来没有变化），两边才能一个点对一个点地过渡
    __tw(n, "points", __encode([from], s.x, s.y), at, 0);
  }
  var b = __bbox([to]), cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
  __tw(n, "points", __encode([to], cx, cy), at, dur, ease);
  __tw(n, "x", cx, at, dur, ease);
  __tw(n, "y", cy, at, dur, ease);
  __tw(n, "w", Math.max(1, b.r - b.l), at, dur, ease);
  __tw(n, "h", Math.max(1, b.b - b.t), at, dur, ease);
  __done(at + dur, at + dur * 0.8);
}

var __EASE_FN = {
  linear: function (t) { return t; },
  "in": function (t) { return t * t * t; },
  out: function (t) { return 1 - Math.pow(1 - t, 3); },
  inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  back: function (t) { return 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2); },
};
var __NUMERIC = {
  box: ["x", "y", "w", "h", "radius", "opacity", "scale", "rotate", "size"],
  circle: ["x", "y", "r", "opacity", "scale", "rotate", "size"],
  text: ["x", "y", "opacity", "scale", "rotate", "size"],
  code: ["x", "y", "opacity", "scale"],
  frame: ["x", "y", "w", "h", "radius", "opacity"],
  link: ["opacity", "bend", "width", "draw"],
  image: ["x", "y", "w", "h", "radius", "opacity", "scale", "rotate"],
  path: ["x", "y", "opacity", "scale", "rotate", "width", "draw"],
};
/** 按函数取样：把"随进度变化的值"变成一串很短的匀速动作，播放时连起来就是这条轨迹 */
function __sample(n, fns, o, fn) {
  var dur = __dur(o, 1000, fn), at = __at(o, fn);
  var steps = Math.min(50, Math.max(2, Math.ceil(dur / 40)));
  Object.keys(fns).forEach(function (k) {
    if (typeof fns[k] !== "function") __fail(fn + "() 里每个属性给一个函数：进度 p 从 0 到 1，返回这个属性当时的值。");
    if (__NUMERIC[n.kind].indexOf(k) === -1) __fail(fn + "() 不能改" + n.kind + "的「" + k + "」，可以改的有：" + __NUMERIC[n.kind].join("、") + "。");
    for (var i = 0; i <= steps; i++) {
      var v = fns[k](i / steps);
      if (typeof v !== "number" || !isFinite(v)) __fail(fn + "() 里「" + k + "」的函数在进度 " + i / steps + " 时没有返回一个数字。");
      if (i === 0) __tw(n, k, v, at, 0);
      else __tw(n, k, __r1(v * 100) / 100, at + (dur * (i - 1)) / steps, dur / steps, "linear");
    }
  });
  __done(at + dur, at + dur);
}
/** 属性按你给的函数变化：animate(dot, { x: p => 100 + 300 * p, y: p => 200 - 80 * Math.sin(p * Math.PI) }) */
function animate(n, fns, o) {
  o = o || {};
  if (!__isNode(n) || !__NUMERIC[n.kind]) __fail("animate() 的第一个参数要是画面上的东西。");
  if (!__plain(fns)) __fail("animate() 的第二个参数是 { 属性: 函数 }，函数拿到进度 p（0 到 1），返回这个属性当时的值。");
  __known(o, ["dur", "delay"], "animate");
  __sample(n, fns, o, "animate");
}
/** 平滑曲线（smooth）实际走的路线：每两个点之间再细分几段 */
function __trace(points, closed, smooth) {
  if (!smooth || points.length < 3) return closed ? points.concat([points[0]]) : points;
  var n = points.length, out = [], last = closed ? n : n - 1;
  for (var i = 0; i < last; i++) {
    var p0 = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
    for (var k = 0; k < 8; k++) {
      var t = k / 8, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? points[0] : points[n - 1]);
  return out;
}
/** 沿着一条折线走到全长的 f 处（0 到 1）是哪个点 */
function __pointAt(line, f) {
  var total = 0, lens = [];
  for (var i = 1; i < line.length; i++) { var d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); lens.push(d); total += d; }
  var want = Math.min(1, Math.max(0, f)) * total;
  for (var j = 0; j < lens.length; j++) {
    if (want <= lens[j] || j === lens.length - 1) {
      var t = lens[j] ? Math.min(1, want / lens[j]) : 0;
      return [line[j][0] + (line[j + 1][0] - line[j][0]) * t, line[j][1] + (line[j + 1][1] - line[j][1]) * t];
    }
    want -= lens[j];
  }
  return line[line.length - 1];
}
/** 让一个东西沿着一条线走 */
function along(n, track, o) {
  o = o || {};
  __ref(n, "along", "第一个参数");
  if (!__isNode(track) || track.kind !== "path") __fail("along() 的第二个参数要是一条线（path 或 plot 返回的值）。");
  __known(o, ["dur", "delay", "ease", "from", "to"], "along");
  var s = __state[track.id], subs = __decode(s.points);
  if (subs.length !== 1) __fail("along() 只能沿着一条连续的线走。");
  var line = __trace(subs[0].map(function (p) { return [p[0] + s.x, p[1] + s.y]; }), !!s.closed, !!s.smooth);
  var ease = __EASE_FN[__ease(o.ease, "inOut", "along")];
  var a = o.from === undefined ? 0 : __num(o.from, "from", "along"), b = o.to === undefined ? 1 : __num(o.to, "to", "along");
  __sample(n, {
    x: function (p) { return __pointAt(line, a + (b - a) * ease(p))[0]; },
    y: function (p) { return __pointAt(line, a + (b - a) * ease(p))[1]; },
  }, { dur: o.dur === undefined ? 1400 : o.dur, delay: o.delay }, "along");
}

/* ---------- 坐标系和函数图像 ---------- */
function __niceStep(span) {
  var raw = span / 5, pow = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}
function __range(v, name) {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "number" || typeof v[1] !== "number" || !(v[1] > v[0])) __fail("axes() 的 " + name + " 写成 [最小值, 最大值]。");
  return v;
}
function axes(o) {
  o = o || {};
  __known(o, ["x", "y", "w", "h", "at", "step", "labels"], "axes");
  var xr = __range(o.x, "x"), yr = __range(o.y, "y");
  var w = o.w === undefined ? 420 : __num(o.w, "w", "axes"), h = o.h === undefined ? 280 : __num(o.h, "h", "axes");
  var at = o.at === undefined ? [W / 2, H / 2] : o.at;
  if (!Array.isArray(at) || at.length !== 2) __fail("axes() 的 at 是坐标系中心在舞台上的位置：[x, y]。");
  var left = at[0] - w / 2, bottom = at[1] + h / 2;
  var X = function (v) { return left + ((v - xr[0]) / (xr[1] - xr[0])) * w; };
  var Y = function (v) { return bottom - ((v - yr[0]) / (yr[1] - yr[0])) * h; };
  // 轴画在 0 的位置；范围里没有 0 时画在边上
  var y0 = Y(Math.min(yr[1], Math.max(yr[0], 0))), x0 = X(Math.min(xr[1], Math.max(xr[0], 0)));
  var steps = Array.isArray(o.step) ? o.step : [o.step, o.step];
  var sx = steps[0] === undefined ? __niceStep(xr[1] - xr[0]) : __num(steps[0], "step", "axes");
  var sy = steps[1] === undefined ? __niceStep(yr[1] - yr[0]) : __num(steps[1], "step", "axes");
  if (!(sx > 0) || !(sy > 0) || (xr[1] - xr[0]) / sx > 24 || (yr[1] - yr[0]) / sy > 24) __fail("axes() 的 step 太小了：一条轴上最多 24 个刻度。");
  var parts = [arrow([left - 6, y0], [left + w + 16, y0], { stroke: "soft" }), arrow([x0, bottom + 6], [x0, bottom - h - 16], { stroke: "soft" })];
  var ticks = [], labels = [];
  var fmt = function (v) { return String(Math.round(v * 1000) / 1000); };
  for (var vx = Math.ceil(xr[0] / sx) * sx; vx <= xr[1] + 1e-9; vx += sx) {
    if (Math.abs(vx) < 1e-9) continue;
    ticks.push([[X(vx), y0 - 3], [X(vx), y0 + 3]]);
    if (o.labels !== false) labels.push(text(fmt(vx), { x: X(vx), y: y0 + 14, size: 10, color: "faint" }));
  }
  for (var vy = Math.ceil(yr[0] / sy) * sy; vy <= yr[1] + 1e-9; vy += sy) {
    if (Math.abs(vy) < 1e-9) continue;
    ticks.push([[x0 - 3, Y(vy)], [x0 + 3, Y(vy)]]);
    if (o.labels !== false) labels.push(text(fmt(vy), { x: x0 - 9, y: Y(vy), size: 10, color: "faint", align: "end" }));
  }
  if (ticks.length) parts.push(__path(ticks, { stroke: "soft", width: 1.2 }, "axes"));
  return {
    /** 坐标系的所有零件：show(ax.parts) */
    parts: parts.concat(labels),
    /** 数学坐标换成舞台上的位置：circle("", { r: 5, ...ax.at(1, 2) }) */
    at: function (x, y) { return { x: X(__num(x, "x", "at")), y: Y(__num(y, "y", "at")) }; },
    /** 画出 y = f(x)。超出 y 范围、没有值的地方断开 */
    plot: function (f, opts) {
      opts = opts || {};
      __known(opts, ["from", "to", "samples", "tone", "stroke", "width", "dashed"], "plot");
      if (typeof f !== "function") __fail("plot() 的第一个参数是一个函数：x => x * x。");
      var a = opts.from === undefined ? xr[0] : __num(opts.from, "from", "plot"), b = opts.to === undefined ? xr[1] : __num(opts.to, "to", "plot");
      var count = opts.samples === undefined ? 80 : Math.min(300, Math.max(2, __num(opts.samples, "samples", "plot")));
      var subs = [], run = [];
      for (var i = 0; i <= count; i++) {
        var x = a + ((b - a) * i) / count, y = f(x);
        if (typeof y === "number" && isFinite(y) && y >= yr[0] - 1e-9 && y <= yr[1] + 1e-9) run.push([X(x), Y(y)]);
        else { if (run.length > 1) subs.push(run); run = []; }
      }
      if (run.length > 1) subs.push(run);
      if (!subs.length) __fail("plot() 的函数在这个范围里没有落在坐标系里的点。检查 x、y 的范围。");
      return __path(subs, { tone: opts.tone === undefined && opts.stroke === undefined ? "accent" : opts.tone, stroke: opts.stroke, width: opts.width === undefined ? 2.2 : opts.width, dashed: opts.dashed }, "plot");
    },
  };
}

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
  var out = { text: s.text, tweens: s.tweens, duration: Math.max(300, Math.round(s.end)) };
  if (s.say !== undefined) out.say = s.say;
  __steps.push(out);
}
/** 讲这一步时说的话：口语的讲稿。文章里不出现，演示里是字幕和提词 */
function say(words) {
  if (!__cur) __fail("say() 要写在 step(文字, () => { ... }) 的函数里面：它是讲这一步时说的话。");
  if (typeof words !== "string" || !words.trim()) __fail("say() 的括号里直接写讲这一步时说的话（一两句口语）。");
  if (__cur.say !== undefined) __fail("一步里只写一个 say()。要说的话都写在这一句里。");
  if (words.length > 600) __fail("say() 太长了（超过 600 个字）。一步只讲一件事，说两三句就够。");
  __cur.say = words.trim();
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
    if (n.kind === "link" || (n.kind === "path" && from !== "fade")) {
      // 线是画出来的；线上的字、箭头跟着长出来
      var draw = n.kind === "path" ? Math.max(dur, 700) : dur;
      __tw(n, "opacity", 1, at, Math.min(160, dur));
      __tw(n, "draw", 1, at, draw, __ease(o.ease, "inOut", "show"));
      end = Math.max(end, at + draw);
    } else if (n.kind === "path") {
      __tw(n, "draw", 1, at, 0);
      __tw(n, "opacity", 1, at, dur * 0.8);
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
    if (n.kind === "link" || n.kind === "path") __tw(n, "draw", 0, at + dur, 0);
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
  image: ["x", "y", "w", "h", "radius", "opacity", "scale", "rotate"],
  path: ["x", "y", "opacity", "scale", "rotate", "fill", "stroke", "width", "draw"],
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
function __cam(to, o, fn) {
  o = o || {};
  if (!__plain(to)) __fail(fn + "() 的第一个参数是 { x, y, zoom }。");
  __known(to, ["x", "y", "zoom"], fn);
  __known(o, ["dur", "delay", "ease"], fn);
  var dur = __dur(o, 900, fn), at = __at(o, fn), ease = __ease(o.ease, "inOut", fn);
  if (to.x !== undefined) __tw(__camera, "x", __num(to.x, "x", fn), at, dur, ease);
  if (to.y !== undefined) __tw(__camera, "y", __num(to.y, "y", fn), at, dur, ease);
  if (to.zoom !== undefined) __tw(__camera, "zoom", Math.min(6, Math.max(0.4, __num(to.zoom, "zoom", fn))), at, dur, ease);
  __done(at + dur, at + dur * 0.8);
}
function camera(to, o) {
  // 第一步之前自己摆过镜头：全景就按作者摆的来，不再自动贴合（见 __home）
  if (!__cur) __cameraSet = true;
  __cam(to, o, "camera");
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
  if (!__cur) __cameraSet = true;
  __cam({ x: (l + r) / 2, y: (t + b) / 2, zoom: Math.min(4, Math.max(1, zoom)) }, { dur: o.dur, delay: o.delay }, "zoomTo");
}
/** 回到全景。全景是什么要等所有步骤都记完才知道（见 __home），这里先记下是哪几个动作，最后再填 */
function zoomOut(o) {
  o = o || {};
  __known(o, ["dur", "delay"], "zoomOut");
  var from = __cur ? __cur.tweens.length : 0;
  __cam({ x: W / 2, y: H / 2, zoom: 1 }, { dur: o.dur, delay: o.delay }, "zoomOut");
  if (__cur) for (var i = from; i < __cur.tweens.length; i++) __homeTweens.push(__cur.tweens[i]);
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

/**
 * 全景：正好装下所有东西的镜头。
 *
 * 作者摆东西时常常只用到舞台中间的一块，四周空着，画面上的字就小得看不清；
 * 也有摆到舞台外面去的。所以不按舞台的大小取景，而是把整个过程里出现过的东西都走一遍，
 * 量出它们一共占了多大地方，镜头对准这一块、放大到正好装下（四周留一点边）。
 * 东西很少时最多放大到 1.8 倍，免得两个方块撑满整个画面。
 */
function __home() {
  var l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  var cur = {};
  __nodes.forEach(function (rec) { cur[rec.id] = Object.assign({}, rec.props); });
  function point(x, y) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  function center(end) { return Array.isArray(end) ? { x: end[0], y: end[1] } : { x: cur[end].x, y: cur[end].y }; }
  function grow(rec) {
    var s = cur[rec.id];
    if (rec.kind === "camera" || rec.kind === "packet" || !(s.opacity > 0)) return;
    if (rec.kind === "link") {
      // 连线：两端固定的点、弯出去的顶点、线上的字
      var a = center(rec.from), c = center(rec.to);
      var len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      var mx = (a.x + c.x) / 2 - ((c.y - a.y) / len) * s.bend, my = (a.y + c.y) / 2 + ((c.x - a.x) / len) * s.bend;
      var half = s.text ? __measure(s.text, s.size) / 2 + 6 : 4;
      point(mx - half, my - (s.text ? 22 : 4));
      point(mx + half, my + (s.text ? 22 : 4));
      if (Array.isArray(rec.from)) point(a.x, a.y);
      if (Array.isArray(rec.to)) point(c.x, c.y);
      return;
    }
    var sc = s.scale === undefined ? 1 : s.scale;
    var hw = (rec.kind === "circle" ? s.r : s.w / 2) * sc, hh = (rec.kind === "circle" ? s.r : s.h / 2) * sc;
    var cx = rec.kind === "text" && s.align === "start" ? s.x + hw : rec.kind === "text" && s.align === "end" ? s.x - hw : s.x;
    point(cx - hw, s.y - hh);
    point(cx + hw, s.y + hh);
  }
  __nodes.forEach(grow);
  __steps.forEach(function (step) {
    step.tweens.forEach(function (tw) {
      cur[tw.id][tw.prop] = tw.to;
      grow(__byId[tw.id]);
    });
  });
  if (l === Infinity) return null;
  var pad = 34;
  var zoom = Math.min(1.8, Math.max(0.5, Math.min(W / (r - l + pad * 2), H / (b - t + pad * 2))));
  var x = (l + r) / 2, y = (t + b) / 2;
  // 本来就差不多摆满了舞台：不动
  if (Math.abs(zoom - 1) < 0.04 && Math.abs(x - W / 2) < 12 && Math.abs(y - H / 2) < 12) return null;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, zoom: Math.round(zoom * 1000) / 1000 };
}

function __finish() {
  if (!__steps.length) __fail("场景里至少要有一步：step(\"这一步讲什么\", () => { show(a) })。");
  if (!__cameraSet) {
    var home = __home();
    if (home) {
      ["x", "y", "zoom"].forEach(function (k) { __byId[__camera.id].props[k] = home[k]; });
      __homeTweens.forEach(function (tw) { tw.to = home[tw.prop]; });
    }
  }
  return JSON.stringify({ w: W, h: H, nodes: __nodes, steps: __steps });
}
`;
