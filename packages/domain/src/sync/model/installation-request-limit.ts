import {
  type SlidingWindowLimit,
  slidingWindowRetryAfterSeconds,
  slidingWindowStart,
} from "../../shared/index.js";

export type LimitedEndpoint = "push" | "pull" | "health_check";

export const INSTALLATION_REQUEST_WINDOW_MS = 60 * 60 * 1000;

export const INSTALLATION_REQUEST_LIMITS: Record<LimitedEndpoint, number> = {
  push: 3600,
  pull: 3600,
  health_check: 3600,
};

function policyOf(endpoint: LimitedEndpoint): SlidingWindowLimit {
  return { limit: INSTALLATION_REQUEST_LIMITS[endpoint], windowMs: INSTALLATION_REQUEST_WINDOW_MS };
}

export function installationRequestWindowStart(now: Date): Date {
  return slidingWindowStart(now, { windowMs: INSTALLATION_REQUEST_WINDOW_MS });
}

export function installationRequestRetryAfterSeconds(
  endpoint: LimitedEndpoint,
  admittedRequests: readonly Date[],
  now: Date,
): number | undefined {
  return slidingWindowRetryAfterSeconds(admittedRequests, now, policyOf(endpoint));
}
