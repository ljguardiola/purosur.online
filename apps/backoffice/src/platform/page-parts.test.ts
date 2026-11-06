import { describe, expect, it } from "vitest";
import { landingPart, type PagePart, pagePartsFor } from "./page-parts";

type Access = { granted: readonly string[] };

function partFor(key: "documents" | "tasks" | "settings"): PagePart<Access, typeof key> {
  return { key, isVisibleTo: (access) => access.granted.includes(key) };
}

const parts = [partFor("documents"), partFor("tasks"), partFor("settings")];

function accessTo(...granted: string[]): Access {
  return { granted };
}

describe("pagePartsFor", () => {
  it("lists the parts the person may see, in the order the page declares them", () => {
    expect(pagePartsFor(accessTo("settings", "documents"), parts)).toEqual({
      kind: "shown",
      visible: ["documents", "settings"],
      defaultPart: "documents",
    });
  });

  it("makes the first visible part the default when the first declared one is hidden", () => {
    expect(pagePartsFor(accessTo("settings", "tasks"), parts)).toEqual({
      kind: "shown",
      visible: ["tasks", "settings"],
      defaultPart: "tasks",
    });
  });

  it("shows the page when a single part is visible", () => {
    expect(pagePartsFor(accessTo("settings"), parts)).toEqual({
      kind: "shown",
      visible: ["settings"],
      defaultPart: "settings",
    });
  });

  it("hides the page when no part is visible", () => {
    expect(pagePartsFor(accessTo("unrelated"), parts)).toEqual({ kind: "hidden" });
  });

  it("hides a page that declares no part", () => {
    expect(pagePartsFor(accessTo("documents"), [])).toEqual({ kind: "hidden" });
  });
});

describe("landingPart", () => {
  const shown = { kind: "shown", visible: ["tasks", "settings"], defaultPart: "tasks" } as const;

  it("lands on the requested part when it is visible", () => {
    expect(landingPart(shown, "settings")).toBe("settings");
  });

  it("lands on the default part when the requested one is hidden", () => {
    expect(landingPart(shown, "documents")).toBe("tasks");
  });

  it("lands on the default part when no part is requested", () => {
    expect(landingPart(shown)).toBe("tasks");
  });
});
