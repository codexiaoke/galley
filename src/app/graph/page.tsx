import { Suspense } from "react";
import { layoutGraph } from "@/render/graph-layout";
import { loadSiteGraph } from "../data";
import { SimplePage } from "../simple-page";
import { TrackView } from "../track-view";
import { GraphView } from "./graph-view";

/**
 * 知识图谱：这个站写过的文章、定义过的概念，以及它们之间的联系。
 * 点一个概念看它的定义和讲到它的文章，点一篇文章去读它。
 */
export default function GraphPage({ searchParams }: PageProps<"/graph">) {
  return (
    <SimplePage title="知识图谱">
      <Suspense fallback={null}>
        <Graph searchParams={searchParams} />
      </Suspense>
      <TrackView path="/graph" />
    </SimplePage>
  );
}

const SIZE = { width: 1000, height: 640 };

async function Graph({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [graph, query] = await Promise.all([loadSiteGraph(), searchParams]);
  if (graph.nodes.length === 0) {
    return <p className="galley-empty">还没有可以画的联系。文章里用到站内定义过的概念、或者互相链接之后，这里就会出现一张图。</p>;
  }
  const { positions, width, height } = layoutGraph(graph, SIZE);
  const focus = typeof query.focus === "string" ? query.focus : undefined;
  const articles = graph.nodes.filter((n) => n.kind === "article").length;
  return (
    <>
      <p className="galley-lede">
        {articles} 篇文章、{graph.nodes.length - articles} 个概念。朱红色的是概念，黑色的是文章；点一下看它和谁相连。
      </p>
      <GraphView graph={graph} positions={positions} size={{ width, height }} focus={graph.nodes.some((n) => n.id === focus) ? focus : undefined} />
    </>
  );
}
