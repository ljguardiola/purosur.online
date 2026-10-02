import { describe, expect, it } from "vitest";
import { requiredTextSchema } from "./required-text.js";

const schema = requiredTextSchema("title", 5, (value) => value.length > 5);
const message = "title must be a non-empty string of at most 5 characters";

function failure(value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("requiredTextSchema", () => {
  it("accepts a text the rule does not find too long", () => {
    expect(schema.parse("abcde")).toBe("abcde");
  });

  it("trims the surrounding whitespace", () => {
    expect(schema.parse("  ab  ")).toBe("ab");
  });

  it("measures the length after trimming", () => {
    expect(schema.safeParse("  abcde  ").success).toBe(true);
  });

  it.each([
    ["a text the rule finds too long", "abcdef"],
    ["an empty text", ""],
    ["a blank text", "   "],
    ["a number", 42],
    ["nothing", undefined],
  ])("refuses %s with the field's message", (_case, value) => {
    expect(failure(value)).toEqual([message]);
  });
});

describe("requiredTextSchema, declared limits", () => {
  it("declares the maximum length it was given", () => {
    expect(schema.meta()).toEqual({ maxLength: 5 });
  });
});
