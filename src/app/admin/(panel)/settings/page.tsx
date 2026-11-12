import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { describeMailConfig, mailConfig } from "@/core/services/notify";
import { getSiteSettings } from "@/core/services/settings";
import { requireOwner } from "../../auth";
import { PageHeader, PageSkeleton } from "../../ui";
import { SettingsForm } from "./form";

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await requireOwner();
  return (
    <>
      <PageHeader title="站点设置" description="读者看到的网站名，以及给搜索引擎和订阅源用的信息。" />
      <SettingsForm settings={getSiteSettings(getDb())} mail={describeMailConfig(mailConfig())} />
    </>
  );
}
