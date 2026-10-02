import { recoveryRequestBodySchema, userEditBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import { z } from "zod";
import { emailFieldMessage } from "./email-field-message";

const MESSAGES = { required: "Required.", invalid: "Invalid.", review: "Review." };

test("asks for the email when it is empty once trimmed", () => {
  expect(emailFieldMessage(recoveryRequestBodySchema.shape.email, MESSAGES)({ email: "  " })).toBe(
    "Required.",
  );
});

test("calls an email invalid when the shape it is given refuses it", () => {
  expect(
    emailFieldMessage(userEditBodySchema.shape.email, MESSAGES)({ email: " ana ejemplo.com " }),
  ).toBe("Invalid.");
});

test("asks to review an email the shape it is given accepts", () => {
  expect(
    emailFieldMessage(
      recoveryRequestBodySchema.shape.email,
      MESSAGES,
    )({
      email: " ana@ejemplo.com ",
    }),
  ).toBe("Review.");
});

test("picks the message from the shape it is given", () => {
  const message = emailFieldMessage(z.string().max(3), MESSAGES);

  expect(message({ email: "abc" })).toBe("Review.");
  expect(message({ email: "abcd" })).toBe("Invalid.");
});
