import { userCreationBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import { userEmailMessage } from "./user-email-message";

const message = userEmailMessage(userCreationBodySchema.shape.email);

test("asks for the email when it is empty", () => {
  expect(message({ email: "  " })).toBe("Ingresá el correo.");
});

test("asks for a valid email when the user's shape refuses it", () => {
  expect(message({ email: "ana ejemplo.com" })).toBe("Ingresá un correo válido.");
});

test("asks to review an email the user's shape accepts", () => {
  expect(message({ email: "ana@ejemplo.com" })).toBe("Revisá el correo.");
});
