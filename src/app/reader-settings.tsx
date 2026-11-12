"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 阅读设置：读者自己调正文的字号和页面的底色。
 *
 * 选择存在读者自己的浏览器里（localStorage），不发给服务器。页面根元素上的
 * data-reader-size 和 data-reader-theme 决定实际的样子，样式在 globals.css 里。
 * 页面一打开就要用上读者的选择，否则会先闪一下默认的样子，所以 layout.tsx 里有一段同样作用的小脚本。
 */

export const READER_STORAGE_KEY = "galley-reader";

type Size = "s" | "m" | "l";
type Theme = "auto" | "light" | "dark";
type Settings = { size: Size; theme: Theme };

const SIZES: { value: Size; label: string }[] = [
  { value: "s", label: "小" },
  { value: "m", label: "中" },
  { value: "l", label: "大" },
];
const THEMES: { value: Theme; label: string; swatch: string }[] = [
  { value: "auto", label: "跟随系统", swatch: "linear-gradient(135deg, #f6f1e6 50%, #1b1916 50%)" },
  { value: "light", label: "纸色", swatch: "#f6f1e6" },
  { value: "dark", label: "深色", swatch: "#1b1916" },
];

function apply({ size, theme }: Settings) {
  const root = document.documentElement;
  if (size === "m") delete root.dataset.readerSize;
  else root.dataset.readerSize = size;
  if (theme === "auto") delete root.dataset.readerTheme;
  else root.dataset.readerTheme = theme;
  try {
    localStorage.setItem(READER_STORAGE_KEY, JSON.stringify({ size, theme }));
  } catch {
    // 浏览器不让存（比如无痕模式）时，这次的设置只在当前页面有效。
  }
}

/** 读出页面上现在生效的设置（由 layout.tsx 里的小脚本在页面打开时设好）。 */
function current(): Settings {
  const root = document.documentElement;
  const size = root.dataset.readerSize === "s" || root.dataset.readerSize === "l" ? root.dataset.readerSize : "m";
  const theme = root.dataset.readerTheme === "light" || root.dataset.readerTheme === "dark" ? root.dataset.readerTheme : "auto";
  return { size, theme };
}

export function ReaderSettings() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({ size: "m", theme: "auto" });
  const ref = useRef<HTMLDivElement>(null);

  // 打开面板时读一次当前的设置：服务端渲染时不知道读者选了什么。
  const toggle = () => {
    if (!open) setSettings(current());
    setOpen(!open);
  };

  // 点面板外面或者按 Esc 关闭。
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const update = (next: Partial<Settings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    apply(merged);
  };

  return (
    <div ref={ref} className="galley-reader">
      <button type="button" className="galley-reader-toggle" aria-expanded={open} aria-label="阅读设置" title="阅读设置" onClick={toggle}>
        Aa
      </button>
      {open && (
        <div className="galley-reader-panel" role="dialog" aria-label="阅读设置">
          <span>字号</span>
          <div className="galley-reader-options">
            {SIZES.map((option) => (
              <button key={option.value} type="button" aria-pressed={settings.size === option.value} onClick={() => update({ size: option.value })}>
                {option.label}
              </button>
            ))}
          </div>
          <span>底色</span>
          <div className="galley-reader-options">
            {THEMES.map((option) => (
              <button key={option.value} type="button" aria-pressed={settings.theme === option.value} onClick={() => update({ theme: option.value })}>
                <span className="galley-reader-swatch" style={{ background: option.swatch }} aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
