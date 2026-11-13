/** 给 Agent 看的 trace 函数说明，出现在 writing 技能的组件清单和 list_components 里。 */
export const TRACE_API_DOC = `**trace 里可以用的函数**

代码是普通的 JavaScript（不能用 import、网络、定时器）。\`input\` 是 trace 的 input 参数：逗号分隔的数字会变成数组，能按 JSON 解析的按 JSON，其余是字符串。一段演示里可以同时有几种结构（数组、表格、网格、图、树，每种最多一个，最多三个），按建立的先后从上往下排，每一帧都一起显示。

数组（排序、查找、双指针……）：

| 函数 | 作用 | 记一帧 |
|---|---|---|
| \`const a = array(data, { style, heap })\` | 要演示的数组，返回的就是这个数组本身，之后直接读写它。style 是 bars（柱子，默认）或 boxes（方块，有负数或字符串时默认）；heap: true 时在下面再把它画成一棵完全二叉树（讲堆的时候用），两边同步 | |
| \`compare(i, j, 说明?)\` | 标出正在比较的两个位置；返回 1 / 0 / -1（a[i] 大于、等于、小于 a[j]） | ✓ |
| \`swap(i, j, 说明?)\` | 交换 a[i] 和 a[j]，元素会滑过去 | ✓ |
| \`set(i, 值, 说明?)\` | a[i] = 值 | ✓ |
| \`focus(i, 说明?)\` | 标出当前在看的位置 | ✓ |
| \`mark(i 或 [i, j...], 状态)\` | 持续的状态，直到改掉；状态写 null 取消 | |
| \`pointer(名字, i)\` | 在 i 下面显示一个指针（lo、mid、hi……）；i 写 null 去掉 | |
| \`range(lo, hi)\` | 只看这一段，范围外淡下去；range(null) 取消 | |
| \`aux(名字, 数组)\` | 在下面显示一个辅助数组（栈、队列、临时区），每一帧自动取它当时的内容 | |

表格（动态规划）：\`const t = table(行数, 列数, { rowHead, colHead })\`，然后 \`t.set(i, j, 值, { note, from: [[i-1, j], [i, j-1]] })\` 填一格（from 是它依赖的格子，会标出来），\`t.get(i, j)\`、\`t.mark(i, j, 状态)\`、\`t.focus(i, j, 说明)\`。最多 16 × 16。

网格（迷宫、洪水填充）：\`const g = grid(["S..#", ".#.E"])\`（# 墙，S 起点，E 终点），\`g.start\`、\`g.end\` 是 {r, c}，\`g.isWall(r, c)\`、\`g.visit(r, c, 说明?)\`（记一帧）、\`g.frontier(r, c)\`、\`g.path(r, c, 说明?)\`（有说明时记一帧）。

图：\`const G = graph("A-B:4, A-C:1, C>D")\`（- 无向，> 有向，冒号后是权重，最多 12 个节点，排成一圈），\`G.nodes\`、\`G.edges\`、\`G.neighbors(名字)\`（返回 [{ node, weight }]）、\`G.weight(a, b)\`；\`G.visit(名字, 说明?)\`（标成已访问并记一帧）、\`G.focus(名字, 说明?)\`、\`G.focusEdge(a, b, 说明?)\`（记一帧）；\`G.mark(名字, 状态)\`、\`G.markEdge(a, b, 状态)\`、\`G.label(名字, 文字)\`（节点旁边的小字，比如距离）。

二叉树：\`const T = tree([5, 3, 8, null, 4])\`（按层排列，空位写 null；也可以 tree() 建一棵空树），节点用编号表示，根是 \`T.root\`；\`T.value(i)\`、\`T.left(i)\`、\`T.right(i)\`、\`T.parent(i)\`（没有时是 null）；\`T.add(父节点, "left" 或 "right", 值, 说明?)\` 加一个节点并记一帧，返回新节点的编号（空树时 T.add(null, null, 值) 建根）；\`T.visit(i, 说明?)\`、\`T.focus(i, 说明?)\`、\`T.set(i, 值, 说明?)\` 记一帧；\`T.mark(i, 状态)\`；\`T.output(名字, 数组)\` 在树下面显示一个输出序列（遍历结果）。加节点时整棵树会重新排开，节点平滑地挪过去。

通用：\`step(说明)\` 用当前状态记一帧；\`vars({ i, j })\` 设置变量面板，一直显示到下次调用；\`legend({ sorted: "已就位" })\` 改图例里的说法。

状态有：compare 比较、swap 交换、active 当前、pivot 标记、sorted 已确定、found 找到、dim 排除、visited 已访问、frontier 待访问、path 路径。

要点：
- 说明写给读者看，讲这一步为什么这样做，不要只复述代码。不写说明时会自动生成一句（例如"比较 a[2] = 9 和 a[3] = 1"）。
- 每一帧显示的代码行，是调用 compare / swap / step 的那一行。把这些调用放在你想让读者注意的那行代码上。
- 最多 800 帧，运行时间 2 秒；输入要小，排序 8 到 12 个数正合适。
- 代码出错时保存会失败，错误信息里有行号（从代码块的第一行算起）。`;
