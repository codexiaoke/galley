import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 博客和视频工坊的依赖方向（见 docs/design-studio-split.md）：
 * - 博客（src/）不引用工坊（integrations/）的任何东西；
 * - 工坊只引用两边的约定（src/contract/），以及下面这几个暂时共用的模块。
 *   往这张单子里加东西之前，先想想它是不是该放进 src/contract/，或者工坊自己写一份。
 */
const STUDIO_MAY_USE = new Set([
  "src/contract/narration",
  "src/core/actor",
  "src/core/errors",
  "src/core/ids",
  "src/core/secrets",
  "src/core/db/client",
  "src/core/db/schema",
  "src/core/services/agents",
  "src/core/services/skills",
  "src/core/tools",
  "src/app/admin/actions",
  "src/app/admin/mark",
  "src/app/admin/modal",
  "src/app/admin/select",
  "src/app/admin/toast",
  "src/app/admin/ui",
  "src/render/client/guide-focus",
]);

const ROOT = process.cwd();
const IMPORT = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g;

function sources(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (name === "node_modules") return [];
    if (statSync(path.join(ROOT, rel)).isDirectory()) return sources(rel);
    return /\.(ts|tsx|mts)$/.test(name) ? [rel] : [];
  });
}

function imports(file: string): string[] {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  return [...text.matchAll(IMPORT)].map(([, spec]) =>
    (spec.startsWith("@/") ? path.join("src", spec.slice(2)) : path.normalize(path.join(path.dirname(file), spec))).replace(/\.(js|ts|tsx)$/, ""),
  );
}

describe("博客和视频工坊的依赖方向", () => {
  it("博客不引用工坊", () => {
    const wrong = sources("src").flatMap((file) => imports(file).filter((target) => target.startsWith("integrations")).map((target) => `${file} → ${target}`));
    expect(wrong).toEqual([]);
  });

  it("工坊只引用约定和单子上的共用模块", () => {
    const wrong = sources("integrations").flatMap((file) =>
      imports(file).filter((target) => target.startsWith("src") && !STUDIO_MAY_USE.has(target)).map((target) => `${file} → ${target}`),
    );
    expect(wrong).toEqual([]);
  });
});
