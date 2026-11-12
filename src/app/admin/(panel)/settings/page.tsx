import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { getMailSettings, resolveMailConfig } from "@/core/services/mail";
import { getSiteSettings } from "@/core/services/settings";
import { requireOwner } from "../../auth";
import { PageHeader, PageSkeleton } from "../../ui";
import { SettingsForm } from "./form";
import { MailForm } from "./mail-form";

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await requireOwner();
  const db = getDb();
  const settings = getSiteSettings(db);
  const active = resolveMailConfig(db);
  return (
    <>
      <PageHeader title="站点设置" description="读者看到的网站名，给搜索引擎和订阅源用的信息，以及邮件通知。" />
      <SettingsForm settings={settings} />
      <MailForm
        mail={getMailSettings(db)}
        notify={{ review: settings.notifyReview, messages: settings.notifyMessages }}
        active={active && { source: active.source, server: active.server, to: active.to }}
      />
    </>
  );
}
