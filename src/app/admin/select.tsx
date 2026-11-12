"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * 后台的下拉选择。不用浏览器原生的 <select>：原生控件的样子随系统变化，和后台的其他控件不统一。
 *
 * 它在表单里的行为和原生的一样：选中的值放在一个隐藏的输入框里，随表单一起提交。
 * 键盘操作：上下方向键移动，回车或空格选中，Esc 关闭，Home 和 End 跳到头尾，直接打字跳到对应的选项。
 */
export type SelectOption = { value: string; label: string };

export function Select({
  name,
  options,
  defaultValue = "",
  placeholder = "请选择",
  className = "",
  submitOnChange = false,
  ariaLabel,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  /** 用来控制宽度，例如 w-36 */
  className?: string;
  /** 选中后立刻提交所在的表单。用于筛选条件 */
  submitOnChange?: boolean;
  ariaLabel?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const openList = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    setValue(option.value);
    setOpen(false);
    if (submitOnChange && option.value !== value && inputRef.current) {
      // 状态更新要等下一次渲染才会写进输入框，这里先直接写入，保证提交的是新选的值。
      inputRef.current.value = option.value;
      inputRef.current.form?.requestSubmit();
    }
  };

  // 打开时，点到控件外面就收起。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    if (e.key === "Escape") {
      if (open) {
        // 在弹框里时，只收起下拉，不要连弹框一起关掉。
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Tab") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      return setActive((i) => Math.max(0, Math.min(last, i + (e.key === "ArrowDown" ? 1 : -1))));
    }
    if (e.key === "Home" || e.key === "End") {
      if (!open) return;
      e.preventDefault();
      return setActive(e.key === "Home" ? 0 : last);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return open ? choose(active) : openList();
    }
    // 直接打字：跳到以这些字开头的选项。半秒内连续输入算同一个词。
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 500 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const match = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) {
        if (!open) setOpen(true);
        setActive(match);
      }
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input ref={inputRef} type="hidden" name={name} value={value} />
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-shadow duration-100 focus:outline-none ${
          open
            ? "bg-a-surface shadow-[inset_0_0_0_1px_var(--a-primary),0_0_0_3px_var(--a-primary-soft)]"
            : "bg-a-subtle/70 shadow-[inset_0_0_0_1px_var(--a-border)] hover:bg-a-subtle focus-visible:shadow-[inset_0_0_0_1px_var(--a-primary),0_0_0_3px_var(--a-primary-soft)]"
        }`}
      >
        <span className={`truncate ${selected ? "text-a-text" : "text-a-muted"}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-a-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="admin-select-list absolute left-0 top-full z-30 mt-1 max-h-64 min-w-full overflow-y-auto rounded-md bg-a-surface p-1 shadow-[0_0_0_1px_rgb(15_15_15/0.07),0_4px_12px_rgb(15_15_15/0.1),0_12px_28px_rgb(15_15_15/0.1)]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                // 用 pointerdown 而不是 click：这样不会先让按钮失去焦点。
                onPointerDown={(e) => {
                  e.preventDefault();
                  choose(index);
                }}
                onPointerEnter={() => setActive(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1 whitespace-nowrap text-a-text ${
                  index === active ? "bg-a-subtle" : ""
                }`}
              >
                {option.label}
                <Check size={14} className={isSelected ? "text-a-muted" : "invisible"} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
