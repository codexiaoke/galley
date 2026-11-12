"use client";

import { useActionState } from "react";
import { decide, login, type FormState } from "./actions";
import { buttonClass, INPUT } from "./ui";

const initial: FormState = {};

function ErrorText({ state }: { state: FormState }) {
  return state.error ? <p className="rounded-md bg-a-danger-soft px-3 py-2 text-a-danger">{state.error}</p> : null;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="space-y-4">
      <input name="password" type="password" required autoFocus placeholder="管理员密码" className={INPUT} />
      <ErrorText state={state} />
      <button disabled={pending} className={`${buttonClass("primary")} w-full !py-2`}>
        登录
      </button>
    </form>
  );
}

/** 审阅页右侧的结论表单：批准或打回。 */
export function DecisionForm({ changeSetId, openComments = 0 }: { changeSetId: string; openComments?: number }) {
  const [state, action, pending] = useActionState(decide, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="changeSetId" value={changeSetId} />
      <textarea name="note" rows={4} placeholder="给 Agent 的意见（打回时会出现在它的待办里）" className={INPUT} />
      {openComments > 0 && (
        <p className="text-xs leading-relaxed text-a-muted">
          有 {openComments} 条批注还没处理。打回的话它们会一起交给 Agent；批准的话内容按现在的样子上线，批注留作记录。
        </p>
      )}
      <ErrorText state={state} />
      <div className="flex gap-2">
        <button name="decision" value="approve" disabled={pending} className={`${buttonClass("primary")} flex-1 !py-2`}>
          批准并上线
        </button>
        <button name="decision" value="reject" disabled={pending} className={`${buttonClass("secondary")} !py-2`}>
          打回
        </button>
      </div>
    </form>
  );
}
