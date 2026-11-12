import { Suspense } from "react";
import { SiteIndex } from "../../site-index";

export default function CategoryPage({ params }: PageProps<"/category/[slug]">) {
  return (
    <div className="galley-site flex-1">
      <Suspense fallback={null}>
        <Category params={params} />
      </Suspense>
    </div>
  );
}

async function Category({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SiteIndex categorySlug={slug} />;
}
