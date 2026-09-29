import { describe, expect, it } from "vitest";
import { retryAfterSeconds } from "./retry-after-seconds.js";

const ONE_HOUR_SECONDS = 60 * 60;

function responseWithRetryAfter(value: string | null): Response {
  return new Response(null, value === null ? {} : { headers: { "Retry-After": value } });
}

describe("retryAfterSeconds", () => {
  it("reads a positive number of seconds from the Retry-After header", () => {
    expect(retryAfterSeconds(responseWithRetryAfter("42"))).toBe(42);
  });

  it("reads a fractional number of seconds", () => {
    expect(retryAfterSeconds(responseWithRetryAfter("1.5"))).toBe(1.5);
  });

  it("falls back to one hour when the header is absent", () => {
    expect(retryAfterSeconds(responseWithRetryAfter(null))).toBe(ONE_HOUR_SECONDS);
  });

  it.each(["", "0", "-5", "soon", "Infinity", "NaN"])(
    "falls back to one hour for the header value %j",
    (value) => {
      expect(retryAfterSeconds(responseWithRetryAfter(value))).toBe(ONE_HOUR_SECONDS);
    },
  );

  it("falls back to the given seconds instead of one hour", () => {
    expect(retryAfterSeconds(responseWithRetryAfter(null), 900)).toBe(900);
    expect(retryAfterSeconds(responseWithRetryAfter("abc"), 900)).toBe(900);
  });

  it("prefers the header over the given fallback", () => {
    expect(retryAfterSeconds(responseWithRetryAfter("7"), 900)).toBe(7);
  });
});
