import { describe, expect, it } from "vitest";
import {
  INSTALLATION_REPORT_MAX_LENGTH,
  isInstallationReportTooLong,
} from "./installation-report.js";

describe("isInstallationReportTooLong", () => {
  it("allows a reported hostname or Windows version of up to 255 characters", () => {
    expect(INSTALLATION_REPORT_MAX_LENGTH).toBe(255);
  });

  it("accepts a value of exactly 255 characters", () => {
    expect(isInstallationReportTooLong("a".repeat(INSTALLATION_REPORT_MAX_LENGTH))).toBe(false);
  });

  it("rejects a value of 256 characters", () => {
    expect(isInstallationReportTooLong("a".repeat(INSTALLATION_REPORT_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each character outside the Basic Multilingual Plane once", () => {
    expect(isInstallationReportTooLong("🖥".repeat(INSTALLATION_REPORT_MAX_LENGTH))).toBe(false);
  });
});
