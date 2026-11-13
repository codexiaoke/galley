import { arrayRecorder, errorsOf, must, parseNumbers } from "./input";
import type { AlgoDef, AlgoInput, ArrayItem } from "./types";

const numbers = (i: AlgoInput) => parseNumbers(i.input, { min: 3, max: 16, lo: 0, hi: 999 });
const check = (i: AlgoInput) => errorsOf(numbers(i));

const SORT_LEGEND: AlgoDef["legend"] = [
  { tone: "compare", label: "比较" },
  { tone: "swap", label: "交换" },
  { tone: "sorted", label: "已排好" },
];

const example = { input: "38,27,43,3,9,82,10,55" };

export const bubbleSort: AlgoDef = {
  name: "bubble-sort",
  label: "冒泡排序",
  group: "排序",
  inputHelp: "要排序的数，逗号分隔，3 到 16 个 0~999 的整数",
  example,
  legend: SORT_LEGEND,
  code: [
    "for i in 0 .. n-1:",
    "  for j in 0 .. n-2-i:",
    "    if a[j] > a[j+1]:",
    "      swap(a[j], a[j+1])",
    "  a[n-1-i] 已经排好",
  ],
  check,
  run(input) {
    const a = arrayRecorder(must(numbers(input)), "bars");
    const n = a.items.length;
    a.snap("开始。每一轮把剩下的数里最大的那个「冒」到最右边。", 0);
    for (let i = 0; i < n - 1; i++) {
      let swapped = false;
      for (let j = 0; j < n - 1 - i; j++) {
        a.snap(`比较 ${a.value(j)} 和 ${a.value(j + 1)}。`, 2, { tones: { [j]: "compare", [j + 1]: "compare" }, pointers: { j }, vars: { i, j } });
        if (a.value(j) > a.value(j + 1)) {
          a.swap(j, j + 1);
          swapped = true;
          a.snap(`${a.value(j + 1)} 更大，往右换。`, 3, { tones: { [j]: "swap", [j + 1]: "swap" }, pointers: { j }, vars: { i, j } });
        }
      }
      a.done.add(n - 1 - i);
      if (!swapped) {
        for (let k = 0; k < n; k++) a.done.add(k);
        a.snap("这一轮一次都没交换，说明已经全部有序，提前结束。", 4, { vars: { i } });
        return a.frames;
      }
      a.snap(`第 ${i + 1} 轮结束，${a.value(n - 1 - i)} 到了它最终的位置。`, 4, { vars: { i } });
    }
    a.done.add(0);
    a.snap("排序完成。", undefined);
    return a.frames;
  },
};

export const selectionSort: AlgoDef = {
  name: "selection-sort",
  label: "选择排序",
  group: "排序",
  inputHelp: bubbleSort.inputHelp,
  example,
  legend: [{ tone: "compare", label: "比较" }, { tone: "pivot", label: "目前最小" }, { tone: "swap", label: "交换" }, { tone: "sorted", label: "已排好" }],
  code: [
    "for i in 0 .. n-1:",
    "  min = i",
    "  for j in i+1 .. n-1:",
    "    if a[j] < a[min]: min = j",
    "  swap(a[i], a[min])",
  ],
  check,
  run(input) {
    const a = arrayRecorder(must(numbers(input)), "bars");
    const n = a.items.length;
    a.snap("开始。每一轮从没排好的部分里挑出最小的，放到最前面。", 0);
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      a.snap(`先假设 a[${i}] = ${a.value(i)} 最小。`, 1, { tones: { [i]: "pivot" }, pointers: { i, min }, vars: { i, min } });
      for (let j = i + 1; j < n; j++) {
        a.snap(`比较 ${a.value(j)} 和目前最小的 ${a.value(min)}。`, 3, { tones: { [min]: "pivot", [j]: "compare" }, pointers: { i, j, min }, vars: { i, j, min } });
        if (a.value(j) < a.value(min)) {
          min = j;
          a.snap(`${a.value(j)} 更小，记下它的位置。`, 3, { tones: { [min]: "pivot" }, pointers: { i, j, min }, vars: { i, j, min } });
        }
      }
      if (min !== i) {
        a.swap(i, min);
        a.snap(`把最小的 ${a.value(i)} 换到第 ${i} 位。`, 4, { tones: { [i]: "swap", [min]: "swap" }, pointers: { i, min }, vars: { i, min } });
      }
      a.done.add(i);
    }
    a.done.add(n - 1);
    a.snap("排序完成。", undefined);
    return a.frames;
  },
};

