import { Suspense } from "react";
import { SiteIndex } from "../../site-index";

/** 标签页：用到这个标签的已发布文章。 */
export default function TagPage({ params }: PageProps<"/tag/[name]">) {
  return (
    <div className="galley-site flex-1">
      <Suspense fallback={null}>
        <Tag params={params} />
      </Suspense>
    </div>
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
