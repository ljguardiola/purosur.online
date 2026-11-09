import { expect, test } from "vitest";
import { registerNameMessage } from "./register-name-message";

test("asks for the name when it is blank once trimmed", () => {
  expect(registerNameMessage({ name: "  " })).toBe("Ingresá el nombre de la caja.");
});

test("shows the name-too-long message for a name over 100 characters once trimmed", () => {
  expect(registerNameMessage({ name: ` ${"a".repeat(101)} ` })).toBe(
    "El nombre puede tener hasta 100 caracteres.",
  );
});

test("asks to check the name when it is within the limit", () => {
  expect(registerNameMessage({ name: ` ${"a".repeat(100)} ` })).toBe(
    "Revisá el nombre de la caja.",
  );
});
