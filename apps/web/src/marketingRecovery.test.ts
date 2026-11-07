import { expect, it, vi } from "vite-plus/test";
import { withMarketingReport } from "./marketingContext";
import { createMarketingResend } from "./marketingRecovery";
import { EnvironmentId, ThreadId, MessageId, ChatAttachmentId } from "@t3tools/contracts";
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
        attachments: [
          {
            type: "image" as const,
            id: ChatAttachmentId.make("original-image"),
            name: "campaign.png",
            mimeType: "image/png",
            sizeBytes: 512,
          },
        ],
        context: withMarketingReport(undefined, {
          id: "report",
          tool: "content.readability",
          input: { url: "https://example.com" },
          output: { words: 100, grade: 7 },
        })!,
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
