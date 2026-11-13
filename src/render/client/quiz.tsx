"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 小测验：读者点一个选项（多选题勾好后点「提交」），马上标出对错，再显示解析。
 *
 * 题目、选项和解析都由服务端渲染好（.galley-quiz-question、.galley-quiz-options > li[data-correct]、
 * .galley-quiz-explain），这里只负责点选和揭晓。脚本没加载时选项照常显示，解析默认收着。
 * 演示模式里按一下右方向键揭晓答案，再按一下翻页（见 present.tsx 的 "galley-step"）。
 */
type State = "answering" | "revealed";

export function Quiz({ title, correct, children }: { title?: string; correct: number[]; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [state, setState] = useState<State>("answering");
  const multiple = correct.length > 1;

  // 选项是服务端渲染的 li，给它们加上可以点、可以用键盘选的属性
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLLIElement>(".galley-quiz-options > li")];
    items.forEach((li) => {
      li.tabIndex = 0;
      li.setAttribute("role", multiple ? "checkbox" : "radio");
    });
    root.dataset.ready = "true";
  }, [multiple]);

  // 把选中、对错写到选项上，样式按这些属性来
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLLIElement>(".galley-quiz-options > li")];
    items.forEach((li, i) => {
      const chosen = selected.includes(i);
      const isCorrect = correct.includes(i);
      li.setAttribute("aria-checked", String(chosen));
      li.setAttribute("aria-disabled", String(state === "revealed"));
      if (state === "revealed") li.dataset.result = isCorrect ? (chosen ? "right" : "missed") : chosen ? "wrong" : "plain";
      else delete li.dataset.result;
      li.dataset.chosen = String(chosen);
    });
    root.dataset.state = state;
  }, [selected, state, correct]);

  // 演示模式：右方向键揭晓（选中正确答案），左方向键收回
  useEffect(() => {
    const root = ref.current;
    if (!root || !root.closest(".galley-present")) return;
    root.dataset.steppable = "true";
    const onStep = (e: Event) => {
      const detail = (e as CustomEvent<{ dir: number; wait?: number; caption?: string }>).detail;
      const revealed = root.dataset.state === "revealed";
      if ((detail.dir > 0 && revealed) || (detail.dir < 0 && !revealed)) return;
      e.preventDefault();
      if (detail.dir > 0) {
        setSelected(correct);
        setState("revealed");
        detail.wait = 4000;
        detail.caption = root.querySelector(".galley-quiz-explain")?.textContent?.trim() || undefined;
      } else {
        setSelected([]);
        setState("answering");
      }
    };
    root.addEventListener("galley-step", onStep);
    return () => root.removeEventListener("galley-step", onStep);
  }, [correct]);

  const choose = (index: number) => {
    if (state === "revealed") return;
    if (multiple) setSelected((s) => (s.includes(index) ? s.filter((i) => i !== index) : [...s, index].sort()));
    else {
      setSelected([index]);
      setState("revealed");
    }
  };

  const optionIndex = (target: EventTarget | null) => {
    const li = (target as HTMLElement | null)?.closest<HTMLLIElement>(".galley-quiz-options > li");
    if (!li || (target as HTMLElement).closest("a")) return -1;
    return [...(li.parentElement?.children ?? [])].indexOf(li);
  };

  const right = state === "revealed" && correct.length === selected.length && correct.every((i) => selected.includes(i));

  return (
    <section
      ref={ref}
      className="galley-quiz"
      aria-label={title || "小测验"}
      onClick={(e) => {
        const i = optionIndex(e.target);
        if (i >= 0) choose(i);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const i = optionIndex(e.target);
        if (i < 0) return;
        e.preventDefault();
        choose(i);
      }}
    >
      <p className="galley-quiz-kicker">
        {title || "小测验"}
        {multiple && <span>多选</span>}
      </p>
      {children}
      <div className="galley-quiz-footer" aria-live="polite">
        {state === "revealed" ? (
          <>
            <span className="galley-quiz-verdict" data-right={right}>
              {right ? "答对了" : "不太对，正确答案已经标出来了"}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelected([]);
                setState("answering");
              }}
            >
              再试一次
            </button>
          </>
        ) : multiple ? (
          <button type="button" className="galley-quiz-submit" disabled={selected.length === 0} onClick={() => setState("revealed")}>
            提交
          </button>
        ) : (
          <span className="galley-quiz-hint">选一个</span>
        )}
      </div>
    </section>
  );
}
