import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type RegisterEnrollmentCodeBody,
  registerEnrollmentCodeSchema,
} from "./register-enrollment-code.js";

const emitted = { code: "P4NX7KWE2QRT8MZD", expires_at: "2026-09-25T12:15:00.000Z" };

describe("registerEnrollmentCodeSchema", () => {
  it("accepts an emitted code with its expiry", () => {
    expect(registerEnrollmentCodeSchema.safeParse(emitted).data).toEqual(emitted);
  });

  it("strips keys it does not define", () => {
    expect(registerEnrollmentCodeSchema.safeParse({ ...emitted, code_hash: "abc" }).data).toEqual(
      emitted,
    );
  });

  it.each(["code", "expires_at"])("requires %s", (field) => {
    const { [field as keyof typeof emitted]: _omitted, ...rest } = emitted;

    expect(registerEnrollmentCodeSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["code", 1],
    ["code", null],
    ["expires_at", 1],
    ["expires_at", null],
  ])("refuses %s as %j", (field, value) => {
    expect(registerEnrollmentCodeSchema.safeParse({ ...emitted, [field]: value }).success).toBe(
      false,
    );
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<RegisterEnrollmentCodeBody>().toEqualTypeOf<{
      code: string;
      expires_at: string;
    }>();
  });
});
