import type { Root } from "mdast";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import type { RefMode } from "../db/schema";
import { BLOCK_ID_PATTERN } from "../ids";
import { getComponent } from "./components";

export type ParsedRef = {
  mode: RefMode;
  blockId: string;
  ordinal: number;
  /** 依据引用：文章自己的那段文字 */
  spanText?: string;
  /** 取值嵌入：取哪个命名取值 */
  valueKey?: string;
  /** 来自哪个标记，以及组件参数名（组件引用数据块时） */
  directive: string;
  param?: string;
  line?: number;
};

export type MarkupIssue = { level: "error" | "warning"; message: string; line?: number };

export type ParsedMarkup = { refs: ParsedRef[]; issues: MarkupIssue[] };

type DirectiveNode = {
  type: "textDirective" | "leafDirective" | "containerDirective";
  name: string;
  attributes?: Record<string, string | null | undefined> | null;
  children: unknown[];
  position?: { start: { line: number } };
};

const FORM_OF = { textDirective: "text", leafDirective: "leaf", containerDirective: "container" } as const;
const WRITTEN_AS = { text: ":", leaf: "::", container: ":::" } as const;

export function isDirective(node: { type: string }): boolean {
  return node.type === "textDirective" || node.type === "leafDirective" || node.type === "containerDirective";
}

/** 行文里单独出现的 :name，没有方括号也没有参数，按普通文字处理。 */
export function isBareText(d: { type: string; attributes?: object | null; children: unknown[] }): boolean {
  return d.type === "textDirective" && Object.keys(d.attributes ?? {}).length === 0 && d.children.length === 0;
}

export const markdownProcessor = () => unified().use(remarkParse).use(remarkDirective);

export function parseToTree(body: string): Root {
  return markdownProcessor().parse(body) as Root;
}

/**
 * 解析正文，取出其中对知识块的引用，并做不依赖数据库的检查。
 * 知识块是否存在、类型是否匹配等检查在 services/documents.ts 里做。
 */
export function parseMarkup(body: string): ParsedMarkup {
  const refs: ParsedRef[] = [];
  const issues: MarkupIssue[] = [];
  let ordinal = 0;

  const error = (message: string, line?: number): void => void issues.push({ level: "error", message, line });
  const warn = (message: string, line?: number): void => void issues.push({ level: "warning", message, line });

  const addRef = (ref: Omit<ParsedRef, "ordinal">) => {
    if (!BLOCK_ID_PATTERN.test(ref.blockId)) {
      error(`"${ref.blockId}" 不是合法的知识块编号。编号是 8 位小写字母和数字。`, ref.line);
      return;
    }
    refs.push({ ...ref, ordinal: ordinal++ });
  };

  const handle = (d: DirectiveNode): void => {
    const form = FORM_OF[d.type];
    const attrs = d.attributes ?? {};
    const line = d.position?.start.line;

    // 行文里单独出现的 :name（没有方括号也没有参数）是普通文字，例如 "key:value"。
    if (isBareText(d)) return;

    const expectForm = (expected: keyof typeof WRITTEN_AS) => {
      if (form === expected) return true;
      error(`${d.name} 应该写成 ${WRITTEN_AS[expected]}${d.name}，而不是 ${WRITTEN_AS[form]}${d.name}。`, line);
      return false;
    };

    if (d.name === "cite") {
      if (!expectForm("text")) return;
      const spanText = toString(d as never).trim();
      const ids = (attrs.b ?? "").split(/\s+/).filter(Boolean);
      if (!spanText) return error("cite 的方括号里需要有文字，例如 :cite[这段文字]{b=编号}。", line);
      if (ids.length === 0) return error("cite 缺少知识块编号，例如 :cite[这段文字]{b=编号}。", line);
      for (const blockId of ids) addRef({ mode: "cite", blockId, spanText, directive: "cite", line });
      return;
    }

    if (d.name === "value") {
      if (!expectForm("text")) return;
      if (!attrs.b || !attrs.key) return error("value 需要 b 和 key 两个参数，例如 :value{b=编号 key=version}。", line);
      addRef({ mode: "value", blockId: attrs.b, valueKey: attrs.key, directive: "value", line });
      return;
    }

    if (d.name === "block") {
      if (!expectForm("leaf")) return;
      if (!attrs.id) return error("block 缺少 id 参数，例如 ::block{id=编号}。", line);
      addRef({ mode: "embed", blockId: attrs.id, directive: "block", line });
      return;
    }

    const component = getComponent(d.name);
    if (!component) {
      // 未登记的名称按普通文字处理。只有看起来像是有意写的标记才提醒。
      const looksIntentional = form !== "text" || Object.keys(attrs).length > 0 || d.children.length > 0;
      if (looksIntentional) warn(`"${d.name}" 不是已登记的标记或组件，会被当作普通文字显示。`, line);
      return;
    }
    if (!expectForm(component.form)) return;

    const parsed = component.params.safeParse(attrs);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "参数"}: ${i.message}`).join("；");
      return error(`${component.name} 的参数不合法：${detail}`, line);
    }
    for (const param of Object.keys(component.blockParams ?? {})) {
      const blockId = (parsed.data as Record<string, unknown>)[param];
      if (typeof blockId === "string") addRef({ mode: "embed", blockId, directive: component.name, param, line });
    }
  };

  // 注意：访问函数不能有返回值，unist-util-visit 会把返回的数字当作"跳到第几个子节点"。
  visit(parseToTree(body), (node) => {
    if (isDirective(node)) handle(node as unknown as DirectiveNode);
  });

  return { refs, issues };
}
