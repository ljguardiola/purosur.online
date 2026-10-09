import { passkeyRegistrationBodySchema, recoveryRedemptionBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import { z } from "zod";
import { passkeyNameMessage } from "./passkey-name-message";

test("asks for a name when it is empty once trimmed", () => {
  expect(passkeyNameMessage(recoveryRedemptionBodySchema.shape.passkey_name)({ name: "  " })).toBe(
    "Ingresá un nombre para la passkey.",
  );
});

test("rejects a passkey name over 40 characters once trimmed", () => {
  expect(
    passkeyNameMessage(passkeyRegistrationBodySchema.shape.passkey_name)({
      name: ` ${"a".repeat(41)} `,
    }),
  ).toBe("El nombre no puede superar los 40 caracteres.");
});

test("asks to review a name the shape accepts", () => {
  expect(
    passkeyNameMessage(recoveryRedemptionBodySchema.shape.passkey_name)({ name: "Notebook" }),
  ).toBe("Revisá el nombre de la passkey.");
});

test("prints the limit and picks the message from the shape it is given", () => {
  const message = passkeyNameMessage(z.string().max(3).meta({ maxLength: 3 }));

  expect(message({ name: "abc" })).toBe("Revisá el nombre de la passkey.");
  expect(message({ name: "abcd" })).toBe("El nombre no puede superar los 3 caracteres.");
});
