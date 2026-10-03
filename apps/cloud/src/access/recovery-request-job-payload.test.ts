import { describe, expect, it } from "vitest";
import { recoveryRequestJobPayloadSchema } from "./recovery-request-job-payload.js";

describe("recoveryRequestJobPayloadSchema", () => {
  it("reads a request id whose version and variant digits are unusual in lower case", () => {
    const payload = recoveryRequestJobPayloadSchema.parse({
      email: "ada@example.com",
      requestedAt: "2026-01-05T12:00:00.000Z",
      requestId: "0123ABCD-EF01-0567-F9AB-CDEF01234567",
    });

    expect(payload.requestId).toBe("0123abcd-ef01-0567-f9ab-cdef01234567");
  });

  it("refuses a request id that is not an id", () => {
    const result = recoveryRequestJobPayloadSchema.safeParse({
      email: "ada@example.com",
      requestedAt: "2026-01-05T12:00:00.000Z",
      requestId: "not-an-id",
    });

    expect(result.success).toBe(false);
  });
});
