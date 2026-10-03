import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type FirstPinCodeBody,
  type FirstPinCodeWire,
  firstPinCodeBodySchema,
  firstPinCodeSchema,
} from "./first-pin-code.js";

const USER_ID = "3f0c2c0e-6a55-4a53-9b2a-0d8a4f6c1e11";

describe("firstPinCodeBodySchema", () => {
  it("reads the id of the person asking", () => {
    expect(firstPinCodeBodySchema.parse({ user_id: USER_ID })).toEqual({ user_id: USER_ID });
  });

  it("reads an id whose version and variant digits are unusual in lower case", () => {
    expect(
      firstPinCodeBodySchema.parse({ user_id: "0123ABCD-EF01-0567-F9AB-CDEF01234567" }),
    ).toEqual({
      user_id: "0123abcd-ef01-0567-f9ab-cdef01234567",
    });
  });

  it.each([
    ["missing", undefined],
    ["not a string", 42],
    ["not an id", "ada"],
  ])("rejects a user id that is %s", (_case, userId) => {
    const result = firstPinCodeBodySchema.safeParse({ user_id: userId });

    expect(result.success ? undefined : result.error.issues[0]?.path).toEqual(["user_id"]);
  });

  it("is built from the id alone", () => {
    expectTypeOf<FirstPinCodeBody>().toEqualTypeOf<{ user_id: string }>();
  });
});

describe("firstPinCodeSchema", () => {
  it("accepts the expiry of the code that was sent", () => {
    const sent = { expires_at: "2026-09-25T12:15:00.000Z" };

    expect(firstPinCodeSchema.parse(sent)).toEqual(sent);
  });

  it("never carries the code", () => {
    const parsed = firstPinCodeSchema.parse({
      expires_at: "2026-09-25T12:15:00.000Z",
      code: "P4NX7KWE2QRT5MZD",
    });

    expect(parsed).toEqual({ expires_at: "2026-09-25T12:15:00.000Z" });
  });

  it.each([undefined, 1, null, "tomorrow"])("refuses an expiry of %j", (expiresAt) => {
    expect(firstPinCodeSchema.safeParse({ expires_at: expiresAt }).success).toBe(false);
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<FirstPinCodeWire>().toEqualTypeOf<{ expires_at: string }>();
  });
});
