import { expect, test } from "vitest";
import {
  EMPTY_FIRST_SIGN_IN_EMAIL_FORM,
  signInLookupRequestFrom,
  signInLookupRequestSchema,
} from "./first-sign-in-email-form";

test("the typed email is sent as it was typed", () => {
  const request = signInLookupRequestFrom({ email: " Ada@Example.com " });

  expect(request).toEqual({ email: " Ada@Example.com " });
  expect(signInLookupRequestSchema.safeParse(request).success).toBe(true);
});

test("an empty email is left for the core to refuse", () => {
  expect(
    signInLookupRequestSchema.safeParse(signInLookupRequestFrom(EMPTY_FIRST_SIGN_IN_EMAIL_FORM))
      .success,
  ).toBe(true);
});
