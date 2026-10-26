import { describe, expect, it } from "vitest";
import { runsCloudZoneRulesVersion } from "./zone-rules-version.js";

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
