import Link from "next/link";
import { connection } from "next/server";
import { Fragment, Suspense } from "react";
import { getDb } from "@/core/db/client";
import { searchPublished, searchTerms } from "@/core/services/search";
import { SimplePage } from "../simple-page";

const two = (n: number) => String(n).padStart(2, "0");
const formatDate = (d: Date | null) => (d ? `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}` : "");

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <SimplePage title="搜索">
      <Suspense fallback={null}>
        <Search searchParams={searchParams} />
      </Suspense>
    </SimplePage>
  );
}

/** 把文字里命中搜索词的部分标出来。 */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return parts.map((part, i) => (terms.includes(part.toLowerCase()) ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>));
}

async function Search({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  await connection();
  const results = query ? searchPublished(getDb(), query) : [];
  const terms = searchTerms(query);
  return (
    <>
      {/* 普通的表单：提交后搜索词在网址里，结果页可以收藏和分享 */}
      <form className="galley-search" action="/search">
        <input name="q" type="search" defaultValue={query} placeholder="在文章里找" autoFocus={!query} aria-label="搜索词" />
        <button>搜索</button>
      </form>
      {query &&
        (results.length === 0 ? (
          <p className="galley-empty">没有找到提到「{query}」的文章。</p>
        ) : (
          <ul className="galley-list galley-results">
            {results.map((post) => (
              <li key={post.slug}>
                <Link href={`/posts/${post.slug}`} className="galley-row">
                  <span className="galley-row-main">
                    <span className="galley-row-title">
                      <Marked text={post.title} terms={terms} />
                    </span>
                    {post.snippet && (
                      <span className="galley-row-summary">
                        <Marked text={post.snippet} terms={terms} />
                      </span>
                    )}
                  </span>
                  <span className="galley-row-meta">
                    <time>{formatDate(post.publishedAt)}</time>
                    {post.categoryName && <span className="galley-row-category">{post.categoryName}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </>
  );
}
