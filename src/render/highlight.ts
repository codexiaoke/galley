import type { Element, Root } from "hast";
import { createCssVariablesTheme, createHighlighterCoreSync, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import c from "shiki/langs/c.mjs";
import cpp from "shiki/langs/cpp.mjs";
import cypher from "shiki/langs/cypher.mjs";
import css from "shiki/langs/css.mjs";
import diff from "shiki/langs/diff.mjs";
import dockerfile from "shiki/langs/dockerfile.mjs";
import go from "shiki/langs/go.mjs";
import html from "shiki/langs/html.mjs";
import ini from "shiki/langs/ini.mjs";
import java from "shiki/langs/java.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import jsx from "shiki/langs/jsx.mjs";
import kotlin from "shiki/langs/kotlin.mjs";
import markdown from "shiki/langs/markdown.mjs";
import nginx from "shiki/langs/nginx.mjs";
import php from "shiki/langs/php.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import sparql from "shiki/langs/sparql.mjs";
import sql from "shiki/langs/sql.mjs";
import swift from "shiki/langs/swift.mjs";
import toml from "shiki/langs/toml.mjs";
import tsx from "shiki/langs/tsx.mjs";
import turtle from "shiki/langs/turtle.mjs";
import typescript from "shiki/langs/typescript.mjs";
import vue from "shiki/langs/vue.mjs";
import xml from "shiki/langs/xml.mjs";
import yaml from "shiki/langs/yaml.mjs";
import { parseLineRanges } from "./lines";

/**
 * 代码高亮。
 *
 * 用同步的高亮器：正文渲染是同步的，后台编辑页的实时预览也在浏览器里跑同一份代码。
 * 配色不写死在这里，每类记号只输出一个样式变量（--code-keyword 等），具体颜色由样式表按
 * 浅色、深色阅读模式分别给出，和纸张的配色放在一起调。
 */

const theme = createCssVariablesTheme({ name: "galley", variablePrefix: "--code-", fontStyle: true });

let highlighter: HighlighterCore | undefined;
function getHighlighter() {
  highlighter ??= createHighlighterCoreSync({
    themes: [theme],
    langs: [
      bash, c, cpp, css, cypher, diff, dockerfile, go, html, ini, java, javascript, json, jsx, kotlin,
      markdown, nginx, php, python, rust, sparql, sql, swift, toml, tsx, turtle, typescript, vue, xml, yaml,
    ],
    // 少数语法规则 JavaScript 的正则表达不了，跳过这些规则，不让整段代码失败。
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

/** 代码框标题栏上显示的语言名。没有列出的直接显示作者写的名字。 */
const LANGUAGE_NAMES: Record<string, string> = {
  ts: "TypeScript", typescript: "TypeScript", tsx: "TSX", js: "JavaScript", javascript: "JavaScript", jsx: "JSX",
  json: "JSON", bash: "Bash", sh: "Shell", shell: "Shell", zsh: "Shell", shellscript: "Shell", console: "Shell",
  py: "Python", python: "Python", go: "Go", golang: "Go", rs: "Rust", rust: "Rust", sql: "SQL", css: "CSS",
  html: "HTML", yaml: "YAML", yml: "YAML", toml: "TOML", diff: "Diff", dockerfile: "Dockerfile", docker: "Dockerfile",
  md: "Markdown", markdown: "Markdown", java: "Java", swift: "Swift", kt: "Kotlin", kotlin: "Kotlin", php: "PHP",
  c: "C", cpp: "C++", "c++": "C++", nginx: "Nginx", ini: "INI", xml: "XML", vue: "Vue", text: "", txt: "", plain: "",
  turtle: "Turtle", ttl: "Turtle", sparql: "SPARQL", rq: "SPARQL", cypher: "Cypher",
};

export const languageName = (lang?: string | null) => (lang ? (LANGUAGE_NAMES[lang.toLowerCase()] ?? lang) : "");

const ALIASES: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", console: "bash", "c++": "cpp", docker: "dockerfile", ttl: "turtle", rq: "sparql" };

/**
 * 把代码转成带高亮的语法树：pre > code > 每行一个 span.line（带 data-line 行号）。
 * highlight 里的行号会多一个 highlighted 类，用来标出作者要读者注意的几行。
 * 认不出的语言按纯文本处理，仍然分行，行高亮照样有效。
 */
export function highlightCode(code: string, lang: string | null | undefined, highlight: Set<number> = new Set()): Element {
  const h = getHighlighter();
  const wanted = (lang ?? "").toLowerCase();
  const resolved = ALIASES[wanted] ?? wanted;
  const known = !!resolved && h.getLoadedLanguages().includes(resolved);
  const root = h.codeToHast(code.replace(/\n$/, ""), {
    lang: known ? resolved : "text",
    theme: "galley",
    transformers: [
      {
        line(node, line) {
          node.properties["data-line"] = line;
          if (highlight.has(line)) this.addClassToHast(node, "highlighted");
        },
      },
    ],
  }) as Root;
  const pre = root.children.find((n): n is Element => n.type === "element" && n.tagName === "pre");
  if (!pre) throw new Error("代码高亮没有生成 pre 元素");
  // 去掉 shiki 自带的底色和字色，交给样式表。
  delete pre.properties.style;
  pre.properties.className = ["galley-code-pre"];
  delete pre.properties.tabindex;
  return pre;
}

/**
 * 代码块围栏后面的附加说明，比如 ```ts title="src/app.ts" {2,4-6}
 * - title：标题栏上显示的文件名
 * - 花括号里的行号：要高亮的行
 */
export function parseCodeMeta(meta: string | null | undefined): { title?: string; highlight: Set<number>; run: boolean } {
  const text = meta ?? "";
  const title = /title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(text);
  const lines = /\{([\d,\s-]+)\}/.exec(text);
  // 单独的一个词 run：读者可以运行这段代码（只支持 JavaScript，见 client/run-sandbox.ts）
  const run = /(^|\s)run(\s|$)/.test(text.replace(/title=(?:"[^"]*"|'[^']*'|\S+)/, ""));
  return { title: title ? (title[1] ?? title[2] ?? title[3]) : undefined, highlight: parseLineRanges(lines?.[1] ?? ""), run };
}

/** 可以在读者浏览器里运行的语言 */
export const RUNNABLE_LANGS = ["js", "javascript", "mjs"];
