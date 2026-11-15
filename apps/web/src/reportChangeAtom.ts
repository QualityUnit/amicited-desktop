import type { ReportChange as ReportChangeSchema } from "@amicited/reports/rpc";
import { Atom, AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";

type ReportChange = typeof ReportChangeSchema.Type;

export function reportChangeAtom<E>(
  source: Atom.Atom<AsyncResult.AsyncResult<ReportChange, E>>,
  reportId: string,
) {
  return Atom.make((get): ReportChange | null => {
    const result = get(source);
    return result._tag === "Success" && result.value.reportId === reportId
      ? result.value
      : Option.getOrNull(get.self<ReportChange | null>());
  });
}
