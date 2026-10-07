import { arcaCertificateExpiryStanding } from "../model/arca-certificate-expiry.js";
import type { ArcaCertificateExpiryPorts } from "./arca-certificate-expiry-store.js";

export interface CheckArcaCertificateExpiryInput {
  environment: string;
  notAfter: Date;
}

export type CheckArcaCertificateExpiryOutcome =
  | { kind: "distant" }
  | { kind: "opened" }
  | { kind: "unchanged" }
  | { kind: "resolved" }
  | { kind: "replaced" };

export async function checkArcaCertificateExpiry(
  { store, clock }: ArcaCertificateExpiryPorts,
  { environment, notAfter }: CheckArcaCertificateExpiryInput,
): Promise<CheckArcaCertificateExpiryOutcome> {
  return store.transaction<CheckArcaCertificateExpiryOutcome>(async (tx) => {
    const now = clock.now();
    const open = await tx.lockOpenCertificateExpiringAlert(environment);
    if (open?.notAfter.getTime() === notAfter.getTime()) {
      return { kind: "unchanged" };
    }

    const expiring = arcaCertificateExpiryStanding(notAfter, now).kind === "expiring";
    if (open) {
      await tx.resolveCertificateExpiringAlert(open.alertId, now);
    }
    if (expiring) {
      await tx.openCertificateExpiringAlert({ environment, notAfter, openedAt: now });
    }

    if (!open) {
      return { kind: expiring ? "opened" : "distant" };
    }
    return { kind: expiring ? "replaced" : "resolved" };
  });
}
