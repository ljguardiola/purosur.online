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

  it("accepts a name exactly at the maximum length", () => {
    expect(readPasskeyName({ passkey_name: "a".repeat(40) })).toBe("a".repeat(40));
  });

  it("rejects a name past the maximum length", () => {
    expect(readPasskeyName({ passkey_name: "a".repeat(41) })).toBeUndefined();
  });
});
