"use client";

import dynamic from "next/dynamic";

/**
 * 正文里的播放器按需加载：服务端照常把它们渲染出来（读者先看到内容），
 * 浏览器只在页面里真的用到某个播放器时，才去下载它的代码。
 * 没有用到算法动画的文章，就不会下载算法动画的代码。
 *
 * 量过（2026-11）：一篇普通文章下载的脚本里，框架本身占大头，这些播放器合在一起压缩后约 15 KB。
 * 拆开以后，普通文章不再为用不到的组件付这部分流量。
 */

export const AlgoPlayer = dynamic(() => import("./algo/player").then((m) => m.AlgoPlayer));
export const RacePlayer = dynamic(() => import("./algo/race").then((m) => m.RacePlayer));
export const CodeStepsPlayer = dynamic(() => import("./code-steps").then((m) => m.CodeStepsPlayer));
export const ChartView = dynamic(() => import("./chart").then((m) => m.ChartView));
export const FlowView = dynamic(() => import("./flow").then((m) => m.FlowView));
export const Compare = dynamic(() => import("./compare").then((m) => m.Compare));
export const MermaidDiagram = dynamic(() => import("./mermaid").then((m) => m.MermaidDiagram));
export const StepsController = dynamic(() => import("./steps").then((m) => m.StepsController));
export const Tabs = dynamic(() => import("./tabs").then((m) => m.Tabs));
export const CountUp = dynamic(() => import("./stat").then((m) => m.CountUp));
export const ZoomImage = dynamic(() => import("./image").then((m) => m.ZoomImage));
export const Quiz = dynamic(() => import("./quiz").then((m) => m.Quiz));
export const CodeRunner = dynamic(() => import("./code-runner").then((m) => m.CodeRunner));
