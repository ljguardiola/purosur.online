import { PASSKEY_NAME_MAX_LENGTH } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { validatePasskeyName } from "./passkey-name";

describe("validatePasskeyName", () => {
  it("requires a name, rejecting a blank one", () => {
    expect(validatePasskeyName("")).toBe("Ingresá un nombre para la passkey.");
  });

  it("requires a name, rejecting a whitespace-only one", () => {
    expect(validatePasskeyName("   ")).toBe("Ingresá un nombre para la passkey.");
  });

  it("rejects a name of 41 characters", () => {
    expect(validatePasskeyName("a".repeat(41))).toBe(
      `El nombre no puede superar los ${PASSKEY_NAME_MAX_LENGTH} caracteres.`,
    );
  });

  it("accepts a 40-character name surrounded by spaces, trimmed before the limit applies", () => {
    expect(validatePasskeyName(`  ${"a".repeat(40)}  `)).toBeUndefined();
  });

  it("accepts an ordinary name", () => {
    expect(validatePasskeyName("Caja principal")).toBeUndefined();
  });
});
