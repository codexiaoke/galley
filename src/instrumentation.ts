/**
 * 服务启动时运行一次。在这里开启邮件通知：配置了 SMTP 才开，没配置时什么都不做。
 */
export async function register() {
  // 邮件只能在 Node.js 里发。
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { mailConfig, smtpSender, startNotifications } = await import("./core/services/notify");
  const { getDb } = await import("./core/db/client");
  const config = mailConfig();
  if (!config) return;
  startNotifications(getDb(), smtpSender(config));
  console.log(`[galley] 邮件通知已开启，发给 ${config.to}`);
}
