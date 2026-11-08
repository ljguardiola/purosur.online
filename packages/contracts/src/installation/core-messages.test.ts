import { describe, expect, it } from "vitest";
import {
  installationCoreToRendererMessageSchema,
  installationRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

describe("installationRendererToCoreMessageSchema", () => {
  it("accepts a request for whether this installation is enrolled", () => {
    const message = { type: "enrollment-status-request", request_id: REQUEST_ID };

    expect(installationRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a request for whether the register is in service", () => {
    const message = { type: "register-service-request", request_id: REQUEST_ID };

    expect(installationRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for whether the register is in service without its request id", () => {
    expect(
      installationRendererToCoreMessageSchema.safeParse({ type: "register-service-request" })
        .success,
    ).toBe(false);
  });

  it("accepts a request for the register's own name", () => {
    const message = { type: "register-name-request", request_id: REQUEST_ID };

    expect(installationRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts an enrollment with the code as typed", () => {
    const message = { type: "enroll", request_id: REQUEST_ID, code: "p4nx 7kwe 2qrt 6mzd" };

    expect(installationRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request without its request id", () => {
    expect(
      installationRendererToCoreMessageSchema.safeParse({ type: "enrollment-status-request" })
        .success,
    ).toBe(false);
    expect(
      installationRendererToCoreMessageSchema.safeParse({ type: "enroll", code: "x" }).success,
    ).toBe(false);
    expect(
      installationRendererToCoreMessageSchema.safeParse({ type: "register-name-request" }).success,
    ).toBe(false);
  });

  it("rejects an enrollment without a code", () => {
    expect(
      installationRendererToCoreMessageSchema.safeParse({ type: "enroll", request_id: REQUEST_ID })
        .success,
    ).toBe(false);
  });

  it("accepts a check of an enrollment code as typed", () => {
    const message = { type: "check-enrollment-code", request_id: REQUEST_ID, code: "p4nx 7kwe" };

    expect(installationRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "check-enrollment-code", request_id: REQUEST_ID },
    { type: "check-enrollment-code", code: "p4nx" },
  ])("rejects an enrollment code check that is not well formed: %j", (message) => {
    expect(installationRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(
      installationRendererToCoreMessageSchema.safeParse({ type: "health-check" }).success,
    ).toBe(false);
    expect(installationRendererToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("installationCoreToRendererMessageSchema", () => {
  it.each([{ kind: "not_enrolled" }, { kind: "enrolled" }, { kind: "revoked" }])(
    "accepts the standing of this installation's enrollment: $kind",
    (standing) => {
      const message = { type: "enrollment-status", request_id: REQUEST_ID, standing };

      expect(installationCoreToRendererMessageSchema.parse(message)).toEqual(message);
    },
  );

  it("accepts the notice that the enrollment standing changed, which answers no request", () => {
    const message = { type: "enrollment-standing-changed" };

    expect(installationCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["in_service", "out_of_service"])(
    "accepts whether the register is in service: %s",
    (service) => {
      const message = { type: "register-service", request_id: REQUEST_ID, service };

      expect(installationCoreToRendererMessageSchema.parse(message)).toEqual(message);
    },
  );

  it("rejects a register service that is neither in service nor out of service", () => {
    expect(
      installationCoreToRendererMessageSchema.safeParse({
        type: "register-service",
        request_id: REQUEST_ID,
        service: "damaged",
      }).success,
    ).toBe(false);
    expect(
      installationCoreToRendererMessageSchema.safeParse({
        type: "register-service",
        request_id: REQUEST_ID,
      }).success,
    ).toBe(false);
  });

  it.each(["Caja 1", null])("accepts the register's own name, or none yet: %s", (name) => {
    const message = { type: "register-name", request_id: REQUEST_ID, name };

    expect(installationCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a register name that is not text or null", () => {
    expect(
      installationCoreToRendererMessageSchema.safeParse({
        type: "register-name",
        request_id: REQUEST_ID,
        name: 3,
      }).success,
    ).toBe(false);
    expect(
      installationCoreToRendererMessageSchema.safeParse({
        type: "register-name",
        request_id: REQUEST_ID,
      }).success,
    ).toBe(false);
  });

  it.each([
    { kind: "enrolled" },
    { kind: "code_rejected" },
    { kind: "rate_limited", retry_after_seconds: 600 },
    { kind: "unreachable" },
    { kind: "unavailable" },
    { kind: "storage_unavailable" },
    { kind: "not_stored" },
    { kind: "invalid_input", fields: ["code"] },
  ])("accepts the enrollment result $kind", (outcome) => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome };

    expect(installationCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a rate limit without when to retry", () => {
    const message = {
      type: "enrollment-result",
      request_id: REQUEST_ID,
      outcome: { kind: "rate_limited" },
    };

    expect(installationCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment refusal naming a field the enrollment does not have", () => {
    const message = {
      type: "enrollment-result",
      request_id: REQUEST_ID,
      outcome: { kind: "invalid_input", fields: ["hostname"] },
    };

    expect(installationCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment result it does not know", () => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome: { kind: "x" } };

    expect(installationCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment status without its standing", () => {
    expect(
      installationCoreToRendererMessageSchema.safeParse({
        type: "enrollment-status",
        request_id: REQUEST_ID,
      }).success,
    ).toBe(false);
  });

  it.each([[["code"]], [[]]])("accepts an enrollment code check refusing %j", (fields) => {
    const message = { type: "enrollment-code-check", request_id: REQUEST_ID, fields };

    expect(installationCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "enrollment-code-check", request_id: REQUEST_ID, fields: ["hostname"] },
    { type: "enrollment-code-check", request_id: REQUEST_ID },
    { type: "enrollment-code-check", fields: [] },
  ])("rejects a check answer that is not well formed: %j", (message) => {
    expect(installationCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});