export const insertionSort: AlgoDef = {
  name: "insertion-sort",
  label: "插入排序",
  group: "排序",
  inputHelp: bubbleSort.inputHelp,
  example,
  legend: [{ tone: "active", label: "要插入的数" }, { tone: "compare", label: "比较" }, { tone: "sorted", label: "左边已有序" }],
  code: [
    "for i in 1 .. n-1:",
    "  key = a[i]",
    "  j = i - 1",
    "  while j >= 0 and a[j] > key:",
    "    a[j+1] = a[j]; j--",
    "  a[j+1] = key",
  ],
  check,
  run(input) {
    const a = arrayRecorder(must(numbers(input)), "bars");
    const n = a.items.length;
    a.done.add(0);
    a.snap("开始。左边的部分始终有序，每次把右边的下一个数插进去。", 0);
    for (let i = 1; i < n; i++) {
      const key = a.value(i);
      a.snap(`拿出 ${key}，往左找它的位置。`, 1, { tones: { [i]: "active" }, pointers: { i }, vars: { i, key } });
      let j = i - 1;
      let at = i;
      while (j >= 0) {
        a.snap(`比较 ${a.value(j)} 和 ${key}。`, 3, { tones: { [at]: "active", [j]: "compare" }, pointers: { i, j }, vars: { i, j, key } });
        if (a.value(j) <= key) break;
        a.swap(j, at);
        at = j;
        a.snap(`${a.value(at + 1)} 比 ${key} 大，往右挪一格。`, 4, { tones: { [at]: "active", [at + 1]: "swap" }, pointers: { i, j }, vars: { i, j, key } });
        j--;
      }
      for (let k = 0; k <= i; k++) a.done.add(k);
      a.snap(`${key} 放在第 ${at} 位，左边 ${i + 1} 个数有序了。`, 5, { tones: { [at]: "found" }, vars: { i, key } });
    }
    a.snap("排序完成。", undefined);
    return a.frames;
  },
};

export const quickSort: AlgoDef = {
  name: "quick-sort",
  label: "快速排序",
  group: "排序",
  inputHelp: bubbleSort.inputHelp,
  example,
  legend: [{ tone: "pivot", label: "基准" }, { tone: "compare", label: "比较" }, { tone: "swap", label: "交换" }, { tone: "sorted", label: "已就位" }],
  code: [
    "quickSort(lo, hi):",
    "  if lo >= hi: return",
    "  pivot = a[hi]; i = lo",
    "  for j in lo .. hi-1:",
    "    if a[j] < pivot:",
    "      swap(a[i], a[j]); i++",
    "  swap(a[i], a[hi])   // 基准归位",
    "  quickSort(lo, i-1); quickSort(i+1, hi)",
  ],
  check,
  run(input) {
    const a = arrayRecorder(must(numbers(input)), "bars");
    a.snap("开始。选一个基准，比它小的放左边，大的放右边，再分别处理两边。", 0);
    const sort = (lo: number, hi: number) => {
      if (lo > hi) return;
      if (lo === hi) {
        a.done.add(lo);
        a.snap(`只剩 ${a.value(lo)} 一个数，它已经就位。`, 1, { range: [lo, hi], vars: { lo, hi } });
        return;
      }
      const pivot = a.value(hi);
      let i = lo;
      a.snap(`在 [${lo}, ${hi}] 里，选最右边的 ${pivot} 做基准。`, 2, { tones: { [hi]: "pivot" }, range: [lo, hi], pointers: { i }, vars: { lo, hi, pivot } });
      for (let j = lo; j < hi; j++) {
        a.snap(`${a.value(j)} 和基准 ${pivot} 比。`, 4, { tones: { [hi]: "pivot", [j]: "compare" }, range: [lo, hi], pointers: { i, j }, vars: { lo, hi, pivot, i, j } });
        if (a.value(j) < pivot) {
          if (i !== j) {
            a.swap(i, j);
            a.snap(`${a.value(i)} 比基准小，换到左边第 ${i} 位。`, 5, { tones: { [hi]: "pivot", [i]: "swap", [j]: "swap" }, range: [lo, hi], pointers: { i, j }, vars: { lo, hi, pivot, i, j } });
          }
          i++;
        }
      }
      a.swap(i, hi);
      a.done.add(i);
      a.snap(`基准 ${pivot} 换到第 ${i} 位：左边都比它小，右边都不比它小。`, 6, { tones: { [i]: "pivot" }, range: [lo, hi], pointers: { i }, vars: { lo, hi, pivot, i } });
      sort(lo, i - 1);
      sort(i + 1, hi);
    };
    sort(0, a.items.length - 1);
    a.snap("排序完成。", undefined);
    return a.frames;
  },
};

