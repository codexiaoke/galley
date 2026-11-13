/**
 * 服务启动时运行一次。在这里开始监听需要通知站长的事。
 * 发不发邮件、发给谁，在发的那一刻按后台的邮件设置（或者环境变量）决定，没有配置时什么都不发。
 * 同时开始每天的自动备份（见 core/auto-backup.ts）。
 */
export async function register() {
  // 邮件只能在 Node.js 里发。
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { configuredSender, startNotifications } = await import("./core/services/notify");
  const { getDb } = await import("./core/db/client");
  const db = getDb();
  startNotifications(db, configuredSender(db));
  const { startAutoBackup } = await import("./core/auto-backup");
  // 传函数而不是连接本身：恢复备份时会关掉旧连接，之后要用新的。
  startAutoBackup(getDb);
}
