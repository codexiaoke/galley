"use client";

import { ArrowLeft, GripVertical, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { buttonClass } from "../../../ui";

const MIN_WIDTH = 264;
const DEFAULT_WIDTH = 320;
const MAX_WIDTH = 432;
const KEY_STEP = 16;

function clampSidebarWidth(width: number) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)));
}

export function sidebarWidthAfterKey(width: number, key: string) {
  switch (key) {
    case "ArrowLeft": return clampSidebarWidth(width + KEY_STEP);
    case "ArrowRight": return clampSidebarWidth(width - KEY_STEP);
    case "Home": return MIN_WIDTH;
    case "End": return MAX_WIDTH;
    case "Enter": return DEFAULT_WIDTH;
  }
}

export function ReviewLayout({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  const [wide, setWide] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const drag = useRef<{ x: number; width: number } | null>(null);

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const width = sidebarWidthAfterKey(sidebarWidth, event.key);
    if (width === undefined) return;
    event.preventDefault();
    setSidebarWidth(width);
  }

  return (
    <div data-review-layout>
      <div className="mb-4 -ml-2 flex items-center justify-between gap-3">
        <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-a-muted transition-colors hover:bg-a-subtle hover:text-a-text">
          <ArrowLeft size={15} aria-hidden="true" />
          返回看板
        </Link>
        <div className="hidden xl:block">
          <button
            type="button"
            aria-pressed={wide}
            aria-controls="review-columns"
            onClick={() => setWide((current) => !current)}
            className={`${buttonClass("link")} aria-pressed:bg-a-subtle aria-pressed:text-a-text`}
          >
            {wide ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
            宽屏阅读
          </button>
        </div>
      </div>
      {heading}
      <div
        id="review-columns"
        className={`grid gap-y-6 ${wide ? "" : "xl:grid-cols-[minmax(0,1fr)_1.5rem_var(--review-sidebar-width)] xl:[&>aside]:sticky xl:[&>aside]:top-8 xl:[&>aside]:self-start"}`}
        style={{ "--review-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        {!wide && (
          <div
            role="separator"
            tabIndex={0}
            aria-label="审阅栏宽度"
            aria-orientation="vertical"
            aria-controls="review-sidebar"
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            aria-valuenow={sidebarWidth}
            title="拖动或使用左右方向键调整宽度，双击或按 Enter 恢复默认"
            className="hidden h-24 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 rounded text-a-muted before:h-4 before:w-px before:bg-a-border after:h-4 after:w-px after:bg-a-border hover:bg-a-subtle hover:text-a-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-primary xl:sticky xl:top-8 xl:col-start-2 xl:row-start-1 xl:mt-7 xl:flex xl:self-start"
            onKeyDown={resizeWithKeyboard}
            onDoubleClick={() => setSidebarWidth(DEFAULT_WIDTH)}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              drag.current = { x: event.clientX, width: sidebarWidth };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              setSidebarWidth(clampSidebarWidth(drag.current.width + drag.current.x - event.clientX));
            }}
            onLostPointerCapture={() => { drag.current = null; }}
          >
            <GripVertical size={16} aria-hidden="true" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
