import { describe, expect, it } from "vitest";
import {
  coreStatusMessageSchema,
  coreToRendererMessageSchema,
  mainToCoreMessageSchema,
  rendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

describe("rendererToCoreMessageSchema", () => {
  it("accepts a ping", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "ping" }).success).toBe(true);
  });

  it("accepts a request for whether this installation is enrolled", () => {
    const message = { type: "enrollment-status-request", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts an enrollment with the code as typed", () => {
    const message = { type: "enroll", request_id: REQUEST_ID, code: "p4nx 7kwe 2qrt 6mzd" };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a PIN code redemption with the code as typed and the new PIN", () => {
    const message = {
      type: "redeem-pin-code",
      request_id: REQUEST_ID,
      reset_code: "p4nx 7kwe 2qrt 5mzd",
      new_pin: "482913",
    };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["request_id", "reset_code", "new_pin"])(
    "rejects a PIN code redemption without its %s",
    (field) => {
      const message = {
        type: "redeem-pin-code",
        request_id: REQUEST_ID,
        reset_code: "P4NX7KWE2QRT5MZD",
        new_pin: "482913",
        [field]: undefined,
      };

      expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("rejects a request without its request id", () => {
    expect(
      rendererToCoreMessageSchema.safeParse({ type: "enrollment-status-request" }).success,
    ).toBe(false);
    expect(rendererToCoreMessageSchema.safeParse({ type: "enroll", code: "x" }).success).toBe(
      false,
    );
  });

  it("rejects an enrollment without a code", () => {
    expect(
      rendererToCoreMessageSchema.safeParse({ type: "enroll", request_id: REQUEST_ID }).success,
    ).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(false);
    expect(rendererToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("coreToRendererMessageSchema", () => {
  it.each([true, false])("accepts whether this installation is enrolled: %s", (enrolled) => {
    const message = { type: "enrollment-status", request_id: REQUEST_ID, enrolled };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "enrolled" },
    { kind: "code_rejected" },
    { kind: "rate_limited", retry_after_seconds: 600 },
    { kind: "unreachable" },
    { kind: "unavailable" },
    { kind: "not_stored" },
  ])("accepts the enrollment result $kind", (outcome) => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "redeemed" },
    { kind: "code_invalid" },
    { kind: "code_expired" },
    { kind: "code_burned" },
    { kind: "pin_rejected" },
    { kind: "rate_limited", retry_after_seconds: 600 },
    { kind: "unreachable" },
    { kind: "unavailable" },
  ])("accepts the PIN code redemption result $kind", (outcome) => {
    const message = { type: "pin-code-redemption-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a PIN code redemption rate limit without when to retry", () => {
    const message = {
      type: "pin-code-redemption-result",
      request_id: REQUEST_ID,
      outcome: { kind: "rate_limited" },
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a PIN code redemption result it does not know or without its request id", () => {
    expect(
      coreToRendererMessageSchema.safeParse({
        type: "pin-code-redemption-result",
        request_id: REQUEST_ID,
        outcome: { kind: "not_stored" },
      }).success,
    ).toBe(false);
    expect(
      coreToRendererMessageSchema.safeParse({
        type: "pin-code-redemption-result",
        outcome: { kind: "redeemed" },
      }).success,
    ).toBe(false);
  });

  it("rejects a rate limit without when to retry", () => {
    const message = {
      type: "enrollment-result",
      request_id: REQUEST_ID,
      outcome: { kind: "rate_limited" },
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment result it does not know", () => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome: { kind: "x" } };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment status without whether it is enrolled", () => {
    expect(
      coreToRendererMessageSchema.safeParse({ type: "enrollment-status", request_id: REQUEST_ID })
        .success,
    ).toBe(false);
  });
});

describe("mainToCoreMessageSchema", () => {
  it("accepts a health check", () => {
    expect(mainToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(true);
  });

  it("rejects any other message type", () => {
    expect(mainToCoreMessageSchema.safeParse({ type: "ping" }).success).toBe(false);
    expect(mainToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("coreStatusMessageSchema", () => {
  it.each(["starting", "down", "up"])("accepts a core status of %s", (status) => {
    expect(coreStatusMessageSchema.safeParse({ type: "core-status", status }).success).toBe(true);
  });

  it("rejects a status outside starting, down and up", () => {
    expect(coreStatusMessageSchema.safeParse({ type: "core-status", status: "" }).success).toBe(
      false,
    );
    expect(coreStatusMessageSchema.safeParse({ type: "core-status" }).success).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(coreStatusMessageSchema.safeParse({ type: "ping", status: "up" }).success).toBe(false);
    expect(coreStatusMessageSchema.safeParse({ status: "up" }).success).toBe(false);
  });
});
