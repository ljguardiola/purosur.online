import { describe, expect, it } from "vitest";
import { denyWindowOpen, isSameOriginNavigation } from "./navigation-guard";

describe("isSameOriginNavigation", () => {
  it("allows navigation that stays on the application's own origin", () => {
    expect(isSameOriginNavigation("http://localhost:5173", "http://localhost:5173/settings")).toBe(
      true,
    );
  });

  it("denies navigation to a different, remote origin", () => {
    expect(isSameOriginNavigation("http://localhost:5173", "https://example.com")).toBe(false);
  });

  it("denies a malformed target URL", () => {
    expect(isSameOriginNavigation("http://localhost:5173", "not a url")).toBe(false);
  });
});

describe("denyWindowOpen", () => {
  it("always denies opening a new window", () => {
    expect(denyWindowOpen()).toEqual({ action: "deny" });
  });
});
