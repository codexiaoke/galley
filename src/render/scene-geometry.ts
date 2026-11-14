/**
 * 场景动画里连线的几何：连线跟着两端的东西走，从一个的边缘出发，到另一个的边缘结束，
 * 中间可以弯（二次曲线）。只画到一半、小圆点走到一半，都从同一条曲线上取。
 */

export type Pt = { x: number; y: number };
/** 连线的一端：一个矩形或圆（中心加半宽半高），或者一个固定的点 */
export type End = { cx: number; cy: number; hw: number; hh: number; round?: boolean };
export type Curve = { p0: Pt; c: Pt; p1: Pt };

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 从一端的中心朝 toward 走，走到边缘再多出 gap 的那个点 */
function edgePoint(end: End, toward: Pt, gap: number): Pt {
  const dx = toward.x - end.cx;
  const dy = toward.y - end.cy;
  const len = Math.hypot(dx, dy);
  if (len < 0.001 || (end.hw === 0 && end.hh === 0)) return { x: end.cx, y: end.cy };
  const ux = dx / len;
  const uy = dy / len;
  // 圆：半径；矩形：先碰到左右边还是上下边
  const reach = end.round ? end.hw : Math.min(ux === 0 ? Infinity : end.hw / Math.abs(ux), uy === 0 ? Infinity : end.hh / Math.abs(uy));
  // 两个东西靠得太近时不要越过对方的中心
  const d = Math.min(reach + gap, len / 2);
  return { x: end.cx + ux * d, y: end.cy + uy * d };
}

/** 两端之间的曲线。bend 是弯多少：中点沿垂直方向偏出去的距离，正负决定往哪边弯 */
export function linkCurve(a: End, b: End, bend: number, gap = 7): Curve {
  const ca = { x: a.cx, y: a.cy };
  const cb = { x: b.cx, y: b.cy };
  const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
  const normal = { x: -(cb.y - ca.y) / len, y: (cb.x - ca.x) / len };
  const mid = lerp(ca, cb, 0.5);
  // 二次曲线的中点只偏出控制点偏移量的一半，所以控制点要偏两倍
  const control = { x: mid.x + normal.x * bend * 2, y: mid.y + normal.y * bend * 2 };
  const p0 = edgePoint(a, bend ? control : cb, gap);
  const p1 = edgePoint(b, bend ? control : ca, gap);
  return { p0, c: bend ? control : lerp(p0, p1, 0.5), p1 };
}

export function curvePoint({ p0, c, p1 }: Curve, t: number): Pt {
  return lerp(lerp(p0, c, t), lerp(c, p1, t), t);
}

/** 曲线在 t 处的方向（单位向量） */
export function curveDirection({ p0, c, p1 }: Curve, t: number): Pt {
  const x = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const y = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

const n = (v: number) => Math.round(v * 100) / 100;

/** 曲线从起点画到 t 处的路径 */
export function curvePath(curve: Curve, t = 1): string {
  const end = curvePoint(curve, t);
  const c = lerp(curve.p0, curve.c, t);
  return `M${n(curve.p0.x)} ${n(curve.p0.y)}Q${n(c.x)} ${n(c.y)} ${n(end.x)} ${n(end.y)}`;
}

/** 箭头：尖在 tip，朝着 dir */
export function arrowHead(tip: Pt, dir: Pt, size = 9): string {
  const bx = tip.x - dir.x * size;
  const by = tip.y - dir.y * size;
  const w = size * 0.46;
  return `M${n(tip.x)} ${n(tip.y)}L${n(bx - dir.y * w)} ${n(by + dir.x * w)}L${n(bx + dir.y * w)} ${n(by - dir.x * w)}Z`;
}

/** 场景里自由画的线：点的清单写成 "x,y x,y;x,y x,y"，分号隔开互不相连的几段 */
export function parsePoints(text: string): number[][][] {
  return text
    .split(";")
    .map((segment) => segment.split(" ").map((p) => p.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)))
    .filter((segment) => segment.length > 1);
}

/** 一个形状变成另一个形状的中间样子：一个点对一个点地挪过去。点数对不上时不过渡，过半就换 */
export function mixPoints(a: number[][][], b: number[][][], p: number): number[][][] {
  if (a.length !== b.length || a.some((segment, i) => segment.length !== b[i].length)) return p < 0.5 ? a : b;
  return a.map((segment, i) => segment.map((point, j) => [point[0] + (b[i][j][0] - point[0]) * p, point[1] + (b[i][j][1] - point[1]) * p]));
}

/** 把几段点连成路径。smooth 时用穿过每个点的平滑曲线（Catmull-Rom），否则是折线 */
export function shapePath(segments: number[][][], closed: boolean, smooth: boolean): string {
  return segments
    .map((points) => {
      const count = points.length;
      let d = `M${n(points[0][0])} ${n(points[0][1])}`;
      if (!smooth || count < 3) {
        for (let i = 1; i < count; i++) d += `L${n(points[i][0])} ${n(points[i][1])}`;
        return closed ? `${d}Z` : d;
      }
      const at = (i: number) => (closed ? points[(i + count) % count] : points[Math.min(count - 1, Math.max(0, i))]);
      const last = closed ? count : count - 1;
      for (let i = 0; i < last; i++) {
        const p0 = at(i - 1);
        const p1 = at(i);
        const p2 = at(i + 1);
        const p3 = at(i + 2);
        d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
      }
      return closed ? `${d}Z` : d;
    })
    .join("");
}
