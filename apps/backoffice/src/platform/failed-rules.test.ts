import { describe, expect, test } from "vitest";
import { z } from "zod";
import { failedRules } from "./failed-rules";

const schema = z
  .string()
  .refine((value) => value.length <= 3, { message: "long", params: { rule: "max_length" } })
  .refine((value) => value !== "abc", { message: "taken", params: { rule: "taken" } })
  .refine((value) => value !== "abcd", "no rule");

describe("failedRules", () => {
  test("is empty for a value the schema accepts", () => {
    expect(failedRules(schema, "ab")).toEqual([]);
  });

  test("names the rule of each refinement the value fails", () => {
    expect(failedRules(schema, "abcd")).toEqual(["max_length"]);
    expect(failedRules(schema, "abc")).toEqual(["taken"]);
  });

  test("skips a failure that names no rule", () => {
    expect(
      failedRules(
        schema.refine((value) => value !== "x", "plain"),
        "x",
      ),
    ).toEqual([]);
  });

  test("is empty for a value of the wrong type", () => {
    expect(failedRules(schema, 42)).toEqual([]);
  });
});
