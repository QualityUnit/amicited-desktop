import type { SecretStorage } from "./index.ts";

export interface KeyringBackend {
  get(reference: string): Promise<string | undefined>;
  set(reference: string, value: string): Promise<void>;
  delete(reference: string): Promise<void>;
}

export class KeyringUnavailable extends Error {
  constructor() {
    super("Your system keyring is locked or not responding. Unlock it, then try again.");
  }
}

/**
 * A locked Linux keyring blocks each call on a libuv pool thread until someone answers the unlock
 * prompt; a few parallel calls exhaust the pool and stall every file read in the server. So calls
 * run one at a time, values are cached after the first read, and callers stop waiting after a
 * timeout while the stuck call keeps only its own thread.
 */
export function keyringSecrets(backend: KeyringBackend, timeoutMs = 15_000) {
  const cache = new Map<string, string | undefined>();
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(operation: () => Promise<T>) => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new KeyringUnavailable()), timeoutMs);
    });
    return Promise.race([result, timeout]).finally(() => clearTimeout(timer));
  };
  return (reference: string): SecretStorage => ({
    read: async () =>
      cache.has(reference)
        ? cache.get(reference)
        : run(async () => {
            if (cache.has(reference)) return cache.get(reference);
            const value = await backend.get(reference);
            cache.set(reference, value);
            return value;
          }),
    write: (value) =>
      run(async () => {
        await backend.set(reference, value);
        cache.set(reference, value);
      }),
    clear: () =>
      run(async () => {
        await backend.delete(reference);
        cache.set(reference, undefined);
      }),
  });
}
