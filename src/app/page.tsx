import { Suspense } from "react";
import { SiteIndex } from "./site-index";
import { SiteShell } from "./site-shell";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <SiteShell>
        <SiteIndex />
      </SiteShell>
    </Suspense>
  );
}
