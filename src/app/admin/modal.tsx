"use client";

import { LoaderCircle, X } from "lucide-react";
import { useCallback, useRef, useState, useTransition, type ReactNode } from "react";
import type { FormState } from "./actions";
import { useToast } from "./toast";
import { buttonClass, type ButtonVariant } from "./ui";

/**
 * 后台的弹框。用浏览器自带的 <dialog>：自带遮罩、焦点管理和 Esc 关闭。
 *
 * - Modal：只展示内容的弹框，比如查看详情。
 * - ModalForm：带表单的弹框，提交给一个服务端操作。新建、编辑、确认删除都用它。
 */

type TriggerProps = { triggerLabel: ReactNode; triggerVariant?: ButtonVariant; title: string; wide?: boolean };

function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  // 每次打开加一，用作内容的 key：这样每次打开都是全新的表单，不会残留上次的错误提示。
  const [openCount, setOpenCount] = useState(0);
  const open = () => {
    setOpenCount((n) => n + 1);
    ref.current?.showModal();
  };
  // 关闭时先播放收起的动画，再真正关闭。
  const close = useCallback(() => {
    const dialog = ref.current;
    if (!dialog?.open || dialog.dataset.closing) return;
    dialog.dataset.closing = "true";
    setTimeout(() => {
      delete dialog.dataset.closing;
      dialog.close();
    }, 150);
  }, []);
  return { ref, openCount, open, close };
}

function DialogFrame({
  dialogRef,
  title,
  wide,
  onClose,
  children,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog"
      data-size={wide ? "wide" : undefined}
      // 点击遮罩关闭：点到的是 dialog 本身而不是里面的内容时，说明点在了遮罩上。
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // 按 Esc 时浏览器会直接关掉，这里拦下来，改走带动画的关闭。
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="flex items-center justify-between gap-4 border-b border-a-border px-5 py-3.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="关闭" className="rounded p-1 text-a-muted hover:bg-a-subtle hover:text-a-text">
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function Modal({ triggerLabel, triggerVariant = "link", title, wide, children }: TriggerProps & { children: ReactNode }) {
  const { ref, open, close } = useDialog();
  return (
    <>
      <button type="button" onClick={open} className={buttonClass(triggerVariant)}>
        {triggerLabel}
      </button>
      <DialogFrame dialogRef={ref} title={title} wide={wide} onClose={close}>
        <div className="px-5 py-4">{children}</div>
        <footer className="flex justify-end border-t border-a-border px-5 py-3">
          <button type="button" onClick={close} className={buttonClass("secondary")}>
            关闭
          </button>
        </footer>
      </DialogFrame>
    </>
  );
}

type ModalFormProps = TriggerProps & {
  tokenHint?: ReactNode;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** 随表单一起提交的隐藏值，比如要操作的对象的编号 */
  hidden?: Record<string, string>;
  submitLabel?: string;
  submitVariant?: "primary" | "danger";
  /** 操作成功后在页面右上角显示的提示 */
  successMessage?: string;
  /** 表单字段。确认类的弹框可以只放一句说明 */
  children?: ReactNode;
};

export function ModalForm(props: ModalFormProps) {
  const { ref, openCount, open, close } = useDialog();
  return (
    <>
      <button type="button" onClick={open} className={buttonClass(props.triggerVariant ?? "secondary")}>
        {props.triggerLabel}
      </button>
      <DialogFrame dialogRef={ref} title={props.title} wide={props.wide} onClose={close}>
        <ModalFormBody key={openCount} {...props} onClose={close} />
      </DialogFrame>
    </>
  );
}

function ModalFormBody({
  action,
  hidden,
  submitLabel = "保存",
  submitVariant = "primary",
  successMessage = "操作成功",
  tokenHint,
  children,
  onClose,
}: ModalFormProps & { onClose: () => void }) {
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  /**
   * 提交。成功后关闭弹框并提示；返回了密钥的操作例外：密钥只显示一次，要留在弹框里给站长保存。
   *
   * 结果在这里直接处理，而不是放进状态里等下一次渲染再处理：
   * 像"删除"这样的操作成功后，这一行连同这个弹框都会从页面上消失，等不到下一次渲染。
   */
  const submit = (data: FormData) =>
    startTransition(async () => {
      const result = await action({}, data);
      if (result.ok && !result.token) {
        onClose();
        toast(successMessage);
      } else {
        setState(result);
      }
    });

  if (state.token) {
    return (
      <>
        <div className="space-y-3 px-5 py-4">
          <p>
            「{state.agentName}」的访问密钥<strong>只显示这一次</strong>，请现在保存：
          </p>
          <pre className="overflow-x-auto rounded-md bg-a-subtle p-3 text-xs select-all">{state.token}</pre>
          <p className="text-a-muted">{tokenHint ?? "把它放进环境变量 GALLEY_TOKEN，Agent 的配置片段见本页的「连接信息」。"}</p>
        </div>
        <footer className="flex justify-end border-t border-a-border px-5 py-3">
          <button type="button" onClick={onClose} className={buttonClass("primary")}>
            我已保存
          </button>
        </footer>
      </>
    );
  }

  return (
    <form
      // 页面脚本还没加载好时点了提交，浏览器会按默认方式提交表单。写明用 POST，填的内容（包括密码）就不会出现在网址里。
      method="post"
      // 自己提交而不是交给 form 的 action：那样的话提交失败后浏览器会清空表单，站长要把内容重填一遍。
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="space-y-4 px-5 py-4">
        {children}
        {state.error && <p className="rounded-md bg-a-danger-soft px-3 py-2 text-a-danger">{state.error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-a-border px-5 py-3">
        <button type="button" onClick={onClose} className={buttonClass("secondary")}>
          取消
        </button>
        <button disabled={pending} className={buttonClass(submitVariant)}>
          {pending && <LoaderCircle size={15} className="animate-spin" />}
          {submitLabel}
        </button>
      </footer>
    </form>
  );
}
