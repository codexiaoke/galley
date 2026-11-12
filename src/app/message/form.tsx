"use client";

import { useState, useTransition } from "react";
import { sendMessage, type MessageState } from "./actions";

/** 留言表单。提交成功后整个表单换成一句回执。 */
export function MessageForm({ from }: { from?: string }) {
  const [state, setState] = useState<MessageState>({});
  const [pending, startTransition] = useTransition();

  if (state.ok) {
    return (
      <div className="galley-prose">
        <p>收到了，谢谢你。留了联系方式的话，站长可能会回复你。</p>
      </div>
    );
  }
  return (
    <form
      // 页面脚本还没加载好时点了提交，浏览器会按默认方式提交表单。写明用 POST，填的内容（包括密码）就不会出现在网址里。
      method="post"
      className="galley-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => setState(await sendMessage({}, data)));
      }}
    >
      {from && <input type="hidden" name="from" value={from} />}
      {/* 给自动提交的程序准备的字段：真人看不到它，也不会填。填了的提交不会被保存。 */}
      <div className="galley-form-trap" aria-hidden="true">
        <label>
          网站（请不要填写）
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label>
        <span>想说的话</span>
        <textarea name="body" required rows={6} maxLength={2000} />
      </label>
      <div className="galley-form-row">
        <label>
          <span>怎么称呼你</span>
          <input name="name" maxLength={40} autoComplete="nickname" />
        </label>
        <label>
          <span>联系方式（选填，想收到回复的话）</span>
          <input name="contact" maxLength={100} autoComplete="email" />
        </label>
      </div>
      {state.error && <p className="galley-form-error">{state.error}</p>}
      <button disabled={pending}>{pending ? "正在发送" : "发送"}</button>
    </form>
  );
}
