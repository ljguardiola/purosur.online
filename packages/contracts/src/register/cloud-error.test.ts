import { describe, expect, it } from "vitest";
import {
  CLOUD_ERROR_CODES,
  cloudError,
  cloudErrorSchema,
  cloudErrorStatus,
  isRetryableCloudError,
  retryAfterSecondsOf,
} from "./cloud-error.js";

describe("cloudErrorSchema", () => {
  it("accepts a code of the contract with a message and details", () => {
    const body = {
      code: "rate_limited",
      message: "too many enrollment attempts",
      details: [{ retry_after_seconds: 60 }],
    };

    expect(cloudErrorSchema.parse(body)).toEqual(body);
  });

  it("rejects an envelope without details", () => {
    expect(cloudErrorSchema.safeParse({ code: "rate_limited", message: "x" }).success).toBe(false);
  });

  it("rejects an envelope without a message", () => {
    expect(cloudErrorSchema.safeParse({ code: "rate_limited", details: [] }).success).toBe(false);
  });

  it("rejects a code the contract does not declare", () => {
    expect(cloudErrorSchema.safeParse({ code: "teapot", message: "x", details: [] }).success).toBe(
      false,
    );
  });

  it("rejects details that are not a list of objects", () => {
    expect(
      cloudErrorSchema.safeParse({ code: "rate_limited", message: "x", details: ["60"] }).success,
    ).toBe(false);
  });
});

describe("cloudErrorStatus", () => {
  it.each([
    ["validation_failed", 400],
    ["enrollment_code_rejected", 403],
    ["rate_limited", 429],
    ["internal_error", 500],
    ["server_unavailable", 503],
  ] as const)("answers %s with HTTP %i", (code, status) => {
    expect(cloudErrorStatus(code)).toBe(status);
  });

  it("gives every code of the contract a status", () => {
    expect(CLOUD_ERROR_CODES.map(cloudErrorStatus).every(Number.isInteger)).toBe(true);
  });
});

describe("isRetryableCloudError", () => {
  it.each([
    ["rate_limited", true],
    ["server_unavailable", true],
    ["validation_failed", false],
    ["enrollment_code_rejected", false],
    ["internal_error", false],
  ] as const)("marks %s as retryable: %s", (code, retryable) => {
    expect(isRetryableCloudError(code)).toBe(retryable);
  });
});

describe("cloudError", () => {
  it("builds the envelope with empty details by default", () => {
    expect(cloudError("internal_error", "unexpected failure")).toEqual({
      code: "internal_error",
      message: "unexpected failure",
      details: [],
    });
  });

  it("keeps the details it is given", () => {
    expect(cloudError("validation_failed", "bad", [{ field: "code" }])).toEqual({
      code: "validation_failed",
      message: "bad",
      details: [{ field: "code" }],
    });
  });
});

describe("retryAfterSecondsOf", () => {
  it("reads the retry-after seconds a rate limit carries in its details", () => {
    const error = cloudError("rate_limited", "x", [{ retry_after_seconds: 90 }]);

    expect(retryAfterSecondsOf(error)).toBe(90);
  });

  it("finds the retry-after seconds in any entry of the details", () => {
    const error = cloudError("rate_limited", "x", [
      { scope: "register" },
      { retry_after_seconds: 5 },
    ]);

    expect(retryAfterSecondsOf(error)).toBe(5);
  });

  it.each([
    ["no details", []],
    ["a value that is not a number", [{ retry_after_seconds: "90" }]],
    ["a negative value", [{ retry_after_seconds: -1 }]],
    ["a value that is not a whole number", [{ retry_after_seconds: 1.5 }]],
  ])("answers undefined for %s", (_case, details) => {
    expect(retryAfterSecondsOf(cloudError("rate_limited", "x", details))).toBeUndefined();
  });
});
