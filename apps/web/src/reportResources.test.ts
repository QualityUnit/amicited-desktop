import { expect, it, vi } from "vite-plus/test";
import { fetchReportResource } from "./reportResources";

it("loads token-authenticated embedded previews from the destination environment", async () => {
  const read = vi
    .fn()
    .mockResolvedValue(
      new Response("<html>report</html>", { headers: { "content-type": "text/html" } }),
    );
  using _fetch = vi.spyOn(globalThis, "fetch").mockImplementation(read);
  const links = vi
    .fn()
    .mockResolvedValue({ preview: "/api/amicited/reports/r/preview?token=signed" });
  expect(
    await (
      await fetchReportResource(links, { reportId: "r" }, "preview", "https://remote.example:8464/")
    ).text(),
  ).toBe("<html>report</html>");
  expect(String(read.mock.calls[0]?.[0])).toBe(
    "https://remote.example:8464/api/amicited/reports/r/preview?token=signed&embed=1",
  );
});

it("re-mints a signed export after 401 and preserves export setup errors", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(new Response("expired", { status: 401 }))
    .mockResolvedValueOnce(
      new Response("Run t3 browser setup to install Chrome.", { status: 503 }),
    );
  using _fetch = vi.spyOn(globalThis, "fetch").mockImplementation(read);
  const links = vi
    .fn()
    .mockResolvedValueOnce({ pdf: "/api/amicited/reports/snapshots/s.pdf?token=old" })
    .mockResolvedValueOnce({ pdf: "/api/amicited/reports/snapshots/s.pdf?token=fresh" });
  await expect(
    fetchReportResource(links, { snapshotId: "s" }, "pdf", "http://localhost:8464/"),
  ).rejects.toThrow("Run t3 browser setup to install Chrome.");
  expect(links).toHaveBeenCalledTimes(2);
  expect(String(read.mock.calls[1]?.[0])).toContain("token=fresh");
});
