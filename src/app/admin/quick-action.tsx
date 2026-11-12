"use client";

import { useTransition, type ReactNode } from "react";
import type { FormState } from "./actions";
import { useToast } from "./toast";
import { buttonClass, type ButtonVariant } from "./ui";

/**
 * 点一下直接生效的小操作，比如"标为已读"。不弹确认框：这类操作没有风险，点错了再点回来就行。
 * 会删除东西或者不好撤回的操作不要用它，用 ModalForm 先确认。
 */
export function QuickAction({
  action,
  fields,
  successMessage,
  variant = "link",
  children,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  successMessage: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const data = new FormData();
          for (const [name, value] of Object.entries(fields)) data.set(name, value);
          const result = await action({}, data);
          toast(result.ok ? successMessage : (result.error ?? "操作没有成功"));
        })
      }
      className={buttonClass(variant)}
    >
      {children}
    </button>
  );
}
