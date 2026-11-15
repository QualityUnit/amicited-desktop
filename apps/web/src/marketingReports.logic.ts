import type { Connection } from "@amicited/cloud-client/model";
import type { Domain } from "@amicited/cloud-client/domains";

export function canUseReportConnection(connection: Connection | null | undefined) {
  return connection?.state === "connected" && connection.auth === "apiKey";
}

export function findReportKeySource(
  domains: readonly Domain[],
  projectId: string,
  connectionFor: (projectId: string) => Connection | undefined,
) {
  return domains.find(
    (domain) =>
      domain.projectId !== projectId && canUseReportConnection(connectionFor(domain.projectId)),
  );
}
