/**
 * 最小的 tar 读写，只够备份用：普通文件，名字是不超过 100 个字节的相对路径。
 * 不引入第三方库：格式很简单，而且读的时候要自己把关，不能让压缩包里的路径写到数据目录外面去。
 */

export type TarEntry = { name: string; data: Buffer };

const BLOCK = 512;

/** 名字必须是安全的相对路径：不以斜杠开头，不含 ..，不含反斜杠和控制字符。 */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.startsWith("/") || name.includes("\\") || /[\x00-\x1f]/.test(name)) return false;
  return name.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function header(name: string, size: number, mtime: number): Buffer {
  const buf = Buffer.alloc(BLOCK);
  const nameBytes = Buffer.from(name, "utf8");
  if (nameBytes.length > 100) throw new Error(`文件名太长，放不进备份：${name}`);
  nameBytes.copy(buf, 0);
  buf.write("0000644\0", 100, "ascii"); // 权限
  buf.write("0000000\0", 108, "ascii"); // 用户
  buf.write("0000000\0", 116, "ascii"); // 用户组
  buf.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  buf.write(Math.floor(mtime / 1000).toString(8).padStart(11, "0") + "\0", 136, "ascii");
  buf.write("        ", 148, "ascii"); // 计算校验和时，校验和这一栏按 8 个空格算
  buf.write("0", 156, "ascii"); // 普通文件
  buf.write("ustar\0", 257, "ascii");
  buf.write("00", 263, "ascii");
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return buf;
}

export function packTar(entries: TarEntry[], mtime = Date.now()): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    if (!isSafeEntryName(entry.name)) throw new Error(`不安全的文件名：${entry.name}`);
    parts.push(header(entry.name, entry.data.length, mtime), entry.data);
    const padding = (BLOCK - (entry.data.length % BLOCK)) % BLOCK;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

/** 读出压缩包里的全部文件。格式不对、名字不安全时抛错。 */
export function unpackTar(archive: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  while (offset + BLOCK <= archive.length) {
    const head = archive.subarray(offset, offset + BLOCK);
    if (head.every((byte) => byte === 0)) break;
    const name = head.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const size = parseInt(head.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim(), 8);
    const type = String.fromCharCode(head[156]);
    if (!Number.isFinite(size) || size < 0) throw new Error("备份文件已损坏。");
    offset += BLOCK;
    if (offset + size > archive.length) throw new Error("备份文件不完整。");
    // 只接受普通文件。目录、链接之类一律不要：备份里不该有，出现了就说明不是我们生成的。
    if (type !== "0" && type !== "\0") throw new Error(`备份里有不认识的内容：${name}`);
    if (!isSafeEntryName(name)) throw new Error(`备份里有不安全的文件名：${name}`);
    entries.push({ name, data: Buffer.from(archive.subarray(offset, offset + size)) });
    offset += Math.ceil(size / BLOCK) * BLOCK;
  }
  return entries;
}
