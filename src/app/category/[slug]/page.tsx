import { Suspense } from "react";
import { SiteIndex } from "../../site-index";
import { SiteShell } from "../../site-shell";

export default function CategoryPage({ params }: PageProps<"/category/[slug]">) {
  return (
    <Suspense fallback={null}>
      <SiteShell>
        <Category params={params} />
      </SiteShell>
    </Suspense>
  );
}

async function Category({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SiteIndex categorySlug={slug} />;
}
