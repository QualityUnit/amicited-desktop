import * as Schema from "effect/Schema";

export interface ToolContext {
  readonly signal: AbortSignal;
}
export interface ToolDefinition<Input, Output> {
  readonly name: string;
  readonly pack: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly input: Schema.Codec<Input>;
  readonly output: Schema.Codec<Output>;
  readonly cost: "free";
  readonly timeoutMs: number;
  readonly schedulable: boolean;
  readonly sideEffects: "none" | "writes-local" | "posts-external" | "spends-money";
  readonly run: (input: Input, ctx: ToolContext) => Promise<Output>;
}
export interface ToolResult {
  readonly id: string;
  readonly tool: string;
  readonly input: unknown;
  readonly output?: unknown;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly status: "success" | "error";
  readonly error?: {
    readonly code: "not_found" | "invalid_input" | "timeout" | "execution";
    readonly message: string;
  };
}
export interface ToolCard {
  readonly name: string;
  readonly pack: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly cost: "free";
  readonly timeoutMs: number;
  readonly schedulable: boolean;
  readonly sideEffects: ToolDefinition<unknown, unknown>["sideEffects"];
}
interface RegisteredTool {
  readonly card: ToolCard;
  readonly execute: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  register<I, O>(tool: ToolDefinition<I, O>): void {
    if (this.tools.has(tool.name)) throw new Error("Duplicate tool: " + tool.name);
    const { run: _run, input, output, ...metadata } = tool;
    this.tools.set(tool.name, {
      card: {
        ...metadata,
        inputSchema: Schema.toJsonSchemaDocument(input).schema,
        outputSchema: Schema.toJsonSchemaDocument(output).schema,
      },
      execute: async (value, ctx) => {
        let decoded: I;
        try {
          decoded = Schema.decodeUnknownSync(input)(value);
        } catch {
          throw new InvalidInput();
        }
        return Schema.decodeSync(output)(await tool.run(decoded, ctx));
      },
    });
  }
  list(): readonly ToolCard[] {
    return Array.from(this.tools.values(), (tool) => tool.card);
  }
  get(name: string): ToolCard | undefined {
    return this.tools.get(name)?.card;
  }
  search(query: string): readonly ToolCard[] {
    const words = query.toLowerCase().trim().split(/\s+/);
    return this.list().filter((tool) =>
      words.every((word) =>
        [tool.title, tool.description, tool.name, ...tool.keywords]
          .join(" ")
          .toLowerCase()
          .includes(word),
      ),
    );
  }
  async run(name: string, input: unknown): Promise<ToolResult> {
    const start = Date.now();
    const base = {
      id: crypto.randomUUID(),
      tool: name,
      input,
      startedAt: new Date(start).toISOString(),
    };
    const tool = this.tools.get(name);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!tool)
        return {
          ...base,
          durationMs: Date.now() - start,
          status: "error",
          error: { code: "not_found", message: "This tool is not available." },
        };
      const output = await Promise.race([
        tool.execute(input, { signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ToolTimeout());
          }, tool.card.timeoutMs);
        }),
      ]);
      return { ...base, output, durationMs: Date.now() - start, status: "success" };
    } catch (error) {
      const code =
        error instanceof InvalidInput
          ? "invalid_input"
          : error instanceof ToolTimeout
            ? "timeout"
            : "execution";
      return {
        ...base,
        durationMs: Date.now() - start,
        status: "error",
        error: {
          code,
          message:
            code === "invalid_input"
              ? "Check the tool inputs and try again."
              : code === "timeout"
                ? "The check took too long. Try again."
                : "The check could not finish. Check the domain and your connection.",
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
class InvalidInput extends Error {}
class ToolTimeout extends Error {}

export function isUsefulResult(result: { status: string; output?: unknown }) {
  if (result.status !== "success" || !result.output || typeof result.output !== "object")
    return false;
  const output = result.output as Record<string, unknown>;
  if (Object.keys(output).length === 0) return false;
  if ("draft" in output && (typeof output.draft !== "string" || !output.draft.trim())) return false;
  if (
    [
      "needs_provider",
      "could_not_check",
      "could_not_generate",
      "verification_required",
      "consent_required",
      "could_not_parse",
    ].includes(String(output.status))
  )
    return false;
  if (
    output.summary &&
    typeof output.summary === "object" &&
    "answered" in output.summary &&
    Number(output.summary.answered) === 0
  )
    return false;
  if (
    Array.isArray(output.groups) &&
    !output.groups.some((g) => typeof g.result?.score === "number")
  )
    return false;
  if ("score" in output && output.score === null) return false;
  if ("words" in output && Number(output.words) === 0) return false;
  return true;
}

export function friendlyAssistant(value: string) {
  return /claude/i.test(value)
    ? "Claude"
    : /codex|chatgpt/i.test(value)
      ? "ChatGPT"
      : /gemini/i.test(value)
        ? "Gemini"
        : value;
}

export { marketingWebsiteInstructions } from "./websiteContext.ts";
