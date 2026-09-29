import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type RegisterSummaryBody,
  registerListSchema,
  registerSummarySchema,
} from "./register-summary.js";

const pendingCode = {
  issued_at: "2026-09-25T12:00:00.000Z",
  expires_at: "2026-09-25T12:15:00.000Z",
};
const withoutCode = { id: "register-1", name: "Caja 1", pending_code: null };
const withCode = { id: "register-2", name: "Caja 2", pending_code: pendingCode };

describe("registerSummarySchema", () => {
  it("accepts a register with no pending code and one with a pending code", () => {
    expect(registerSummarySchema.safeParse(withoutCode).data).toEqual(withoutCode);
    expect(registerSummarySchema.safeParse(withCode).data).toEqual(withCode);
  });

  it("strips keys it does not define, in the register and in its pending code", () => {
    const parsed = registerSummarySchema.safeParse({
      ...withCode,
      location_id: "location-1",
      pending_code: { ...pendingCode, redeemed_at: null },
    });

    expect(parsed.data).toEqual(withCode);
  });

  it.each(["id", "name", "pending_code"])("requires %s", (field) => {
    const { [field as keyof typeof withCode]: _omitted, ...rest } = withCode;

    expect(registerSummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each(["issued_at", "expires_at"])("requires the pending code's %s", (field) => {
    const { [field as keyof typeof pendingCode]: _omitted, ...rest } = pendingCode;

    expect(registerSummarySchema.safeParse({ ...withCode, pending_code: rest }).success).toBe(
      false,
    );
  });

  it.each([
    ["id", 1],
    ["id", null],
    ["name", 1],
    ["name", null],
    ["pending_code", undefined],
    ["pending_code", "2026-09-25T12:15:00.000Z"],
    ["pending_code", { ...pendingCode, issued_at: 1 }],
    ["pending_code", { ...pendingCode, issued_at: null }],
    ["pending_code", { ...pendingCode, expires_at: 1 }],
    ["pending_code", { ...pendingCode, expires_at: null }],
  ])("refuses %s as %j", (field, value) => {
    expect(registerSummarySchema.safeParse({ ...withCode, [field]: value }).success).toBe(false);
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<RegisterSummaryBody["name"]>().toEqualTypeOf<string>();
    expectTypeOf<RegisterSummaryBody["pending_code"]>().toEqualTypeOf<{
      issued_at: string;
      expires_at: string;
    } | null>();
  });
});

describe("registerListSchema", () => {
  it("accepts a list of registers, empty or not", () => {
    expect(registerListSchema.safeParse([]).data).toEqual([]);
    expect(registerListSchema.safeParse([withoutCode, withCode]).data).toEqual([
      withoutCode,
      withCode,
    ]);
  });

  it.each([undefined, null, {}, "registers", withoutCode])("refuses %j as a list", (body) => {
    expect(registerListSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a list holding a malformed register", () => {
    expect(registerListSchema.safeParse([withoutCode, { ...withCode, name: 2 }]).success).toBe(
      false,
    );
  });
});
