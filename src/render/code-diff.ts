/**
 * 代码演变（code-steps）里，给每一步的每一行分配一个"身份"：
 * 和上一步相同的行沿用上一步的身份，新出现的行用新的身份。
 * 页面上按身份追踪每一行，切换步骤时没变的行平滑地挪到新位置，新行滑进来，删掉的行淡出去。
 *
 * 对比用最长公共子序列（逐行比较，忽略行尾空白），代码最多 40 行，直接算就行。
 */
export function lineIdentities(steps: string[][]): { keys: string[][]; changed: Set<number>[] } {
  const keys: string[][] = [];
  const changed: Set<number>[] = [];
  steps.forEach((lines, s) => {
    if (s === 0) {
      keys.push(lines.map((_, i) => `0-${i}`));
      changed.push(new Set());
      return;
    }
    const prev = steps[s - 1].map((l) => l.trimEnd());
    const cur = lines.map((l) => l.trimEnd());
    const m = prev.length;
    const n = cur.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = prev[i] === cur[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const stepKeys: string[] = new Array(n);
    const matched = new Set<number>();
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (prev[i] === cur[j]) {
        stepKeys[j] = keys[s - 1][i];
        matched.add(j);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    const fresh = new Set<number>();
    for (let k = 0; k < n; k++) {
      if (!matched.has(k)) {
        stepKeys[k] = `${s}-${k}`;
        // 空行不算改动，免得高亮一片空白
        if (cur[k].trim()) fresh.add(k);
      }
    }
    keys.push(stepKeys);
    changed.push(fresh);
  });
  return { keys, changed };
}
