/**
 * 在命令行接入一个 Agent，打印它的访问密钥。
 * 用法：pnpm agent:create <名称>
 * 适合还没有配置后台密码、或者在服务器上直接操作的场景。
 */
import { OWNER } from "../src/core/actor";
import { getDb } from "../src/core/db/client";
import { createAgent } from "../src/core/services/agents";

const name = process.argv[2];
if (!name) {
  console.error("用法：pnpm agent:create <名称>");
  process.exit(1);
}
const { agent, token } = createAgent(getDb(), OWNER, name);
console.log(`已接入「${agent.name}」。访问密钥只显示这一次：\n\n${token}\n`);
