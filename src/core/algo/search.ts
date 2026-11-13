import { arrayRecorder, errorsOf, must, parseInteger, parseNumbers } from "./input";
import type { AlgoDef, AlgoInput, ArrayItem, Frame, ListView, Tone } from "./types";

const sortedNumbers = (i: AlgoInput) => {
  const r = parseNumbers(i.input, { min: 3, max: 20, lo: -999, hi: 999 });
  if (r.ok && r.value.some((v, k) => k > 0 && v < r.value[k - 1])) return { ok: false as const, error: "这个算法要求数组从小到大有序，请先排好再写进 input。" };
  return r;
};

export const binarySearch: AlgoDef = {
  name: "binary-search",
  label: "二分查找",
  group: "查找",
  inputHelp: "从小到大排好的数，逗号分隔；target 是要找的数",
  example: { input: "2,5,8,12,16,23,38,56,72,91", target: "23" },
  legend: [{ tone: "compare", label: "中间位置" }, { tone: "dim", label: "已排除" }, { tone: "found", label: "找到" }],
  code: [
    "lo = 0, hi = n - 1",
    "while lo <= hi:",
    "  mid = (lo + hi) / 2",
    "  if a[mid] == target: return mid",
    "  if a[mid] < target: lo = mid + 1",
    "  else: hi = mid - 1",
    "return -1   // 没找到",
  ],
  check: (i) => errorsOf(sortedNumbers(i), parseInteger(i.target, "target", -999, 999)),
  run(input) {
    const a = arrayRecorder(must(sortedNumbers(input)), "boxes");
    const target = Number(input.target);
    let lo = 0;
    let hi = a.items.length - 1;
    a.snap(`在有序数组里找 ${target}。每次看中间那个，排除一半。`, 0, { range: [lo, hi], pointers: { lo, hi }, vars: { target, lo, hi } });
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      a.snap(`中间是 a[${mid}] = ${a.value(mid)}。`, 2, { tones: { [mid]: "compare" }, range: [lo, hi], pointers: { lo, mid, hi }, vars: { target, lo, mid, hi } });
      if (a.value(mid) === target) {
        a.snap(`等于 ${target}，找到了，下标是 ${mid}。`, 3, { tones: { [mid]: "found" }, pointers: { mid }, vars: { target, mid } });
        return a.frames;
      }
      if (a.value(mid) < target) {
        lo = mid + 1;
        a.snap(`${a.value(mid)} < ${target}，答案只可能在右半边。`, 4, { range: [lo, hi], pointers: { lo, hi }, vars: { target, lo, hi } });
      } else {
        hi = mid - 1;
        a.snap(`${a.value(mid)} > ${target}，答案只可能在左半边。`, 5, { range: [lo, hi], pointers: { lo, hi }, vars: { target, lo, hi } });
      }
    }
    a.snap(`范围空了，数组里没有 ${target}。`, 6, { range: [0, -1], vars: { target, lo, hi } });
    return a.frames;
  },
};

export const twoPointers: AlgoDef = {
  name: "two-sum",
  label: "双指针：两数之和",
  group: "查找",
  inputHelp: "从小到大排好的数，逗号分隔；target 是要凑出的和",
  example: { input: "1,3,4,6,8,11,14", target: "17" },
  legend: [{ tone: "compare", label: "左右指针" }, { tone: "dim", label: "已排除" }, { tone: "found", label: "找到" }],
  code: [
    "l = 0, r = n - 1",
    "while l < r:",
    "  s = a[l] + a[r]",
    "  if s == target: return (l, r)",
    "  if s < target: l++   // 和太小，左边换大的",
    "  else: r--            // 和太大，右边换小的",
    "return 没有",
  ],
  check: (i) => errorsOf(sortedNumbers(i), parseInteger(i.target, "target", -1998, 1998)),
  run(input) {
    const a = arrayRecorder(must(sortedNumbers(input)), "boxes");
    const target = Number(input.target);
    let l = 0;
    let r = a.items.length - 1;
    a.snap(`找两个数，和等于 ${target}。左右各放一个指针，往中间收。`, 0, { pointers: { l, r }, vars: { target } });
    while (l < r) {
      const s = a.value(l) + a.value(r);
      a.snap(`${a.value(l)} + ${a.value(r)} = ${s}。`, 2, { tones: { [l]: "compare", [r]: "compare" }, range: [l, r], pointers: { l, r }, vars: { target, l, r, s } });
      if (s === target) {
        a.snap(`正好等于 ${target}：a[${l}] + a[${r}]。`, 3, { tones: { [l]: "found", [r]: "found" }, pointers: { l, r }, vars: { target, l, r, s } });
        return a.frames;
      }
      if (s < target) {
        l++;
        a.snap(`${s} < ${target}，左指针右移，换一个更大的数。`, 4, { range: [l, r], pointers: { l, r }, vars: { target, l, r } });
      } else {
        r--;
        a.snap(`${s} > ${target}，右指针左移，换一个更小的数。`, 5, { range: [l, r], pointers: { l, r }, vars: { target, l, r } });
      }
    }
    a.snap(`指针相遇了，没有两个数的和是 ${target}。`, 6, { range: [0, -1], vars: { target } });
    return a.frames;
  },
};

