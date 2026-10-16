import { describe, expect, expectTypeOf, it } from "vitest";
import { type RegisterRevocationBody, registerRevocationSchema } from "./register-revocation.js";

const revoked = { revoked_at: "2026-10-16T12:00:00.000Z" };

describe("registerRevocationSchema", () => {
  it("accepts a revocation with its instant", () => {
    expect(registerRevocationSchema.safeParse(revoked).data).toEqual(revoked);
  });

  it("strips keys it does not define", () => {
    expect(registerRevocationSchema.safeParse({ ...revoked, device_id: "abc" }).data).toEqual(
      revoked,
    );
  });

  it("requires revoked_at", () => {
    expect(registerRevocationSchema.safeParse({}).success).toBe(false);
  });

  it.each([1, null])("refuses revoked_at as %j", (value) => {
    expect(registerRevocationSchema.safeParse({ revoked_at: value }).success).toBe(false);
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<RegisterRevocationBody>().toEqualTypeOf<{ revoked_at: string }>();
  });
});
