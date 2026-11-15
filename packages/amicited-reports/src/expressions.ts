import jsonata from "jsonata";
import type { Period } from "./period.ts";
export interface ExpressionContext {
  domain: string;
  period: Period;
  comparison: Period | null;
  report: { title: string };
}
export interface ExpressionOptions {
  timeoutMs?: number;
  maxDepth?: number;
}
interface Budget {
  started: number;
  timeoutMs: number;
  maxDepth: number;
  depth: number;
}
type Environment = jsonata.Environment & { base: object };
const budgets = new WeakMap<object, Budget>();
const cache = new Map<string, ReturnType<typeof jsonata>>();
const cacheLimit = 128;
function check(budget: Budget) {
  if (performance.now() - budget.started >= budget.timeoutMs)
    throw new Error("Expression time limit exceeded");
  if (budget.depth > budget.maxDepth) throw new Error("Expression depth limit exceeded");
}
function entry(_expression: unknown, _input: unknown, environment: Environment) {
  let budget = budgets.get(environment.base);
  if (!budget) {
    budget = environment.lookup("__reportBudget") as Budget;
    budgets.set(environment.base, budget);
  }
  budget.depth++;
  check(budget);
}
function exit(_expression: unknown, _input: unknown, environment: Environment) {
  const budget = budgets.get(environment.base)!;
  check(budget);
  budget.depth--;
}
export function expressionError(error: unknown): string {
  if (error && typeof error === "object") {
    const row = error as { message?: unknown; code?: unknown; position?: unknown };
    const message = typeof row.message === "string" ? row.message : "Expression failed";
    return `${message}${typeof row.code === "string" ? ` (${row.code})` : ""}${typeof row.position === "number" ? ` at position ${row.position}` : ""}`;
  }
  return String(error);
}
function rejectRegex(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (value instanceof RegExp || ("type" in value && value.type === "regex"))
    throw new Error("regular expressions are not supported in report expressions");
  for (const child of Object.values(value)) rejectRegex(child);
}
const MAX_STRING = 1024 * 1024;
const MAX_ITEMS = 10000;
const boundedNames = [
  "pad",
  "join",
  "split",
  "replace",
  "formatNumber",
  "formatBase",
  "formatInteger",
  "parseInteger",
  "fromMillis",
  "toMillis",
] as const;
type NativeDefinition = { implementation: (this: jsonata.Focus, ...args: unknown[]) => unknown };
let originals: Promise<Record<string, NativeDefinition>> | undefined;
async function boundedBuiltins() {
  // JSONata's native definitions retain signatures and implicit context arguments when shadowed.
  originals ??= jsonata(`{${boundedNames.map((name) => `"${name}":$${name}`).join(",")}}`).evaluate(
    {},
  ) as Promise<Record<string, NativeDefinition>>;
  return originals;
}
function guardBuiltin(name: string, args: unknown[]) {
  const fail = () => {
    throw new Error(`Report $${name} allocation limit exceeded`);
  };
  if (name === "pad") {
    const width = Math.abs(Number(args[1]));
    const source = typeof args[0] === "string" ? args[0] : "";
    const char = typeof args[2] === "string" && args[2] ? args[2] : " ";
    if (
      !Number.isFinite(width) ||
      width > MAX_STRING ||
      source.length + width * char.length > MAX_STRING
    )
      fail();
  }
  if (name === "join" && Array.isArray(args[0])) {
    const length =
      args[0].reduce((sum: number, v: unknown) => sum + (typeof v === "string" ? v.length : 0), 0) +
      Math.max(0, args[0].length - 1) * (typeof args[1] === "string" ? args[1].length : 0);
    if (length > MAX_STRING) fail();
  }
  if (name === "split") {
    if (typeof args[1] !== "string")
      throw new Error("Report $split supports literal string separators only");
    if (args[2] !== undefined && (Number(args[2]) > MAX_ITEMS || !Number.isFinite(Number(args[2]))))
      fail();
    args[2] ??= MAX_ITEMS + 1;
  }
  if (name === "replace") {
    if (typeof args[1] !== "string" || typeof args[2] !== "string")
      throw new Error("Report $replace supports literal strings only");
    const source = typeof args[0] === "string" ? args[0] : "";
    if (args[1] && source.length + (source.length / args[1].length) * args[2].length > MAX_STRING)
      fail();
  }
  if (
    ["formatNumber", "formatInteger", "parseInteger", "fromMillis", "toMillis"].includes(name) &&
    typeof args[1] === "string" &&
    args[1].length > 256
  )
    fail();
  // Word and roman-numeral pictures grow with the value; decimal pictures do not.
  if (
    name === "formatInteger" &&
    /^[IiWwAa]/.test(String(args[1] ?? "")) &&
    Math.abs(Number(args[0])) > 1000000
  )
    fail();
}
export async function evaluate(
  expression: string,
  input: unknown = {},
  bindings: Partial<ExpressionContext> = {},
  options: ExpressionOptions = {},
): Promise<unknown> {
  const budget: Budget = {
    started: performance.now(),
    timeoutMs: options.timeoutMs ?? 500,
    maxDepth: options.maxDepth ?? 100,
    depth: 0,
  };
  let compiled = cache.get(expression);
  if (!compiled) {
    compiled = jsonata(expression, { sequence: MAX_ITEMS });
    rejectRegex(compiled.ast());
    const builtins = await boundedBuiltins();
    for (const name of boundedNames) {
      const native = builtins[name]!;
      compiled.assign(name, {
        ...native,
        arity: native.implementation.length,
        implementation: async function (this: jsonata.Focus, ...args: unknown[]) {
          guardBuiltin(name, args);
          const result = await native.implementation.apply(this, args);
          if (name === "split" && Array.isArray(result) && result.length > MAX_ITEMS)
            throw new Error("Report $split allocation limit exceeded");
          return result;
        },
      });
    }
    compiled.assign("eval", () => {
      throw new Error("Dynamic evaluation is not supported in report expressions");
    });
    // JSONata 2.2 uses symbol hook names; its assign declaration still accepts only strings.
    const assign = compiled.assign as (name: string | symbol, value: unknown) => void;
    assign(Symbol.for("jsonata.__evaluate_entry"), entry);
    assign(Symbol.for("jsonata.__evaluate_exit"), exit);
    if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value!);
    cache.set(expression, compiled);
  }
  check(budget);
  const result = await compiled.evaluate(input, { ...bindings, __reportBudget: budget });
  const json = JSON.stringify(result);
  if (json !== undefined && Buffer.byteLength(json) > 5 * 1024 * 1024)
    throw new Error("Report expression result exceeds the 5 MB limit");
  return result;
}
export async function interpolate(
  text: string,
  input: unknown,
  context: Partial<ExpressionContext>,
): Promise<string> {
  let result = "";
  let offset = 0;
  for (const match of text.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    result +=
      text.slice(offset, match.index) + String((await evaluate(match[1]!, input, context)) ?? "");
    offset = match.index + match[0].length;
  }
  return result + text.slice(offset);
}