const windowNumbers = (i: AlgoInput) => parseNumbers(i.input, { min: 3, max: 20, lo: -999, hi: 999 });

export const slidingWindow: AlgoDef = {
  name: "sliding-window",
  label: "滑动窗口：最大区间和",
  group: "查找",
  inputHelp: "一组数，逗号分隔；target 是窗口长度 k",
  example: { input: "2,1,5,1,3,2,7,1,4", target: "3" },
  legend: [{ tone: "pivot", label: "窗口" }, { tone: "swap", label: "移出 / 移入" }, { tone: "found", label: "最大的窗口" }],
  code: [
    "sum = a[0] + ... + a[k-1]",
    "best = sum",
    "for r in k .. n-1:",
    "  sum += a[r] - a[r-k]   // 右边进一个，左边出一个",
    "  best = max(best, sum)",
  ],
  check: (i) => {
    const errors = errorsOf(windowNumbers(i), parseInteger(i.target, "target", 1, 20));
    const n = windowNumbers(i);
    if (!errors.length && n.ok && Number(i.target) > n.value.length) errors.push("窗口长度 target 不能比数组还长。");
    return errors;
  },
  run(input) {
    const a = arrayRecorder(must(windowNumbers(input)), "boxes");
    const k = Number(input.target);
    const n = a.items.length;
    const windowTones = (l: number, r: number, tone: Tone = "pivot") => Object.fromEntries(Array.from({ length: r - l + 1 }, (_, i) => [l + i, tone])) as Record<number, Tone>;
    let sum = 0;
    for (let i = 0; i < k; i++) sum += a.value(i);
    let best = sum;
    let bestL = 0;
    a.snap(`先算最左边长度为 ${k} 的窗口，和是 ${sum}。`, 0, { tones: windowTones(0, k - 1), pointers: { l: 0, r: k - 1 }, vars: { k, sum, best } });
    for (let r = k; r < n; r++) {
      const out = r - k;
      a.snap(`窗口右移：${a.value(r)} 进来，${a.value(out)} 出去。`, 3, {
        tones: { ...windowTones(out + 1, r - 1), [out]: "swap", [r]: "swap" },
        pointers: { l: out + 1, r },
        vars: { k, sum, best },
      });
      sum += a.value(r) - a.value(out);
      if (sum > best) {
        best = sum;
        bestL = out + 1;
      }
      a.snap(`现在的和是 ${sum}，最大的是 ${best}。`, 4, { tones: windowTones(out + 1, r), pointers: { l: out + 1, r }, vars: { k, sum, best } });
    }
    a.snap(`最大的区间和是 ${best}，窗口从下标 ${bestL} 开始。不用每次重新加一遍，每步只算进出的两个数。`, undefined, {
      tones: windowTones(bestL, bestL + k - 1, "found"),
      vars: { k, best },
    });
    return a.frames;
  },
};

const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const brackets = (i: AlgoInput) => {
  const s = i.input.replace(/\s+/g, "");
  if (!s || /[^()[\]{}]/.test(s)) return { ok: false as const, error: '括号匹配的 input 只能有括号，例如 "({[]})[]"。' };
  if (s.length > 20) return { ok: false as const, error: "最多 20 个括号。" };
  return { ok: true as const, value: s };
};

