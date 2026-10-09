import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type SignInLookup,
  type SignInLookupBody,
  signInLookupBodySchema,
  signInLookupSchema,
} from "./sign-in-lookup.js";

const USER_ID = "3f0c2c0e-6a55-4a53-9b2a-0d8a4f6c1e11";

describe("signInLookupBodySchema", () => {
  it("reads the email trimmed and in lowercase", () => {
    expect(signInLookupBodySchema.parse({ email: "  Ada@Example.COM " })).toEqual({
      email: "ada@example.com",
    });
  });

  it.each([
    ["missing", undefined],
    ["not a string", 42],
    ["not an email", "ada"],
  ])("rejects an email that is %s", (_case, email) => {
    const result = signInLookupBodySchema.safeParse({ email });

    expect(result.success ? undefined : result.error.issues[0]?.path).toEqual(["email"]);
  });

  it("is built from the email as it was typed", () => {
    expectTypeOf<SignInLookupBody>().toEqualTypeOf<{ email: string }>();
  });
});

describe("signInLookupSchema", () => {
  it.each([
    [{ kind: "found", user_id: USER_ID, has_pin: true }],
    [{ kind: "found", user_id: USER_ID, has_pin: false }],
    [{ kind: "not_found" }],
  ])("accepts %j", (answer) => {
    expect(signInLookupSchema.parse(answer)).toEqual(answer);
  });

  it("reads a found person's id whose version and variant digits are unusual in lower case", () => {
    expect(
      signInLookupSchema.parse({
        kind: "found",
        user_id: "0123ABCD-EF01-0567-F9AB-CDEF01234567",
        has_pin: true,
      }),
    ).toEqual({ kind: "found", user_id: "0123abcd-ef01-0567-f9ab-cdef01234567", has_pin: true });
  });

  it.each([
    ["a found answer without its PIN flag", { kind: "found", user_id: USER_ID }],
    ["a found answer whose user is not an id", { kind: "found", user_id: "x", has_pin: true }],
    ["another kind", { kind: "rate_limited" }],
  ])("rejects %s", (_case, answer) => {
    expect(signInLookupSchema.safeParse(answer).success).toBe(false);
  });

  it("names a found person by id and PIN flag alone", () => {
    expectTypeOf<Extract<SignInLookup, { kind: "found" }>>().toEqualTypeOf<{
      kind: "found";
      user_id: string;
      has_pin: boolean;
    }>();
  });
});
