import { expect, it, vi } from "vite-plus/test";
import { render } from "../../test/render";
import { MarketingLink } from "@amicited/ui-marketing";
it("routes internal destinations through the shell in web and hash-history clients", async () => {
  const navigate = vi.fn();
  window.addEventListener("amicited-navigate", navigate);
  try {
    await using screen = await render(
      <MarketingLink href="/prompts?site=project">Prompts</MarketingLink>,
    );
    await screen.getByRole("link", { name: "Prompts" }).click();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate.mock.calls[0]?.[0].detail).toBe("/prompts?site=project");
  } finally {
    window.removeEventListener("amicited-navigate", navigate);
  }
});
