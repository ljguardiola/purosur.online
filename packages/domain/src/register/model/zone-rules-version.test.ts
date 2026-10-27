import { describe, expect, it } from "vitest";
import {
  currentZoneRulesPublication,
  nextZoneRulesPublicationNumber,
  runsCloudZoneRulesVersion,
} from "./zone-rules-version.js";

describe("runsCloudZoneRulesVersion", () => {
  it("holds when the register runs the very version the cloud publishes", () => {
    expect(runsCloudZoneRulesVersion("2026a", "2026a")).toBe(true);
  });

  it("does not hold when the register runs another version", () => {
    expect(runsCloudZoneRulesVersion("2025c", "2026a")).toBe(false);
  });

  it("does not hold for a register that has not received any version yet", () => {
    expect(runsCloudZoneRulesVersion(null, "2026a")).toBe(false);
  });
});

describe("currentZoneRulesPublication", () => {
  it("is none while no version is published", () => {
    expect(currentZoneRulesPublication([])).toBeUndefined();
  });

  it("is the one published last, whatever its version is named and in whatever order they are given", () => {
    expect(
      currentZoneRulesPublication([
        { version: "2026a", publicationNumber: 2 },
        { version: "2025c", publicationNumber: 3 },
        { version: "2026b", publicationNumber: 1 },
      ]),
    ).toEqual({ version: "2025c", publicationNumber: 3 });
  });
});

describe("nextZoneRulesPublicationNumber", () => {
  it("is the first number while no version is published", () => {
    expect(nextZoneRulesPublicationNumber([])).toBe(1);
  });

  it("follows the number of the one published last", () => {
    expect(
      nextZoneRulesPublicationNumber([
        { version: "2026a", publicationNumber: 4 },
        { version: "2025c", publicationNumber: 2 },
      ]),
    ).toBe(5);
  });
});
