import { PASSKEY_NAME_MAX_LENGTH } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { readPasskeyName } from "./passkey-name-validation.js";

describe("readPasskeyName", () => {
  it("reads undefined when passkey_name is missing or not a string", () => {
    expect(readPasskeyName({})).toBeUndefined();
    expect(readPasskeyName({ passkey_name: 42 })).toBeUndefined();
  });

  it("reads undefined when passkey_name is empty or blank after trimming", () => {
    expect(readPasskeyName({ passkey_name: "" })).toBeUndefined();
    expect(readPasskeyName({ passkey_name: "   " })).toBeUndefined();
  });

  it("reads a trimmed name from the request body", () => {
    expect(readPasskeyName({ passkey_name: "  My phone  " })).toBe("My phone");
  });

  it("rejects a name longer than the contracts' maximum length", () => {
    const name = "a".repeat(PASSKEY_NAME_MAX_LENGTH + 1);

    expect(readPasskeyName({ passkey_name: name })).toBeUndefined();
  });
});
