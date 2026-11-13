/**
 * 知识图谱的布局：力导向（相连的点互相拉近，所有的点互相推开，再有一点点往中心的拉力）。
 *
 * 在服务端一次算好，读者的浏览器直接拿到坐标，不用边算边晃。
 * 起始位置是固定的（按顺序排在一条螺旋线上），同样的图每次算出来都一样。
 */

export type LayoutInput = { nodes: { id: string }[]; links: { source: string; target: string }[] };
export type Positioned = { id: string; x: number; y: number };

/**
 * 返回每个点的坐标和画布的实际大小：宽度固定，高度按图的形状来，最高 size.height。
 * 点很少时不会缩在一大片空白的中间。
 */
export function layoutGraph(
  input: LayoutInput,
  size: { width: number; height: number; padding?: number } = { width: 1000, height: 640 },
): { positions: Positioned[]; width: number; height: number } {
  const n = input.nodes.length;
  if (n === 0) return { positions: [], width: size.width, height: 0 };
  const index = new Map(input.nodes.map((node, i) => [node.id, i]));
  const edges = input.links.map((l) => [index.get(l.source), index.get(l.target)]).filter((e): e is [number, number] => e[0] !== undefined && e[1] !== undefined);

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = 10 * Math.sqrt(i + 0.5);
    x[i] = r * Math.cos(i * golden);
    y[i] = r * Math.sin(i * golden);
  }

  // Fruchterman–Reingold：k 是"理想的"点间距离
  const k = 30;
  const iterations = n > 300 ? 160 : 300;
  let temperature = 40;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let step = 0; step < iterations; step++) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = x[i] - x[j];
        let ddy = y[i] - y[j];
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 0.01) {
          ddx = 0.1 * ((i % 3) - 1 || 1);
          ddy = 0.1;
          d2 = 0.02;
        }
        const f = (k * k) / d2;
        dx[i] += ddx * f;
        dy[i] += ddy * f;
        dx[j] -= ddx * f;
        dy[j] -= ddy * f;
      }
    }
    for (const [a, b] of edges) {
      const ddx = x[a] - x[b];
      const ddy = y[a] - y[b];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
      const f = d / k;
      dx[a] -= ddx * f;
      dy[a] -= ddy * f;
      dx[b] += ddx * f;
      dy[b] += ddy * f;
    }
    for (let i = 0; i < n; i++) {
      // 往中心拉一点，免得没有连线的几团飘得太远
      dx[i] -= x[i] * 0.05;
      dy[i] -= y[i] * 0.05;
      const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1;
      const move = Math.min(len, temperature);
      x[i] += (dx[i] / len) * move;
      y[i] += (dy[i] / len) * move;
    }
    temperature = Math.max(0.5, temperature * 0.985);
  }

  // 缩放到画布里，长宽比不变
  const padding = size.padding ?? 60;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minY = Math.min(minY, y[i]);
    maxY = Math.max(maxY, y[i]);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((size.width - padding * 2) / spanX, (size.height - padding * 2) / spanY, 5);
  const height = Math.max(280, Math.min(size.height, spanY * scale + padding * 2));
  const offsetX = (size.width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const positions = input.nodes.map((node, i) => ({
    id: node.id,
    x: Math.round((offsetX + (x[i] - minX) * scale) * 10) / 10,
    y: Math.round((offsetY + (y[i] - minY) * scale) * 10) / 10,
  }));
  return { positions, width: size.width, height: Math.round(height) };
}
