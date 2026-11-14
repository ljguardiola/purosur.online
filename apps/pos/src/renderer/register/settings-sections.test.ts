import { describe, expect, it } from "vitest";
import { isSettingsSection, sectionToShow, shownSections } from "./settings-sections";

describe("shownSections", () => {
  it("shows the printer and then the scale and reader to a person who may configure both", () => {
    expect(shownSections(["configure_serial_devices", "configure_receipt_printer"])).toEqual([
      "printer",
      "devices",
    ]);
  });

  it.each([
    { abilities: ["configure_receipt_printer"], shown: ["printer"] },
    { abilities: ["configure_serial_devices"], shown: ["devices"] },
    { abilities: ["view_sales_history"], shown: [] },
  ] as const)("shows $shown to a person with $abilities", ({ abilities, shown }) => {
    expect(shownSections(abilities)).toEqual(shown);
  });
});

describe("sectionToShow", () => {
  it("keeps the section asked for when it is shown", () => {
    expect(sectionToShow(["printer", "devices"], "devices")).toBe("devices");
  });

  it("falls back to the first shown section when none is asked for", () => {
    expect(sectionToShow(["devices"], undefined)).toBe("devices");
  });

  it("falls back to the first shown section when the one asked for is not shown", () => {
    expect(sectionToShow(["printer"], "devices")).toBe("printer");
  });

  it("shows nothing when no section is shown", () => {
    expect(sectionToShow([], "printer")).toBeUndefined();
  });
});

describe("isSettingsSection", () => {
  it.each(["printer", "devices"])("knows %s as a section", (value) => {
    expect(isSettingsSection(value)).toBe(true);
  });

  it.each(["register", "", 3, undefined])("does not know %s as a section", (value) => {
    expect(isSettingsSection(value)).toBe(false);
  });
});
