import { describe, expect, it } from "vitest";
import {
  ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS,
  ARCA_CERTIFICATE_EXPIRY_WARNING_MS,
  arcaCertificateExpiryStanding,
} from "./arca-certificate-expiry.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-01T12:00:00.000Z");

describe("ARCA certificate expiry policy", () => {
  it("warns 30 days before the certificate expires", () => {
    expect(ARCA_CERTIFICATE_EXPIRY_WARNING_MS).toBe(30 * DAY_MS);
  });

  it("escalates 7 days before the certificate expires", () => {
    expect(ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS).toBe(7 * DAY_MS);
  });
});

describe("arcaCertificateExpiryStanding", () => {
  it("is distant while more than 30 days remain", () => {
    const notAfter = new Date(NOW.getTime() + 30 * DAY_MS + 1);
    expect(arcaCertificateExpiryStanding(notAfter, NOW)).toEqual({ kind: "distant" });
  });

  it("is expiring when exactly 30 days remain", () => {
    const notAfter = new Date(NOW.getTime() + 30 * DAY_MS);
    expect(arcaCertificateExpiryStanding(notAfter, NOW)).toEqual({ kind: "expiring" });
  });

  it("is expiring once the certificate has expired", () => {
    const notAfter = new Date(NOW.getTime() - DAY_MS);
    expect(arcaCertificateExpiryStanding(notAfter, NOW)).toEqual({ kind: "expiring" });
  });
});
