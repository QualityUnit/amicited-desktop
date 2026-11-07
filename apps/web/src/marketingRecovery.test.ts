import { expect, it, vi } from "vite-plus/test";
import { createMarketingResend } from "./marketingRecovery";
import { EnvironmentId, ThreadId, MessageId } from "@t3tools/contracts";
it("resends exactly once when ready and preserves the original message identity and context", async () => {
  const resend = createMarketingResend();
  const request = {
    environmentId: EnvironmentId.make("local"),
    input: {
      threadId: ThreadId.make("chat"),
      message: {
        messageId: MessageId.make("original"),
        role: "user" as const,
        text: "Explain my report",
        attachments: [],
        context: { version: 1 as const, records: [] },
      },
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
    },
  };
  const send = vi.fn(async () => ({ _tag: "Success" }));
  await resend(false, send, request);
  expect(send).not.toHaveBeenCalled();
  await Promise.all([resend(true, send, request), resend(true, send, request)]);
  expect(send).toHaveBeenCalledExactlyOnceWith(request);
});
