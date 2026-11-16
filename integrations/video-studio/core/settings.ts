import { eq } from "drizzle-orm";
import type { Actor } from "../../../src/core/actor";
import type { Db } from "../../../src/core/db/client";
import { forbidden, invalid } from "../../../src/core/errors";
import { PRODUCTION_DEFAULTS, productionSchema, type Production } from "./production";
import { studioSettings } from "./schema";

/** 工坊的成片设置默认值。只有站长能改；项目里的单独设置见 StudioProjects.setProduction。 */
export class StudioSettings {
  constructor(private db: Db) {}

  production(): Production {
    const row = this.db.select().from(studioSettings).where(eq(studioSettings.id, 1)).get();
    // 早于这项设置的版本存下来的值可能缺项，缺的按默认补上
    return { ...PRODUCTION_DEFAULTS, ...(row?.production ?? {}) };
  }

  saveProduction(actor: Actor, value: unknown): Production {
    if (actor.kind !== "owner") throw forbidden("只有站长可以修改成片设置。");
    const parsed = productionSchema.safeParse(value);
    if (!parsed.success) throw invalid("成片设置的数值超出范围。", parsed.error.flatten());
    this.db.insert(studioSettings).values({ id: 1, production: parsed.data }).onConflictDoUpdate({ target: studioSettings.id, set: { production: parsed.data } }).run();
    return this.production();
  }
}
