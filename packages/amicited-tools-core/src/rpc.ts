import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
export const marketingRpcs = [
  Rpc.make("amicited.tools.list", {
    success: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
  }),
  Rpc.make("amicited.tools.run", {
    payload: { name: Schema.String, input: Schema.Unknown },
    success: Schema.Record(Schema.String, Schema.Unknown),
  }),
] as const;
