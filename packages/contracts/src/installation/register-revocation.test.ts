import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type EveryInstallationRevocationBody,
  everyInstallationRevocationSchema,
  type RegisterRevocationBody,
  registerRevocationSchema,
} from "./register-revocation.js";

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

describe("everyInstallationRevocationSchema", () => {
  const everyRevoked = { revoked_at: "2026-10-16T12:00:00.000Z", revoked_registers: 3 };

  it("accepts a revocation with its instant and how many registers it reached", () => {
    expect(everyInstallationRevocationSchema.safeParse(everyRevoked).data).toEqual(everyRevoked);
  });

  it("strips keys it does not define", () => {
    expect(
      everyInstallationRevocationSchema.safeParse({ ...everyRevoked, device_ids: ["abc"] }).data,
    ).toEqual(everyRevoked);
  });

  it("requires revoked_at", () => {
    expect(everyInstallationRevocationSchema.safeParse({ revoked_registers: 1 }).success).toBe(
      false,
    );
  });

  it("requires revoked_registers", () => {
    expect(
      everyInstallationRevocationSchema.safeParse({ revoked_at: everyRevoked.revoked_at }).success,
    ).toBe(false);
  });

  it.each([1, null])("refuses revoked_at as %j", (value) => {
    expect(
      everyInstallationRevocationSchema.safeParse({ ...everyRevoked, revoked_at: value }).success,
    ).toBe(false);
  });

  it.each([0, -1, 1.5, "2", null])("refuses revoked_registers as %j", (value) => {
    expect(
      everyInstallationRevocationSchema.safeParse({ ...everyRevoked, revoked_registers: value })
        .success,
    ).toBe(false);
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<EveryInstallationRevocationBody>().toEqualTypeOf<{
      revoked_at: string;
      revoked_registers: number;
    }>();
  });
});
