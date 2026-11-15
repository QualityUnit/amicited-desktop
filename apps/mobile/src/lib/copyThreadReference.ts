import type { ThreadReferenceCopyTarget } from "@t3tools/client-runtime/thread-reference";
import { formatThreadLink } from "@t3tools/shared/threadLinks";
import * as Haptics from "expo-haptics";

import { writeComposerContextClipboard } from "./composerContextClipboard";
import { tryCopyTextWithHaptic } from "./copyTextWithHaptic";

/**
 * TODO(amicited-infra): copy the hosted web link once AmICited hosts one. Until then a thread copies
 * as the in-app link, which pastes back into a composer as a thread chip.
 * https://github.com/QualityUnit/amicited-desktop/blob/main/apps/mobile/README.md#app-identity-and-amicited-infrastructure
 */
function copyText(target: ThreadReferenceCopyTarget): string {
  const record = target.kind === "thread" ? target.fragment?.records[0] : undefined;
  return record?.kind === "thread" && "threadId" in record
    ? formatThreadLink(record)
    : target.value;
}

/** Resolves false, after logging why, when the clipboard write fails. */
export async function copyThreadReference(target: ThreadReferenceCopyTarget): Promise<boolean> {
  const text = copyText(target);
  if (!target.fragment) return tryCopyTextWithHaptic(text, { target: target.clipboardTarget });
  try {
    await writeComposerContextClipboard(text, target.fragment);
  } catch (error) {
    console.error(`Failed to copy ${target.clipboardTarget} to the clipboard.`, error);
    return false;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  return true;
}
