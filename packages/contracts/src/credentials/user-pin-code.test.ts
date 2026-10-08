import { PIN_CODE_VALIDITY_MS } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { type UserPinCodeWire, userPinCodeSchema } from "./user-pin-code.js";

const emitted = { code: "P4NX7KWE2QRT5MZD", expires_at: "2026-09-25T12:15:00.000Z" };

describe("userPinCodeSchema", () => {
  it("accepts an emitted code with its expiry", () => {
    expect(userPinCodeSchema.safeParse(emitted).data).toEqual(emitted);
  });

  it("strips keys it does not define", () => {
    expect(userPinCodeSchema.safeParse({ ...emitted, code_hash: "abc" }).data).toEqual(emitted);
  });

  it.each(["code", "expires_at"])("requires %s", (field) => {
    const { [field as keyof typeof emitted]: _omitted, ...rest } = emitted;

    expect(userPinCodeSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["code", 1],
    ["code", null],
    ["code", "P4NX7KWE2QRT5MZ"],
    ["code", "P4NX7KWE2QRT5MZDA"],
    ["code", "p4nx7kwe2qrt8mzd"],
    ["code", "P4NX7KWE1QRT8MZD"],
    ["code", "P4NX7KWE2QRT5MZ="],
    ["expires_at", 1],
    ["expires_at", null],
    ["expires_at", "tomorrow"],
  ])("refuses %s as %j", (field, value) => {
    expect(userPinCodeSchema.safeParse({ ...emitted, [field]: value }).success).toBe(false);
  });

  it("declares how long a code stays valid", () => {
    expect(userPinCodeSchema.shape.expires_at.meta()).toEqual({
      validityMs: PIN_CODE_VALIDITY_MS,
    });
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<UserPinCodeWire>().toEqualTypeOf<{
      code: string;
      expires_at: string;
    }>();
  });
});
