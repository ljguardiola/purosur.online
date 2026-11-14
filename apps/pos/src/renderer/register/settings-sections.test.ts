import { describe, expect, it } from "vitest";
import { isSettingsSection, sectionToShow, shownSections } from "./settings-sections";

describe("shownSections", () => {
  it("shows the printer, then the scale and reader, then this register to a person who may configure both", () => {
    expect(shownSections(["configure_serial_devices", "configure_receipt_printer"])).toEqual([
      "printer",
      "devices",
      "register",
    ]);
  });

  it.each([
    { abilities: ["configure_receipt_printer"], shown: ["printer", "register"] },
    { abilities: ["configure_serial_devices"], shown: ["devices", "register"] },
    { abilities: ["view_sales_history"], shown: ["register"] },
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

  it("keeps this register when it is asked for", () => {
    expect(sectionToShow(["printer", "register"], "register")).toBe("register");
  });
});

describe("isSettingsSection", () => {
  it.each(["printer", "devices", "register"])("knows %s as a section", (value) => {
    expect(isSettingsSection(value)).toBe(true);
  });

  it.each(["", "other", 3, undefined])("does not know %s as a section", (value) => {
    expect(isSettingsSection(value)).toBe(false);
  });
});
