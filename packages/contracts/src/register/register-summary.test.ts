import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type RegisterSummaryBody,
  registerListSchema,
  registerSummarySchema,
} from "./register-summary.js";

const pendingCode = {
  seconds_since_issued: 0,
  seconds_until_expiry: 900,
};
const withoutCode = {
  id: "register-1",
  name: "Caja 1",
  pending_code: null,
  point_of_sale_number: null,
};
const withCode = {
  id: "register-2",
  name: "Caja 2",
  pending_code: pendingCode,
  point_of_sale_number: 3,
};

describe("registerSummarySchema", () => {
  it("accepts a register with no pending code and one with a pending code", () => {
    expect(registerSummarySchema.safeParse(withoutCode).data).toEqual(withoutCode);
    expect(registerSummarySchema.safeParse(withCode).data).toEqual(withCode);
  });

  it("accepts a code that expires within its last second", () => {
    const lastSecond = {
      ...withCode,
      pending_code: { seconds_since_issued: 899, seconds_until_expiry: 1 },
    };

    expect(registerSummarySchema.safeParse(lastSecond).data).toEqual(lastSecond);
  });

  it("strips keys it does not define, in the register and in its pending code", () => {
    const parsed = registerSummarySchema.safeParse({
      ...withCode,
      location_id: "location-1",
      pending_code: { ...pendingCode, expires_at: "2026-09-25T12:15:00.000Z" },
    });

    expect(parsed.data).toEqual(withCode);
  });

  it.each(["id", "name", "pending_code", "point_of_sale_number"])("requires %s", (field) => {
    const { [field as keyof typeof withCode]: _omitted, ...rest } = withCode;

    expect(registerSummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each(["seconds_since_issued", "seconds_until_expiry"])(
    "requires the pending code's %s",
    (field) => {
      const { [field as keyof typeof pendingCode]: _omitted, ...rest } = pendingCode;

      expect(registerSummarySchema.safeParse({ ...withCode, pending_code: rest }).success).toBe(
        false,
      );
    },
  );

  it.each([
    ["id", 1],
    ["id", null],
    ["name", 1],
    ["name", null],
    ["pending_code", undefined],
    ["point_of_sale_number", undefined],
    ["point_of_sale_number", 0],
    ["point_of_sale_number", 1.5],
    ["point_of_sale_number", "3"],
    ["pending_code", "2026-09-25T12:15:00.000Z"],
    ["pending_code", { ...pendingCode, seconds_since_issued: "0" }],
    ["pending_code", { ...pendingCode, seconds_since_issued: null }],
    ["pending_code", { ...pendingCode, seconds_since_issued: -1 }],
    ["pending_code", { ...pendingCode, seconds_since_issued: 1.5 }],
    ["pending_code", { ...pendingCode, seconds_until_expiry: "900" }],
    ["pending_code", { ...pendingCode, seconds_until_expiry: null }],
    ["pending_code", { ...pendingCode, seconds_until_expiry: 0 }],
    ["pending_code", { ...pendingCode, seconds_until_expiry: 1.5 }],
  ])("refuses %s as %j", (field, value) => {
    expect(registerSummarySchema.safeParse({ ...withCode, [field]: value }).success).toBe(false);
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<RegisterSummaryBody["name"]>().toEqualTypeOf<string>();
    expectTypeOf<RegisterSummaryBody["pending_code"]>().toEqualTypeOf<{
      seconds_since_issued: number;
      seconds_until_expiry: number;
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
