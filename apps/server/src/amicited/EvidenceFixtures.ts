import { FakePage } from "@amicited/visibility/testing";
import answers from "./fixtures/answers.json" with { type: "json" };
export function evidenceEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    import.meta.url.endsWith(".ts") &&
    env.NODE_ENV === "development" &&
    env.T3CODE_DEV_REPLAY_CAPTURE === "1" &&
    env.T3CODE_DEV_AMICITED_EVIDENCE === "1"
  );
}
export function evidencePage(index: number, beforeAnswer?: () => Promise<void>) {
  const answer = answers[index % answers.length]!;
  return new FakePage({
    loggedIn: true,
    answer: { text: answer.text, links: answer.links.map((url) => ({ url })) },
    ...(beforeAnswer ? { onSend: beforeAnswer } : {}),
  });
}
