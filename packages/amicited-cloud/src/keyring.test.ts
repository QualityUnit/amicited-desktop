import { expect, it, vi } from "vite-plus/test";
import { KeyringUnavailable, keyringSecrets } from "./keyring.ts";

it("calls a locked keyring one at a time, caches reads and times callers out", async () => {
  let active = 0;
  let peak = 0;
  let gets = 0;
  const unlock = Promise.withResolvers<void>();
  const store = new Map<string, string>([["account", "token"]]);
  const secrets = keyringSecrets(
    {
      get: async (reference) => {
        gets++;
        peak = Math.max(peak, ++active);
        await unlock.promise;
        active--;
        return store.get(reference);
      },
      set: async (reference, value) => void store.set(reference, value),
      delete: async (reference) => void store.delete(reference),
    },
    20,
  );
  vi.useFakeTimers();
  const reads = ["one", "two", "three", "four"].map((): Promise<unknown> =>
    secrets("account")
      .read()
      .catch((error: unknown) => error),
  );
  await vi.advanceTimersByTimeAsync(20);
  vi.useRealTimers();
  for (const read of reads) expect(await read).toBeInstanceOf(KeyringUnavailable);
  expect(peak).toBe(1);
  unlock.resolve();
  expect(await secrets("account").read()).toBe("token");
  expect(await secrets("account").read()).toBe("token");
  expect(gets).toBe(1);
  await secrets("account").write("fresh");
  expect(await secrets("account").read()).toBe("fresh");
  await secrets("account").clear();
  expect(await secrets("account").read()).toBeUndefined();
  expect(gets).toBe(1);
});
