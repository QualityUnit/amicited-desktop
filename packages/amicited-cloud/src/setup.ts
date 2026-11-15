export interface SetupState {
  finished: boolean;
  lastDomain?: string;
}
export function shouldShowSetup(loaded: boolean, domainCount: number, finished: boolean) {
  return loaded && domainCount === 0 && !finished;
}
export function defaultDomain<T extends { projectId: string }>(
  domains: readonly T[],
  lastDomain?: string | null,
) {
  return domains.find((d) => d.projectId === lastDomain) ?? domains[0];
}