export const mergeSort: AlgoDef = {
  name: "merge-sort",
  label: "归并排序",
  group: "排序",
  inputHelp: bubbleSort.inputHelp,
  example,
  legend: [{ tone: "compare", label: "比较" }, { tone: "swap", label: "放进临时区" }, { tone: "sorted", label: "这一段已有序" }],
  code: [
    "mergeSort(lo, hi):",
    "  if lo >= hi: return",
    "  mid = (lo + hi) / 2",
    "  mergeSort(lo, mid); mergeSort(mid+1, hi)",
    "  每次取两半里较小的那个，放进临时区",
    "  把临时区写回 a[lo .. hi]",
  ],
  check,
  run(input) {
    const a = arrayRecorder(must(numbers(input)), "bars");
    const n = a.items.length;
    a.snap("开始。把数组对半分，各自排好，再合并成一段。", 0);
    const sort = (lo: number, hi: number) => {
      if (lo >= hi) return;
      const mid = Math.floor((lo + hi) / 2);
      a.snap(`把 [${lo}, ${hi}] 分成 [${lo}, ${mid}] 和 [${mid + 1}, ${hi}]。`, 2, { range: [lo, hi], pointers: { lo, mid, hi }, vars: { lo, mid, hi } });
      sort(lo, mid);
      sort(mid + 1, hi);
      const left = a.items.slice(lo, mid + 1);
      const right = a.items.slice(mid + 1, hi + 1);
      const merged: ArrayItem[] = [];
      let p = 0;
      let q = 0;
      while (p < left.length || q < right.length) {
        const li = lo + p;
        const ri = mid + 1 + q;
        const tones: Record<number, "compare" | "dim"> = {};
        if (p < left.length) tones[li] = "compare";
        if (q < right.length) tones[ri] = "compare";
        const takeLeft = q >= right.length || (p < left.length && (left[p].value as number) <= (right[q].value as number));
        const pick = takeLeft ? left[p] : right[q];
        a.snap(
          p < left.length && q < right.length ? `比较 ${left[p].value} 和 ${right[q].value}，${pick.value} 更小，放进临时区。` : `把剩下的 ${pick.value} 放进临时区。`,
          4,
          { tones, range: [lo, hi], aux: { label: "临时区", items: [...merged, pick], tones: [...merged.map(() => null), "swap"] }, vars: { lo, mid, hi } },
        );
        merged.push(pick);
        if (takeLeft) p++;
        else q++;
      }
      a.items = [...a.items.slice(0, lo), ...merged, ...a.items.slice(hi + 1)];
      const tones: Record<number, "sorted"> = {};
      for (let k = lo; k <= hi; k++) tones[k] = "sorted";
      a.snap(`写回原数组，[${lo}, ${hi}] 这一段有序了。`, 5, { tones, range: [lo, hi], vars: { lo, mid, hi } });
    };
    sort(0, n - 1);
    for (let k = 0; k < n; k++) a.done.add(k);
    a.snap("排序完成。", undefined);
    return a.frames;
  },
};

export const heapSort: AlgoDef = {
  name: "heap-sort",
  label: "堆排序",
  group: "排序",
  inputHelp: bubbleSort.inputHelp,
  example,
  legend: [{ tone: "active", label: "下沉中" }, { tone: "compare", label: "孩子" }, { tone: "swap", label: "交换" }, { tone: "sorted", label: "已排好" }],
  code: [
    "建堆：从 n/2-1 到 0，依次下沉",
    "for end in n-1 .. 1:",
    "  swap(a[0], a[end])   // 堆顶最大，放到末尾",
    "  下沉 a[0]，范围是 0 .. end-1",
    "siftDown(i, size):",
    "  c = 两个孩子里较大的那个",
    "  if a[c] > a[i]: swap(a[i], a[c]); 继续下沉 c",
  ],
  check,
  run(input) {
    const a = arrayRecorder(must(numbers(input)), "bars");
    const n = a.items.length;
    const sift = (start: number, size: number) => {
      let i = start;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        if (l >= size) return;
        const c = r < size && a.value(r) > a.value(l) ? r : l;
        const kids: Record<number, "compare" | "active"> = { [i]: "active", [l]: "compare" };
        if (r < size) kids[r] = "compare";
        a.snap(`看 ${a.value(i)} 的孩子，较大的是 ${a.value(c)}。`, 5, { tones: kids, range: [0, size - 1], pointers: { i, c }, vars: { i, size } });
        if (a.value(c) <= a.value(i)) return;
        a.swap(i, c);
        a.snap(`${a.value(i)} 比 ${a.value(c)} 大，交换，继续往下。`, 6, { tones: { [i]: "swap", [c]: "swap" }, range: [0, size - 1], pointers: { i, c }, vars: { i, size } });
        i = c;
      }
    };
    a.snap("开始。先把数组整理成大顶堆：每个节点都不小于它的孩子（第 i 个的孩子是 2i+1 和 2i+2）。", 0);
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) sift(i, n);
    a.snap(`建堆完成，堆顶 ${a.value(0)} 是最大的。`, 0);
    for (let end = n - 1; end > 0; end--) {
      a.swap(0, end);
      a.done.add(end);
      a.snap(`把堆顶 ${a.value(end)} 换到第 ${end} 位。`, 2, { tones: { [0]: "swap", [end]: "swap" }, range: [0, end], vars: { end } });
      sift(0, end);
    }
    a.done.add(0);
    a.snap("排序完成。", undefined);
    return a.frames;
  },
};

export const SORTING = [bubbleSort, selectionSort, insertionSort, quickSort, mergeSort, heapSort];
