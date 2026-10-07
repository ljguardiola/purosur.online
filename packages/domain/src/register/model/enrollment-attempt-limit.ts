import {
  type SlidingWindowLimit,
  slidingWindowRetryAfterSeconds,
  slidingWindowStart,
} from "../../shared/index.js";

export const ENROLLMENT_ATTEMPT_LIMIT = 10;
export const ENROLLMENT_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

const ENROLLMENT_ATTEMPTS: SlidingWindowLimit = {
  limit: ENROLLMENT_ATTEMPT_LIMIT,
  windowMs: ENROLLMENT_ATTEMPT_WINDOW_MS,
};

export function enrollmentAttemptWindowStart(now: Date): Date {
  return slidingWindowStart(now, ENROLLMENT_ATTEMPTS);
}

export function enrollmentAttemptRetryAfterSeconds(
  acceptedAttempts: readonly Date[],
  now: Date,
): number | undefined {
  return slidingWindowRetryAfterSeconds(acceptedAttempts, now, ENROLLMENT_ATTEMPTS);
}
