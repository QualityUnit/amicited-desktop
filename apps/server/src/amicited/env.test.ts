import { ENV_MAPPED_MARKER, applyAmicitedEnv } from "@amicited/identity/env";
import { describe, expect, it } from "vite-plus/test";

describe("applyAmicitedEnv", () => {
  it("drops a T3 Code user's T3CODE_* variables and maps AMICITED_* to them", () => {
    const env: Record<string, string | undefined> = {
      PATH: "/usr/bin",
      T3CODE_HOME: "/home/user/.t3",
      T3CODE_PORT: "3773",
      t3code_mode: "web",
      AMICITED_HOME: "/home/user/.amicited-custom",
      AMICITED_TELEMETRY_ENABLED: "0",
    };
    applyAmicitedEnv(env);
    expect(env).toEqual({
      PATH: "/usr/bin",
      AMICITED_HOME: "/home/user/.amicited-custom",
      AMICITED_TELEMETRY_ENABLED: "0",
      T3CODE_HOME: "/home/user/.amicited-custom",
      T3CODE_TELEMETRY_ENABLED: "0",
      [ENV_MAPPED_MARKER]: "1",
    });
  });

  it("leaves no T3CODE_* variable when no AMICITED_* is set", () => {
    const env: Record<string, string | undefined> = { T3CODE_HOME: "/home/user/.t3" };
    applyAmicitedEnv(env);
    expect(env).toEqual({ [ENV_MAPPED_MARKER]: "1" });
  });

  it("keeps the values an AmICited parent set for its child process", () => {
    const env: Record<string, string | undefined> = {
      [ENV_MAPPED_MARKER]: "1",
      AMICITED_PORT: "4000",
      T3CODE_PORT: "3874",
    };
    applyAmicitedEnv(env);
    expect(env).toEqual({
      [ENV_MAPPED_MARKER]: "1",
      AMICITED_PORT: "4000",
      T3CODE_PORT: "3874",
    });
  });

  it("is idempotent within one process", () => {
    const env: Record<string, string | undefined> = { AMICITED_HOME: "/a", T3CODE_HOME: "/t3" };
    applyAmicitedEnv(env);
    env.T3CODE_PORT = "3874";
    applyAmicitedEnv(env);
    expect(env.T3CODE_HOME).toBe("/a");
    expect(env.T3CODE_PORT).toBe("3874");
  });
});
