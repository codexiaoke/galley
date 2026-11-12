"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import type { SiteSettings } from "@/core/services/settings";
import { saveSettings, sendTestMail } from "../../actions";
import { useToast } from "../../toast";
import { Select } from "../../select";
import { buttonClass, Field, INPUT } from "../../ui";

/** 站点设置的表单。设置项不多，直接排在页面上，改完点保存。 */
type MailInfo = { server: string; to: string; from: string } | null;

/** 发一封测试邮件的按钮。 */
function TestMail() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await sendTestMail();
          toast(result.ok ? "测试邮件已发出，去收件箱看看" : (result.error ?? "没有发出去"));
        })
      }
      className={buttonClass("secondary")}
    >
      {pending && <LoaderCircle size={15} className="animate-spin" />}
      发一封测试邮件
    </button>
  );
}

const ON_OFF = (on: string, off: string) => [
  { value: "on", label: on },
  { value: "off", label: off },
];

export function SettingsForm({ settings, mail }: { settings: SiteSettings; mail: MailInfo }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <form
      className="max-w-xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await saveSettings({}, data);
          setError(result.ok ? undefined : result.error);
          if (result.ok) toast("设置已保存");
        });
      }}
    >
      <Field label="网站名" hint="显示在每个页面的左上角、浏览器标签和订阅源里。">
        <input name="name" required maxLength={40} defaultValue={settings.name} className={INPUT} />
      </Field>
      <Field label="一句话介绍" hint="给搜索引擎和订阅源用，不显示在页面上。可以不填。">
        <textarea name="description" rows={2} maxLength={200} defaultValue={settings.description} className={`${INPUT} resize-none`} />
      </Field>
      <Field label="作者" hint="订阅源里的署名。可以不填。">
        <input name="author" maxLength={60} defaultValue={settings.author} className={INPUT} />
      </Field>
      <Field label="网站地址" hint="读者访问这个站用的地址，例如 https://example.com。订阅源和站点地图里的链接以它开头；不填时用访问时的地址。">
        <input name="url" type="url" placeholder="https://" defaultValue={settings.url} className={INPUT} />
      </Field>
      <Field label="运营日志" hint="公开的 /log 页面，列出每一次上线的改动：做了什么、为什么、改了几轮。内容来自 Agent 写的改动说明，只列你批准过的。">
        <Select
          name="showLog"
          defaultValue={settings.showLog}
          options={[
            { value: "on", label: "公开，页脚里有入口" },
            { value: "off", label: "不公开" },
          ]}
        />
      </Field>
      <section className="space-y-5 border-t border-a-border pt-6">
        <div>
          <h2 className="font-semibold">邮件通知</h2>
          {mail ? (
            <p className="mt-1 text-xs leading-relaxed text-a-muted">
              通过 {mail.server} 发到 {mail.to}。几分钟里发生的事会合成一封，不会连着发好几封。
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-a-muted">
              还没有配置。在服务器的环境变量里设置 GALLEY_SMTP_URL（例如 smtps://用户名:密码@smtp.example.com:465）和 GALLEY_NOTIFY_TO（收通知的邮箱），重启之后生效。
            </p>
          )}
        </div>
        {mail && (
          <>
            <Field label="有改动等你审阅时">
              <Select name="notifyReview" defaultValue={settings.notifyReview} options={ON_OFF("发邮件", "不发")} />
            </Field>
            <Field label="有新留言时">
              <Select name="notifyMessages" defaultValue={settings.notifyMessages} options={ON_OFF("发邮件", "不发")} />
            </Field>
            <TestMail />
          </>
        )}
        {/* 没配置邮件时也要把原来的设置带上，否则保存会把它们改成默认值 */}
        {!mail && (
          <>
            <input type="hidden" name="notifyReview" value={settings.notifyReview} />
            <input type="hidden" name="notifyMessages" value={settings.notifyMessages} />
          </>
        )}
      </section>
      {error && <p className="rounded-md bg-a-danger-soft px-3 py-2 text-a-danger">{error}</p>}
      <button disabled={pending} className={buttonClass("primary")}>
        {pending && <LoaderCircle size={15} className="animate-spin" />}
        保存
      </button>
    </form>
  );
}
