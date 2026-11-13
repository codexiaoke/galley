import { Suspense } from "react";
import { SiteIndex } from "../../site-index";
import { SiteShell } from "../../site-shell";

/** 标签页：用到这个标签的已发布文章。 */
export default function TagPage({ params }: PageProps<"/tag/[name]">) {
  return (
    <Suspense fallback={null}>
      <SiteShell>
        <Tag params={params} />
      </SiteShell>
    </Suspense>
  );
}

async function Tag({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  let tag: string;
  try {
    tag = decodeURIComponent(name);
  } catch {
    tag = name;
  }
  return <SiteIndex tag={tag} />;
}
