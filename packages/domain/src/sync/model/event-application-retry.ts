export const EVENT_APPLICATION_MAX_ATTEMPTS = 8;

const FIRST_RETRY_DELAY_MS = 30 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

export type AfterFailedAttempt = { kind: "retry"; at: Date } | { kind: "quarantine" };

export function retryDelayMs(attempts: number): number {
  return Math.min(FIRST_RETRY_DELAY_MS * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS);
}

export function afterFailedAttempt(attempts: number, failedAt: Date): AfterFailedAttempt {
  if (attempts >= EVENT_APPLICATION_MAX_ATTEMPTS) {
    return { kind: "quarantine" };
  }
  return { kind: "retry", at: new Date(failedAt.getTime() + retryDelayMs(attempts)) };
}
