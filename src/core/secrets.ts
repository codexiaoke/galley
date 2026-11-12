import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./db/client";

/**
 * 加密保存在数据库里的少量机密（目前只有发邮件用的 SMTP 密码）。
 *
 * 密钥不放在数据库里：优先用环境变量 GALLEY_SECRET_KEY，没有设置时在数据目录里生成一个
 * .secret-key 文件（只有当前用户能读）。备份文件里只有数据库，不带这个密钥，
 * 所以别人拿到备份也解不开密码；恢复到另一台服务器时，密码要重新填一次。
 */

const KEY_FILE = ".secret-key";

function secretKey(): Buffer {
  const fromEnv = process.env.GALLEY_SECRET_KEY?.trim();
  if (fromEnv) return createHash("sha256").update(fromEnv).digest();
  const file = path.join(dataDir(), KEY_FILE);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDir(), { recursive: true });
    // wx：文件已经存在时不覆盖，避免两个进程同时启动时互相改掉对方刚生成的密钥。
    try {
      fs.writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  return createHash("sha256").update(fs.readFileSync(file, "utf8").trim()).digest();
}

/** 加密一段文字。结果是 v1: 开头的一串字符，可以直接存进数据库。 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

/** 解密。密钥对不上（比如备份恢复到了另一台服务器）或者内容被改过时返回 null。 */
export function decryptSecret(stored: string): string | null {
  if (!stored.startsWith("v1:")) return null;
  try {
    const raw = Buffer.from(stored.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
