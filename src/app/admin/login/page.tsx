import { redirect } from "next/navigation";
import { Suspense } from "react";
import { adminConfigured, isOwner } from "../auth";
import { LoginForm } from "../forms";
import { GalleyMark } from "../mark";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm rounded-xl border border-a-border bg-a-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <GalleyMark size={32} />
          <div>
            <h1 className="text-base font-semibold">Galley 后台</h1>
            <p className="text-xs text-a-muted">请输入管理员密码</p>
          </div>
        </div>
        <Suspense fallback={null}>
          <Login />
        </Suspense>
      </div>
    </div>
  );
}

async function Login() {
  if (await isOwner()) redirect("/admin");
  if (!adminConfigured()) {
    return (
      <p className="leading-relaxed text-a-muted">
        后台还没有启用。请设置环境变量 <code className="rounded bg-a-subtle px-1">GALLEY_ADMIN_PASSWORD</code>（至少 12 位），然后重启程序。
      </p>
    );
  }
  return <LoginForm />;
}
