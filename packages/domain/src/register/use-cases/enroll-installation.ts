import {
  enrollmentAttemptRetryAfterSeconds,
  enrollmentAttemptWindowStart,
} from "../model/enrollment-attempt-limit.js";
import { enrollmentCodeLookup, isEnrollmentCodeUsable } from "../model/enrollment-code.js";
import type { EnrollmentAttemptKey, EnrollmentPorts } from "./register-store.js";

export interface EnrollInstallationInput {
  code: string;
  sourceAddress: string;
  hostname: string;
  windowsVersion: string;
}

export type EnrollInstallationOutcome =
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "code_rejected" }
  | { kind: "enrolled"; registerId: string; deviceId: string; deviceToken: string };

export async function enrollInstallation(
  { store, clock, tokens, codes }: EnrollmentPorts,
  input: EnrollInstallationInput,
): Promise<EnrollInstallationOutcome> {
  return store.transaction<EnrollInstallationOutcome>(async (tx) => {
    const now = clock.now();

    // The codes are locked before the attempt counters, so two attempts at the same code wait for
    // each other before either one counts, fails or redeems it.
    const candidates = await tx.lockEnrollmentCodes(enrollmentCodeLookup(input.code));
    const keys: EnrollmentAttemptKey[] = [
      { kind: "source_address", value: input.sourceAddress },
      ...candidates.map((code) => ({ kind: "register" as const, value: code.registerId })),
    ];
    await tx.lockEnrollmentAttempts(keys);

    const windowStart = enrollmentAttemptWindowStart(now);
    let retryAfterSeconds: number | undefined;
    for (const key of keys) {
      const accepted = await tx.acceptedEnrollmentAttempts(key, windowStart);
      const keyRetryAfter = enrollmentAttemptRetryAfterSeconds(accepted, now);
      if (keyRetryAfter !== undefined) {
        retryAfterSeconds = Math.max(retryAfterSeconds ?? 0, keyRetryAfter);
      }
    }
    if (retryAfterSeconds !== undefined) {
      return { kind: "rate_limited", retryAfterSeconds };
    }
    await tx.recordEnrollmentAttempt(keys, now);

    const matched = candidates.find((code) => codes.matches(input.code, code.codeHash));
    if (!matched) {
      const aimedAt = candidates
        .filter((code) => isEnrollmentCodeUsable(code, now))
        .map((code) => code.registerId);
      if (aimedAt.length > 0) {
        await tx.recordFailedEnrollmentAttempt(aimedAt);
      }
      return { kind: "code_rejected" };
    }
    if (!isEnrollmentCodeUsable(matched, now)) {
      return { kind: "code_rejected" };
    }

    const { revoked } = await tx.revokeActiveInstallation(matched.registerId, now);
    const issued = tokens.issue();
    const { deviceId } = await tx.recordInstallation({
      registerId: matched.registerId,
      tokenLookupPrefix: issued.lookupPrefix,
      tokenHash: issued.tokenHash,
      tokenIssuedAt: now,
      hostname: input.hostname,
      windowsVersion: input.windowsVersion,
      enrolledAt: now,
    });
    await tx.markEnrollmentCodeRedeemed(matched.registerId, now);
    await tx.openEnrollmentAlert({
      registerId: matched.registerId,
      deviceId,
      hostname: input.hostname,
      windowsVersion: input.windowsVersion,
      replacedInstallation: revoked,
      enrolledAt: now,
    });

    return {
      kind: "enrolled",
      registerId: matched.registerId,
      deviceId,
      deviceToken: issued.deviceToken,
    };
  });
}
