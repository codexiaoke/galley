import { randomBytes } from "node:crypto";

// Crockford base32 的小写形式：去掉了容易混淆的 i、l、o、u。
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function randomId(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}

/** 知识块编号：8 位随机字符。Agent 编造不出来，写错了一定会被校验发现。 */
export const newBlockId = () => randomId(8);

/** 其他对象的编号。 */
export const newId = () => randomId(12);

export const BLOCK_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{8}$/;
