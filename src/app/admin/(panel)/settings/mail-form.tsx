"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import type { MailSettings } from "@/core/services/mail";
import { removeMailSettings, saveMail, sendTestMail } from "../../actions";
import { ModalForm } from "../../modal";
import { Select } from "../../select";
import { useToast } from "../../toast";
import { buttonClass, Field, INPUT } from "../../ui";

type Active = { source: "env" | "settings"; server: string; to: string } | null;

const ON_OFF = [
  { value: "on", label: "发邮件" },
  { value: "off", label: "不发" },
];

/**
 * 邮件通知的设置：发信用的 SMTP 服务器，以及要通知哪些事。
 * 密码不会回到浏览器里：存过就显示"已保存"，不修改就留空。
 */
export function MailForm({ mail, notify, active }: { mail: MailSettings; notify: { review: string; messages: string }; active: Active }) {
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();
  const toast = useToast();
  const fromEnv = active?.source === "env";

  return (
    <>
    <form
      // 页面脚本还没加载好时点了提交，浏览器会按默认方式提交表单。写明用 POST，填的内容（包括密码）就不会出现在网址里。
      method="post"
      className="mt-10 max-w-xl space-y-5 border-t border-a-border pt-8"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        startSaving(async () => {
          const result = await saveMail({}, data);
          setError(result.ok ? undefined : result.error);
          if (result.ok) {
            toast("邮件设置已保存");
            const password = form.elements.namedItem("password");
            if (password instanceof HTMLInputElement) password.value = "";
          }
        });
      }}
    >
      <div>
        <h2 className="font-semibold">邮件通知</h2>
        <p className="mt-1 text-xs leading-relaxed text-a-muted">
          有改动等你审阅、有新留言时发邮件给你。几分钟里发生的事会合成一封，不会连着发好几封。
          {active ? ` 现在通过 ${active.server} 发到 ${active.to}。` : " 现在还没有配置，不会发邮件。"}
        </p>
      </div>

      {fromEnv ? (
        <p className="rounded-md bg-a-subtle px-3 py-2.5 text-xs leading-relaxed text-a-muted">
          发信的服务器由服务器上的环境变量（GALLEY_SMTP_URL 等）配置，以那边为准，所以这里不能修改。想在这里管理，先去掉那些环境变量再重启。
        </p>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-[1fr_7rem]">
            <Field label="SMTP 服务器" hint="邮箱服务商给的发信服务器地址，例如 smtp.qq.com、smtp.163.com、smtp.gmail.com。">
              <input name="host" required defaultValue={mail.host} placeholder="smtp.example.com" className={INPUT} />
            </Field>
            <Field label="端口">
              <input name="port" type="number" required min={1} max={65535} defaultValue={mail.port} className={INPUT} />
            </Field>
          </div>
          <Field label="加密方式" hint="大多数服务商：465 端口选 SSL，587 端口选 STARTTLS。">
            <Select
              name="security"
              defaultValue={mail.security}
              options={[
                { value: "ssl", label: "SSL / TLS（常用 465 端口）" },
                { value: "starttls", label: "STARTTLS（常用 587 端口）" },
                { value: "none", label: "不加密（只在内网里用）" },
              ]}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="用户名" hint="通常就是你的邮箱地址。">
              <input name="user" defaultValue={mail.user} autoComplete="off" className={INPUT} />
            </Field>
            <Field
              label="密码"
              hint={
                mail.passwordUnreadable
                  ? "存过的密码在这台服务器上解不开了（多半是从备份恢复过来的），请重新填一次。"
                  : "QQ、163 这类邮箱填的是在邮箱设置里生成的授权码，不是登录密码。加密保存，不会显示出来。"
              }
            >
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder={mail.hasPassword && !mail.passwordUnreadable ? "已保存，不修改就留空" : ""}
                className={INPUT}
              />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="收通知的邮箱">
              <input name="to" type="email" required defaultValue={mail.to} className={INPUT} />
            </Field>
            <Field label="发件人" hint="可以不填，不填时用收件邮箱。有的服务商要求和用户名一致。">
              <input name="from" defaultValue={mail.from} placeholder="例如 博客 <me@example.com>" className={INPUT} />
            </Field>
          </div>
        </>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="有改动等你审阅时">
          <Select name="notifyReview" defaultValue={notify.review} options={ON_OFF} />
        </Field>
        <Field label="有新留言时">
          <Select name="notifyMessages" defaultValue={notify.messages} options={ON_OFF} />
        </Field>
      </div>

      {error && <p className="rounded-md bg-a-danger-soft px-3 py-2 text-a-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={saving} className={buttonClass("primary")}>
          {saving && <LoaderCircle size={15} className="animate-spin" />}
          保存邮件设置
        </button>
        <button
          type="button"
          disabled={testing || !active}
          title={active ? undefined : "先填好并保存，再发测试邮件"}
          onClick={() =>
            startTesting(async () => {
              const result = await sendTestMail();
              toast(result.ok ? "测试邮件已发出，去收件箱看看" : (result.error ?? "没有发出去"));
            })
          }
          className={buttonClass("secondary")}
        >
          {testing && <LoaderCircle size={15} className="animate-spin" />}
          发一封测试邮件
        </button>
      </div>
    </form>
      {/* 放在表单外面：确认框里有自己的表单，表单不能套表单 */}
      {!fromEnv && mail.host && (
        <div className="-ml-1.5 mt-2">
          <ModalForm
            triggerLabel="清除邮件设置"
            triggerVariant="linkDanger"
            title="清除邮件设置？"
            action={removeMailSettings}
            submitLabel="清除"
            submitVariant="danger"
            successMessage="邮件设置已清除"
          >
            <p>服务器、账号、密码和收件邮箱都会删掉，之后不再发通知邮件。</p>
          </ModalForm>
        </div>
      )}
    </>
  );
}
