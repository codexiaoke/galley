import { Suspense } from "react";
import { SiteIndex } from "./site-index";

export default function Home() {
  return (
    <div className="galley-site flex-1">
      <Suspense fallback={null}>
        <SiteIndex />
      </Suspense>
    </div>
  );
}
