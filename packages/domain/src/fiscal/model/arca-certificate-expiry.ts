const DAY_MS = 24 * 60 * 60 * 1000;

export const ARCA_CERTIFICATE_EXPIRY_WARNING_MS = 30 * DAY_MS;
export const ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS = 7 * DAY_MS;

export type ArcaCertificateExpiryStanding = { kind: "distant" } | { kind: "expiring" };

export function arcaCertificateExpiryStanding(
  notAfter: Date,
  now: Date,
): ArcaCertificateExpiryStanding {
  return notAfter.getTime() - now.getTime() <= ARCA_CERTIFICATE_EXPIRY_WARNING_MS
    ? { kind: "expiring" }
    : { kind: "distant" };
}
