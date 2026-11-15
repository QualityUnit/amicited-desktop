import { threadChipCopyTarget } from "@t3tools/client-runtime/thread-reference";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  writeComposerContextClipboard: vi.fn(),
  tryCopyTextWithHaptic: vi.fn(),
}));

vi.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock("./composerContextClipboard", () => ({
  writeComposerContextClipboard: mocks.writeComposerContextClipboard,
}));
vi.mock("./copyTextWithHaptic", () => ({ tryCopyTextWithHaptic: mocks.tryCopyTextWithHaptic }));

import { copyThreadReference } from "./copyThreadReference";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeComposerContextClipboard.mockResolvedValue(undefined);
});

it("copies a thread as the in-app link, not a hosted web link", async () => {
  const target = threadChipCopyTarget(
    { environmentId: EnvironmentId.make("env-1"), threadId: ThreadId.make("thread-1") },
    "Fix the build",
  );

  await expect(copyThreadReference(target)).resolves.toBe(true);

  expect(mocks.writeComposerContextClipboard).toHaveBeenCalledWith(
    "<t3-thread://v2/env-1/thread-1>",
    target.fragment,
  );
});
