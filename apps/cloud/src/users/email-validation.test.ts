import { describe, expect, it } from "vitest";
import { readEmail } from "./email-validation.js";

describe("readEmail", () => {
  it("reads undefined when email is missing or not a string", () => {
    expect(readEmail({})).toBeUndefined();
    expect(readEmail({ email: 42 })).toBeUndefined();
  });

  it("reads undefined when the email does not look like local@domain", () => {
    expect(readEmail({ email: "not-an-email" })).toBeUndefined();
  });

  it("trims and lowercases the email", () => {
    expect(readEmail({ email: "  Ada@Example.com  " })).toBe("ada@example.com");
  });

  it("accepts an email exactly at the maximum length", () => {
    const localPart = "a".repeat(254 - "@example.com".length);
    expect(readEmail({ email: `${localPart}@example.com` })).toBe(`${localPart}@example.com`);
  });

  it("rejects an email past the maximum length", () => {
    const localPart = "a".repeat(255 - "@example.com".length);
    expect(readEmail({ email: `${localPart}@example.com` })).toBeUndefined();
  });
});
