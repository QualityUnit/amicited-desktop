import { expect, it, vi } from "vite-plus/test";
import { render } from "../../test/render";
import { AccountGateScreen } from "./AccountGateScreen";
import type { ComponentProps } from "react";
function setup() {
  return {
    account: { state: "signed_out", signingIn: false, workspaces: [] },
    current: undefined,
    actions: { canManage: true, add: vi.fn(), cancel: vi.fn(), reopen: vi.fn() },
    workspaceSwitcher: null,
  } satisfies ComponentProps<typeof AccountGateScreen>;
}
it("starts account sign-in and exposes the local free tracking disclosure", async () => {
  const props = setup();
  await using screen = await render(<AccountGateScreen {...props} />);
  await screen.getByRole("button", { name: "Continue with AmICited" }).click();
  expect(props.actions.add).toHaveBeenCalledOnce();
  await screen.getByRole("button", { name: /What is free/ }).click();
  await expect.element(screen.getByText(/Up to 20 prompts a day/)).toBeVisible();
});
it("allows cancellation and reopening while browser sign-in is pending", async () => {
  const props = setup();
  await using screen = await render(
    <AccountGateScreen {...props} account={{ ...props.account, signingIn: true }} />,
  );
  await screen.getByRole("button", { name: "Cancel" }).click();
  await screen.getByRole("button", { name: "Open the sign-in page again" }).click();
  expect(props.actions.cancel).toHaveBeenCalledOnce();
  expect(props.actions.reopen).toHaveBeenCalledOnce();
});
it("explains paused tracking for a rejected session", async () => {
  const props = setup();
  await using screen = await render(
    <AccountGateScreen {...props} account={{ ...props.account, state: "session_ended" }} />,
  );
  await expect.element(screen.getByRole("heading", { name: "Sign in again" })).toBeVisible();
  await expect
    .element(screen.getByText(/AmICited now signs in once for all your workspaces/))
    .toBeVisible();
  await expect
    .element(screen.getByText(/Your local websites, chats, results and AI sign-ins are still here/))
    .toBeVisible();
  await expect.element(screen.getByText(/Daily checks are paused/)).toBeVisible();
});