export const validBrackets: AlgoDef = {
  name: "valid-brackets",
  label: "栈：括号匹配",
  group: "栈和链表",
  inputHelp: "一串括号，例如 ({[]})",
  example: { input: "{[()()]}(" },
  legend: [{ tone: "active", label: "当前字符" }, { tone: "found", label: "配对成功" }, { tone: "swap", label: "栈顶" }],
  code: [
    "for c in s:",
    "  if c 是左括号: push(c)",
    "  else if 栈空 or 栈顶和 c 不配对: return false",
    "  else: pop()",
    "return 栈是空的",
  ],
  check: (i) => errorsOf(brackets(i)),
  run(input) {
    const s = must(brackets(input));
    const a = arrayRecorder(s.split(""), "boxes");
    let stack: ArrayItem[] = [];
    const aux = (top?: boolean) => ({ label: "栈", items: stack, tones: stack.map((_, k) => (top && k === stack.length - 1 ? ("swap" as Tone) : null)) });
    a.snap("从左到右看每个括号。左括号先存进栈里，等它的右括号。", 0, { aux: aux() });
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!PAIRS[c]) {
        stack = [...stack, a.items[i]];
        a.snap(`${c} 是左括号，压进栈。`, 1, { tones: { [i]: "active" }, pointers: { i }, aux: aux(true), vars: { c } });
        continue;
      }
      const top = stack[stack.length - 1];
      if (!top || top.value !== PAIRS[c]) {
        a.snap(top ? `栈顶是 ${top.value}，和 ${c} 配不上，不合法。` : `栈是空的，${c} 没有可以配对的左括号，不合法。`, 2, { tones: { [i]: "pivot" }, pointers: { i }, aux: aux(true), vars: { c } });
        return a.frames;
      }
      const opener = a.items.findIndex((x) => x.id === top.id);
      stack = stack.slice(0, -1);
      a.done.add(i);
      a.done.add(opener);
      a.snap(`${c} 和栈顶的 ${top.value} 配对，弹出。`, 3, { tones: { [i]: "found", [opener]: "found" }, pointers: { i }, aux: aux(), vars: { c }, doneTone: "found" });
    }
    a.snap(stack.length ? `看完了，栈里还剩 ${stack.length} 个左括号没配上，不合法。` : "看完了，栈是空的，括号全部配对，合法。", 4, { aux: aux(), doneTone: "found" });
    return a.frames;
  },
};

const listValues = (i: AlgoInput) => parseNumbers(i.input, { min: 2, max: 8, lo: -99, hi: 999 });

export const reverseList: AlgoDef = {
  name: "reverse-list",
  label: "链表反转",
  group: "栈和链表",
  inputHelp: "链表里的值，逗号分隔，2 到 8 个",
  example: { input: "1,2,3,4,5" },
  legend: [{ tone: "active", label: "当前节点" }, { tone: "sorted", label: "已反转" }],
  code: [
    "prev = null, cur = head",
    "while cur != null:",
    "  next = cur.next     // 先记住下一个",
    "  cur.next = prev     // 反转指向",
    "  prev = cur; cur = next",
    "return prev",
  ],
  check: (i) => errorsOf(listValues(i)),
  run(input) {
    const values = must(listValues(input));
    const nodes = values.map((value, id) => ({ id, value }));
    const next: (number | null)[] = values.map((_, i) => (i + 1 < values.length ? i + 1 : null));
    const frames: Frame[] = [];
    const done = new Set<number>();
    const snap = (note: string, line: number, ptr: { prev: number | null; cur: number | null; next?: number | null }, active?: number | null) => {
      const view: ListView = {
        kind: "list",
        nodes,
        next: [...next],
        pointers: [
          { name: "prev", index: ptr.prev },
          { name: "cur", index: ptr.cur },
          ...(ptr.next !== undefined ? [{ name: "next", index: ptr.next }] : []),
        ],
        tones: nodes.map((_, i) => (i === active ? "active" : done.has(i) ? "sorted" : null)),
      };
      frames.push({ view, note, line, vars: [["prev", ptr.prev === null ? "null" : String(values[ptr.prev])], ["cur", ptr.cur === null ? "null" : String(values[ptr.cur])]] });
    };
    let prev: number | null = null;
    let cur: number | null = 0;
    snap("把链表的方向倒过来。用三个指针，一边走一边改指向。", 0, { prev, cur });
    while (cur !== null) {
      const nx: number | null = next[cur];
      snap(`先用 next 记住 ${values[cur]} 后面的节点，不然改完就找不到了。`, 2, { prev, cur, next: nx }, cur);
      next[cur] = prev;
      done.add(cur);
      snap(`${values[cur]} 改成指向${prev === null ? " null" : ` ${values[prev]}`}。`, 3, { prev, cur, next: nx }, cur);
      prev = cur;
      cur = nx;
      snap("prev 和 cur 都往前走一步。", 4, { prev, cur });
    }
    snap(`反转完成，新的头节点是 ${values[prev!]}。`, 5, { prev, cur: null });
    return frames;
  },
};

export const SEARCH = [binarySearch, twoPointers, slidingWindow, validBrackets, reverseList];
