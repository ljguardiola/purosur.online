import { describe, expect, it } from "vitest";
import { EMAIL_ADDRESS_MAX_LENGTH, isEmailAddress } from "./email-address.js";

describe("EMAIL_ADDRESS_MAX_LENGTH", () => {
  it("is the longest address SMTP can deliver to", () => {
    expect(EMAIL_ADDRESS_MAX_LENGTH).toBe(254);
  });
});

describe("isEmailAddress", () => {
  it("accepts something shaped local@domain", () => {
    expect(isEmailAddress("ada@example.com")).toBe(true);
    expect(isEmailAddress("a@b")).toBe(true);
  });

  it.each([
    "",
    "not-an-email",
    "@example.com",
    "ada@",
    "a@b@c",
    "ada @example.com",
    "ada@exa mple.com",
  ])("rejects %j", (value) => {
    expect(isEmailAddress(value)).toBe(false);
  });

  it("rejects surrounding whitespace", () => {
    expect(isEmailAddress(" ada@example.com")).toBe(false);
    expect(isEmailAddress("ada@example.com ")).toBe(false);
  });

  it("accepts an address of exactly the maximum length", () => {
    const localPart = "a".repeat(EMAIL_ADDRESS_MAX_LENGTH - "@example.com".length);

    expect(isEmailAddress(`${localPart}@example.com`)).toBe(true);
  });

  it("rejects an address longer than the maximum length", () => {
    const localPart = "a".repeat(EMAIL_ADDRESS_MAX_LENGTH + 1 - "@example.com".length);

    expect(isEmailAddress(`${localPart}@example.com`)).toBe(false);
  });
});
