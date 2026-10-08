const MAX_ATTEMPTS = 8;
const FIRST_RETRY_DELAY_MS = 30 * 1000;

export type AfterFailedAttempt = { kind: "retry"; at: Date } | { kind: "quarantine" };

export function afterFailedAttempt(attempts: number, failedAt: Date): AfterFailedAttempt {
  if (attempts >= MAX_ATTEMPTS) {
    return { kind: "quarantine" };
  }
  const delayMs = FIRST_RETRY_DELAY_MS * 2 ** (attempts - 1);
  return { kind: "retry", at: new Date(failedAt.getTime() + delayMs) };
}
