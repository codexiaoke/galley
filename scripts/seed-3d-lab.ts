import { bindLabMaterials } from "./3d-lab-materials";
import { bindLabLabels } from "./3d-lab-labels";
import { prepareBody } from "../src/core/prepare";
import { bindLabGpu, labAssets } from "./3d-lab-assets";
import path from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { OWNER } from "../src/core/actor";
import { getDb } from "../src/core/db/client";
import { documents, categories } from "../src/core/db/schema";
import { createCategory } from "../src/core/services/categories";
import { openChangeSet, submitChangeSet, decideChangeSet } from "../src/core/services/changeSets";
import { saveDocument } from "../src/core/services/documents";
import { labFixture } from "./3d-lab-fixtures";

// 固定写入实验目录，绝不读取正式数据库或已有工坊的数据。
async function main() {
const directory = path.join(process.cwd(), ".lab/blog");
process.env.GALLEY_DATA_DIR = directory;
mkdirSync(directory, { recursive: true });
if (!existsSync(".env.local")) writeFileSync(".env.local", `GALLEY_DATA_DIR=${directory}\nGALLEY_ADMIN_PASSWORD=${randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
const db = getDb();
const lab = labFixture();
const existing = db.select().from(documents).all().find((doc) => doc.slug === lab.slug);
const assets = labAssets(db);
const body = bindLabGpu(db, bindLabLabels(db, bindLabMaterials(db, lab.body.replaceAll("__MODEL__", assets.model).replaceAll("__TEXTURE__", assets.texture))));
await prepareBody(body);
if (!db.select().from(categories).all().some((category) => category.slug === "3d-lab")) createCategory(db, OWNER, { name: "3D 演示实验", slug: "3d-lab" });
const cs = openChangeSet(db, OWNER, { kind: "article", title: lab.name });
const result = saveDocument(db, OWNER, {
  documentId: existing?.id, changeSetId: cs.id, kind: "article", category: "3d-lab", slug: lab.slug,
  title: lab.title, summary: lab.summary, body,
});
if (!result.saved) throw new Error(JSON.stringify(result.issues));
submitChangeSet(db, OWNER, cs.id);
decideChangeSet(db, OWNER, cs.id, "approve");
db.$client.close();
console.log(`实验文章已写入 .lab/blog：/posts/${lab.slug}`);

}
void main();
