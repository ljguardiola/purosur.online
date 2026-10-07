import { describe, expect, it } from "vitest";
import {
  INSTALLATION_REQUEST_LIMITS,
  INSTALLATION_REQUEST_WINDOW_MS,
  installationRequestRetryAfterSeconds,
  installationRequestWindowStart,
} from "./installation-request-limit.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function attempts(count: number, minutes = 1): Date[] {
  return Array.from({ length: count }, () => minutesAgo(minutes));
}

describe("installation request limits", () => {
  it("counts the requests of the last 60 minutes, not of a clock hour", () => {
    expect(INSTALLATION_REQUEST_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(installationRequestWindowStart(NOW)).toEqual(minutesAgo(60));
  });

  it("allows 3600 requests per window to each endpoint", () => {
    expect(INSTALLATION_REQUEST_LIMITS).toEqual({ push: 3600, pull: 3600, health_check: 3600 });
  });
});

describe("installationRequestRetryAfterSeconds", () => {
  it.each(["push", "pull", "health_check"] as const)(
    "admits a %s request while fewer than its limit were admitted in the window",
    (endpoint) => {
      const accepted = attempts(INSTALLATION_REQUEST_LIMITS[endpoint] - 1);

      expect(installationRequestRetryAfterSeconds(endpoint, accepted, NOW)).toBeUndefined();
    },
  );

  it.each(["push", "pull", "health_check"] as const)(
    "refuses a %s request at its limit until the oldest counted one leaves the window",
    (endpoint) => {
      const accepted = [
        ...attempts(INSTALLATION_REQUEST_LIMITS[endpoint] - 1),
        minutesAgo(50),
      ];

      expect(installationRequestRetryAfterSeconds(endpoint, accepted, NOW)).toBe(10 * 60);
    },
  );

  it("ignores the requests that already left the window", () => {
    const accepted = [...attempts(INSTALLATION_REQUEST_LIMITS.push - 1), minutesAgo(60)];

    expect(installationRequestRetryAfterSeconds("push", accepted, NOW)).toBeUndefined();
  });
});
