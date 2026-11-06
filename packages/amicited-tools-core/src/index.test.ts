import { describe, it, expect, vi } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ToolRegistry, isUsefulResult, type ToolDefinition } from "./index.ts";
const definition = (
  run: ToolDefinition<string, string>["run"],
  timeoutMs = 50,
): ToolDefinition<string, string> => ({
  name: "test.check",
  pack: "seo",
  title: "Check",
  description: "Check certificate",
  keywords: ["ssl"],
  input: Schema.String,
  output: Schema.String,
  cost: "free",
  timeoutMs,
  schedulable: true,
  sideEffects: "none",
  run,
});
describe("ToolRegistry", () => {
  it("validates input and output and returns structured failures", async () => {
    const registry = new ToolRegistry();
    const run = vi.fn(async (input: string) => input.toUpperCase());
    registry.register(definition(run));
    expect(registry.search("ssl")).toHaveLength(1);
    expect(registry.get("test.check")?.inputSchema).toMatchObject({ type: "string" });
    expect(() => registry.register(definition(run))).toThrow("Duplicate");
    expect(await registry.run("test.check", 42)).toMatchObject({
      status: "error",
      error: { code: "invalid_input" },
    });
    expect(run).not.toHaveBeenCalled();
    expect(await registry.run("test.check", "ok")).toMatchObject({
      status: "success",
      output: "OK",
    });
    expect(await registry.run("missing", {})).toMatchObject({
      status: "error",
      error: { code: "not_found" },
    });
    const broken = new ToolRegistry();
    broken.register(
      definition(async () => {
        throw new Error("private details");
      }),
    );
    expect(await broken.run("test.check", "")).toMatchObject({
      status: "error",
      error: { code: "execution" },
    });
  });
  it("aborts timed out tools", async () => {
    vi.useFakeTimers();
    const registry = new ToolRegistry();
    let signal: AbortSignal | undefined;
    registry.register(
      definition(async (_, ctx) => {
        signal = ctx.signal;
        return new Promise(() => {});
      }),
    );
    const result = registry.run("test.check", "");
    await vi.advanceTimersByTimeAsync(51);
    expect(await result).toMatchObject({ status: "error", error: { code: "timeout" } });
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});

it("rejects blocked and unreadable searches as first wins", () => {
  for (const status of ["verification_required", "consent_required", "could_not_parse"]) {
    expect(isUsefulResult({ status: "success", output: { status, organic: [] } })).toBe(false);
  }
});
