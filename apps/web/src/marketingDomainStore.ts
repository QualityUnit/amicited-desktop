import type { Domain } from "@amicited/cloud-client/domains";
export const cache =
  (import.meta.hot?.data.domainCache as Map<string, readonly Domain[]> | undefined) ??
  new Map<string, readonly Domain[]>();
export const readFailures = new Set<string>();
export const listeners = new Set<() => void>();
export const empty: readonly Domain[] = [];
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function publish(environmentId: string, rows: readonly Domain[]) {
  cache.set(environmentId, rows);
  listeners.forEach((listener) => listener());
}
export function readDomain(environmentId: string, projectId: string | undefined) {
  return cache.get(environmentId)?.find((domain) => domain.projectId === projectId);
}

if (import.meta.hot)
  import.meta.hot.dispose((data) => {
    data.domainCache = cache;
  });
