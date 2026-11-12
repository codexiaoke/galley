/** 核心层的错误。MCP 和后台都把 message 原样展示给调用方，所以要写成可以据此修正的句子。 */
export class GalleyError extends Error {
  constructor(
    public readonly code: "forbidden" | "not_found" | "invalid" | "conflict",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "GalleyError";
  }
}

export const forbidden = (message: string) => new GalleyError("forbidden", message);
export const notFound = (message: string) => new GalleyError("not_found", message);
export const invalid = (message: string, details?: unknown) => new GalleyError("invalid", message, details);
export const conflict = (message: string, details?: unknown) => new GalleyError("conflict", message, details);
