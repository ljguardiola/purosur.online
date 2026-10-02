import { describe, expect, it } from "vitest";
import { rateLimitOutcome } from "./rate-limit-outcome.js";

function responseWithRetryAfter(value: string | null): Response {
  return new Response(null, {
    status: 429,
    ...(value === null ? {} : { headers: { "Retry-After": value } }),
  });
}

describe("rateLimitOutcome", () => {
  it("reads a positive number of seconds from the Retry-After header", () => {
    expect(rateLimitOutcome(responseWithRetryAfter("42"))).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 42,
    });
  });

  it("reads a fractional number of seconds", () => {
    expect(rateLimitOutcome(responseWithRetryAfter("1.5"))).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 1.5,
    });
  });

  it("reports failed when the header is absent", () => {
    expect(rateLimitOutcome(responseWithRetryAfter(null))).toEqual({ kind: "failed" });
  });

  it.each(["", "0", "-5", "soon", "Infinity", "NaN"])(
    "reports failed for the header value %j",
    (value) => {
      expect(rateLimitOutcome(responseWithRetryAfter(value))).toEqual({ kind: "failed" });
    },
  );
});
