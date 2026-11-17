/* oxlint-disable shadcn/no-unknown-classes -- AmICited owns these setup classes. */
import type { ReactNode } from "react";
import type { AccountStatus } from "@amicited/cloud-client/rpc";
import type * as Schema from "effect/Schema";
import { AmICitedMark } from "@amicited/ui-marketing";
import { Button } from "../components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../components/ui/collapsible";
import { Spinner } from "../components/ui/spinner";
type Account = Schema.Schema.Type<typeof AccountStatus>;
export function AccountGateScreen({
  account,
  current,
  actions,
  workspaceSwitcher,
}: {
  account: Account;
  current: Account["workspaces"][number] | undefined;
  actions: { canManage: boolean; add(): unknown; cancel(): unknown; reopen(): unknown };
  workspaceSwitcher: ReactNode;
}) {
  const waiting = account.signingIn;
  const ended = account.state === "session_ended";
  return (
    <main data-am="am-setup" data-onboarding-surface="" aria-label="AmICited account">
      <div data-am="am-setup-column">
        <div data-am="am-setup-brand">
          <AmICitedMark />
        </div>
        {ended ? (
          workspaceSwitcher
        ) : (
          <nav data-am="am-setup-progress" aria-label="Setup progress">
            <span aria-current="step">Account</span>
            <span>Website</span>
            <span>Assistant</span>
            <span>AI apps</span>
            <span>Prompts</span>
          </nav>
        )}
        <header>
          <h1>
            {waiting
              ? "Finish signing in in your browser"
              : ended
                ? "Sign in again"
                : "Welcome to AmICited"}
          </h1>
          <p className="am-muted">
            {waiting
              ? "We opened the AmICited sign-in page. This screen moves on by itself when you are done."
              : ended
                ? "Your AmICited session ended. Sign in again; your local data is safe."
                : "Your AI workspace for marketing. From a question to a useful next step."}
          </p>
        </header>
        <section data-am="am-setup-cloud">
          {waiting ? (
            <>
              <h2 className="flex items-center gap-2">
                <Spinner /> Waiting for your browser…
              </h2>
              <p>The page stays valid for 10 minutes</p>
              <Button variant="outline" onClick={() => void actions.cancel()}>
                Cancel
              </Button>
              <Button variant="link" onClick={() => void actions.reopen()}>
                Open the sign-in page again
              </Button>
            </>
          ) : (
            <>
              {ended ? (
                <>
                  <p>Your websites, chats, results and AI sign-ins are still here.</p>
                  <p>
                    Daily checks are paused until you sign in. Last signed in as {current?.email}.
                  </p>
                </>
              ) : (
                <>
                  <ul>
                    <li>
                      Track 10 prompts a day in ChatGPT, Perplexity, Gemini and more, free, on this
                      computer
                    </li>
                    <li>Works through the accounts you already have, in your own browser</li>
                    <li>Your assistant turns what it finds into fixes for your website</li>
                  </ul>
                  <p>
                    Sign in with a free AmICited account to start. The same button creates your
                    account if you don't have one yet. No card needed.
                  </p>
                </>
              )}
              <div className="flex justify-end">
                <Button disabled={!actions.canManage} onClick={() => void actions.add()}>
                  Continue with AmICited
                </Button>
              </div>
            </>
          )}
          {ended && !waiting && (
            <>
              <Button variant="ghost" onClick={() => void actions.add()}>
                Use a different account
              </Button>
              <Collapsible>
                <CollapsibleTrigger>› Why did this happen?</CollapsibleTrigger>
                <CollapsiblePanel>
                  Your account's sign-in expired or was rejected. Sign in again to reconnect this
                  workspace. Your local data and AI sign-ins are safe.
                </CollapsiblePanel>
              </Collapsible>
            </>
          )}
          {!ended && !waiting && (
            <div className="am-disclosures">
              <Collapsible>
                <CollapsibleTrigger>› What is free and what needs a plan</CollapsibleTrigger>
                <CollapsiblePanel>
                  Up to 20 prompts a day on this computer, shared across workspaces. More prompts,
                  other countries and cloud tracking need an AmICited plan.
                </CollapsiblePanel>
              </Collapsible>
              <Collapsible>
                <CollapsibleTrigger>› How this works</CollapsibleTrigger>
                <CollapsiblePanel>
                  Your AI sign-ins stay on this computer. Checks run in your own browser while this
                  computer is on. AmICited never sees your passwords.
                </CollapsiblePanel>
              </Collapsible>
            </div>
          )}
          {account.error && <p role="alert">{account.error}</p>}
        </section>
        {waiting && (
          <BrowserSignInPreview
            email={current?.email}
            workspaces={account.workspaces.map((w) => w.name)}
          />
        )}
        <div className="flex-1" />
        <footer data-am="am-setup-footer">
          <Button variant="ghost" disabled>
            Back
          </Button>
          <span className="am-muted">
            {ended
              ? "No internet? The app keeps working offline while you are signed in."
              : "Sign in to continue. Your browser opens to finish."}
          </span>{" "}
        </footer>
      </div>
    </main>
  );
}

export function BrowserSignInPreview({
  email,
  workspaces,
}: {
  email?: string | undefined;
  workspaces: readonly string[];
}) {
  return (
    <section className="am-browser-example">
      <p className="am-muted">What you see in the browser</p>
      <div aria-hidden="true">
        <header>♙ app.flowhunt.io/amicited/connect</header>
        <div>
          <h3>Connect AmICited Desktop</h3>
          <p className="am-muted">
            {email
              ? `Signed in as ${email}. Choose a workspace to add to this computer.`
              : "Sign in to your AmICited account, then choose the workspace this computer should use."}
          </p>
          <div className="am-browser-workspaces">
            {workspaces.map((name) => (
              <span key={name}>{name}</span>
            ))}
            <span>{workspaces.length ? "Choose another workspace" : "Your workspace"}</span>
          </div>
          <footer>
            <span>Cancel</span>
            <span>Allow and return to the app</span>
          </footer>
        </div>
      </div>
    </section>
  );
}
