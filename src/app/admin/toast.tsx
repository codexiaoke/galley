"use client";

import { CircleCheck } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/**
 * 操作成功后的提示条。出现在页面右上角，三秒后自动消失。
 * 弹框关闭之后，站长需要一个明确的信号知道"刚才那一下生效了"。
 */
type Toast = { id: number; message: string; leaving: boolean };

const ToastContext = createContext<(message: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

const VISIBLE_MS = 3000;
const LEAVE_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, leaving: false }]);
    // 先播放离开的动画，再真正移除。
    setTimeout(() => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), VISIBLE_MS);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), VISIBLE_MS + LEAVE_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-5 top-5 z-[60] flex flex-col items-end gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="admin-toast" data-leaving={toast.leaving || undefined}>
            <CircleCheck size={17} className="shrink-0 text-a-success" />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
