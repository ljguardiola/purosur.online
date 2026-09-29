import { expect, test } from "vitest";
import { roleNameMessage } from "./role-name-message";

test("asks for the name when it is empty once trimmed", () => {
  expect(roleNameMessage({ name: "   " })).toBe("Ingresá el nombre del rol.");
});

test("states the longest name allowed for a name over it once trimmed", () => {
  expect(roleNameMessage({ name: `  ${"a".repeat(101)}  ` })).toBe(
    "El nombre puede tener hasta 100 caracteres.",
  );
});

test("refuses the Administrator role's own name", () => {
  expect(roleNameMessage({ name: "administrador" })).toBe(
    "Ese nombre es del Administrador; elegí otro.",
  );
});

test("asks to review any other name", () => {
  expect(roleNameMessage({ name: "Depósito" })).toBe("Revisá el nombre del rol.");
});
