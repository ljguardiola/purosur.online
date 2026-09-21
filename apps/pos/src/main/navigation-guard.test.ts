import { describe, expect, it, vi } from "vitest";
import { denyDisallowedNavigation, denyWindowOpen, isAllowedNavigation } from "./navigation-guard";

describe("isAllowedNavigation", () => {
  describe("with the interface served by the local development server", () => {
    const entry = "http://localhost:5173/";

    it("allows navigation within that exact server", () => {
      expect(isAllowedNavigation(entry, "http://localhost:5173/settings")).toBe(true);
    });

    it("denies another port on the same host", () => {
      expect(isAllowedNavigation(entry, "http://localhost:5174/")).toBe(false);
    });

    it("denies a remote site", () => {
      expect(isAllowedNavigation(entry, "https://example.com")).toBe(false);
    });

    it("denies a blob URL even when it was created by the same server", () => {
      expect(isAllowedNavigation(entry, "blob:http://localhost:5173/0b3f1c2a")).toBe(false);
    });

    it("denies data and about URLs", () => {
      expect(isAllowedNavigation(entry, "data:text/html,<h1>hi</h1>")).toBe(false);
      expect(isAllowedNavigation(entry, "about:blank")).toBe(false);
    });
  });

  describe("with the packaged interface loaded from its own file", () => {
    const entry =
      "file:///C:/Program%20Files/Puro%20Sur/resources/app.asar/out/renderer/index.html";

    it("allows reaching the interface's own page, including an in-page fragment", () => {
      expect(isAllowedNavigation(entry, entry)).toBe(true);
      expect(isAllowedNavigation(entry, `${entry}#/settings`)).toBe(true);
    });

    it("denies any other local file", () => {
      expect(isAllowedNavigation(entry, "file:///C:/Windows/System32/drivers/etc/hosts")).toBe(
        false,
      );
    });

    it("denies data, about and blob URLs", () => {
      expect(isAllowedNavigation(entry, "data:text/html,<h1>hi</h1>")).toBe(false);
      expect(isAllowedNavigation(entry, "about:blank")).toBe(false);
      expect(isAllowedNavigation(entry, "blob:null/0b3f1c2a")).toBe(false);
    });

    it("denies a remote site", () => {
      expect(isAllowedNavigation(entry, "https://example.com")).toBe(false);
    });
  });

  it("denies an empty or malformed target instead of throwing", () => {
    expect(isAllowedNavigation("http://localhost:5173/", "")).toBe(false);
    expect(isAllowedNavigation("http://localhost:5173/", "not a url")).toBe(false);
  });

  it("denies everything when the interface's own entry can't be read", () => {
    expect(isAllowedNavigation("", "http://localhost:5173/")).toBe(false);
    expect(isAllowedNavigation("about:blank", "about:blank")).toBe(false);
  });
});

describe("denyWindowOpen", () => {
  it("always denies opening a new window", () => {
    expect(denyWindowOpen()).toEqual({ action: "deny" });
  });
});

// Shared by both `will-navigate` and `will-redirect`, so a page that redirects itself away is
// blocked exactly like one that navigates there directly.
describe("denyDisallowedNavigation", () => {
  const entry = "http://localhost:5173/";

  it("prevents the default action for a disallowed target", () => {
    const event = { preventDefault: vi.fn() };

    denyDisallowedNavigation(entry, event, "https://example.com");

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves an allowed target's default action alone", () => {
    const event = { preventDefault: vi.fn() };

    denyDisallowedNavigation(entry, event, "http://localhost:5173/settings");

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
