"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { saveSkillEdit } from "../../../actions";
import { useToast } from "../../../toast";
import { buttonClass, Field, INPUT } from "../../../ui";

/** 技能的编辑表单。新建时可以填名字；修改已有的技能时名字不能改（Agent 靠名字找它）。 */
export function SkillForm({ skill, isNew }: { skill: { name: string; description: string; body: string }; isNew: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  // 有没保存的修改时，关闭或刷新页面前提醒一下。
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form
      onChange={() => {
        setDirty(true);
        setError(undefined);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          const result = await saveSkillEdit({}, data);
          if (!result.ok) return setError(result.error);
          setDirty(false);
          toast("技能已保存，Agent 下次连接时读到新的内容");
          if (isNew) router.push(`/admin/skills/${String(data.get("name"))}`);
          else (form.elements.namedItem("note") as HTMLInputElement).value = "";
        });
      }}
    >
      {/* 这一行固定在顶部：技能的内容很长，不用滚回最上面才能保存 */}
      <div className="sticky top-0 z-10 -mx-2 mb-6 flex flex-wrap items-center justify-between gap-3 bg-a-bg/95 px-2 py-3 backdrop-blur-sm">
        <Link href="/admin/skills" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-a-muted transition-colors hover:bg-a-subtle hover:text-a-text">
          <ArrowLeft size={15} />
          返回技能列表
        </Link>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-a-muted">有未保存的修改</span>}
          <button disabled={pending || !dirty} className={buttonClass("primary")}>
            {pending && <LoaderCircle size={15} className="animate-spin" />}
            保存
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {isNew ? (
          <Field label="名字" hint="Agent 用这个名字来读取它。只能用小写字母、数字和连字符，保存后不能改。">
            <input name="name" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="例如 fact-check" className={`${INPUT} max-w-sm font-mono`} />
          </Field>
        ) : (
          <>
            <input type="hidden" name="name" value={skill.name} />
            <h1 className="font-mono text-[1.6rem] font-semibold leading-tight tracking-tight">{skill.name}</h1>
          </>
        )}
        <Field label="一句话说明" hint="讲什么、什么时候该读它。Agent 先看到的只有这一句，靠它决定要不要读全文。">
          <input name="description" required defaultValue={skill.description} className={INPUT} />
        </Field>
        <Field label="内容" hint="用 Markdown 写。写成对 Agent 说的话：要做什么、不要做什么、为什么。写 {{components}} 的地方会自动换成当前可用的组件清单。">
          <textarea
            name="body"
            required
            defaultValue={skill.body}
            spellCheck={false}
            className="block min-h-[26rem] w-full resize-y rounded-md bg-a-subtle/70 p-4 font-mono text-[13px] leading-[1.75] text-a-text shadow-[inset_0_0_0_1px_var(--a-border)] transition-shadow duration-100 focus:bg-a-surface focus:shadow-[inset_0_0_0_1px_var(--a-primary),0_0_0_3px_var(--a-primary-soft)] focus:outline-none"
            style={{ fieldSizing: "content" } as CSSProperties}
          />
        </Field>
        <Field label="这次改了什么" hint="可以不填。会记在修改记录里，方便以后回看。">
          <input name="note" placeholder="例如 加了一条：开头不要铺垫" className={INPUT} />
        </Field>
        {error && <p className="rounded-md bg-a-danger-soft px-3 py-2 text-a-danger">{error}</p>}
      </div>
    </form>
  );
}
