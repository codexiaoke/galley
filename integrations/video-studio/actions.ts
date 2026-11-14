import type { FormState } from "../../src/app/admin/actions";

export async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `请求失败（${response.status}）`);
  return result as T;
}

export async function run(operation: () => Promise<unknown>): Promise<FormState> {
  try { await operation(); return { ok: true }; }
  catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}

export const duration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
