import fs from "node:fs";
import path from "node:path";
import { OWNER } from "./actor";
import { createBackup } from "./backup";
import { dataDir, type Db } from "./db/client";
import { getSiteSettings } from "./services/settings";

/**
 * 自动备份：每天在服务器上留一份完整备份，放在数据目录的 backups/ 里，只留最近几份。
 *
 * 不定在某个钟点，而是每小时看一眼"最近一份是不是超过一天了"：
 * 服务器重启、停机过几天，回来后第一次检查就会补上，不会因为错过了那个钟点就一直不备份。
 *
 * 这份备份和数据在同一台机器上，防的是改错、删错和恢复错，防不了整台服务器坏掉。
 * 后台的备份页可以把它们下载下来，另存到别处。
 */

export const KEEP = 7;
const DAY = 24 * 60 * 60 * 1000;
const NAME = /^galley-backup-\d{8}-\d{6}\.tar\.gz$/;

export const backupsDir = () => path.join(dataDir(), "backups");

export type StoredBackup = { name: string; size: number; createdAt: Date };

/** 服务器上存着的自动备份，新的在前。 */
export function listStoredBackups(): StoredBackup[] {
  const dir = backupsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => NAME.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** 按文件名找一份自动备份。名字不对（比如带了 ../）或者不存在时返回 undefined。 */
export function storedBackupPath(name: string): string | undefined {
  if (!NAME.test(name)) return undefined;
  const file = path.join(backupsDir(), name);
  return fs.existsSync(file) ? file : undefined;
}

/** 现在备份一份，删掉超出份数的旧备份。返回新备份的文件名。 */
export function writeAutoBackup(db: Db): string {
  const { filename, archive } = createBackup(db, OWNER);
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });
  // 先写到临时文件再改名：写到一半断电，也不会留下一份看起来完好、其实残缺的备份。
  const temp = path.join(dir, `.${filename}.part`);
  fs.writeFileSync(temp, archive);
  fs.renameSync(temp, path.join(dir, filename));
  for (const old of listStoredBackups().slice(KEEP)) fs.rmSync(path.join(dir, old.name), { force: true });
  return filename;
}

/** 该不该备份了：开着自动备份，并且最近一份已经超过一天（或者还没有）。 */
export function backupDue(db: Db, now = new Date()): boolean {
  if (getSiteSettings(db).autoBackup === "off") return false;
  const latest = listStoredBackups()[0];
  return !latest || now.getTime() - latest.createdAt.getTime() >= DAY - 10 * 60 * 1000;
}

/** 开始定时检查。返回一个函数，调用它停止。失败只记日志，下个小时再试。 */
export function startAutoBackup(db: () => Db, options: { intervalMs?: number; firstDelayMs?: number } = {}) {
  const check = () => {
    try {
      const current = db();
      if (backupDue(current)) console.log(`[galley] 自动备份完成：${writeAutoBackup(current)}`);
    } catch (e) {
      console.error("[galley] 自动备份失败：", e);
    }
  };
  // 启动后稍等一会儿再做第一次检查，不和启动抢资源。
  const first = setTimeout(check, options.firstDelayMs ?? 60_000);
  const timer = setInterval(check, options.intervalMs ?? 60 * 60 * 1000);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
