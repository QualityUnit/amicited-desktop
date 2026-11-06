import { expect, it, vi } from "vite-plus/test";
import { serializeFields, initialFields } from "./fields.js";
it("serializes nullable competitor lists and explicit boolean choices", () => {
  const properties = {
    competitors: { anyOf: [{ type: "array" }, { type: "null" }] },
    alphabet: { anyOf: [{ type: "boolean" }, { type: "null" }] },
  };
  expect(
    serializeFields(properties, [], { competitors: "Acme, Contoso, ", alphabet: "true" }),
  ).toEqual({ competitors: ["Acme", "Contoso"], alphabet: true });
  expect(serializeFields(properties, [], { alphabet: "false" })).toEqual({ alphabet: false });
  expect(serializeFields(properties, [], {})).toEqual({});
});

it("prefills the saved brand and restores inputs after an assistant connection detour", () => {
  const brand = { name: "Acme", website: "https://example.com" };
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(brand) });
  let saved: string | null = null;
  vi.stubGlobal("sessionStorage", { getItem: () => saved });
  try {
    const tool = { name: "ai.visibility.check" } as Parameters<typeof initialFields>[0];
    expect(initialFields(tool)).toEqual({
      brand: "Acme",
      website: "https://example.com",
      url: "https://example.com",
      domain: "example.com",
    });
    saved = JSON.stringify({ brand: "Another brand", competitors: "Contoso", category: "Shoes" });
    expect(initialFields(tool)).toEqual({
      brand: "Another brand",
      competitors: "Contoso",
      category: "Shoes",
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
