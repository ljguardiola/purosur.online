import { describe, expect, test } from "vitest";
import { schemaLimit } from "./schema-limit";

describe("schemaLimit", () => {
  test("gives back a limit the schema declares", () => {
    expect(schemaLimit(99)).toBe(99);
    expect(schemaLimit(0)).toBe(0);
  });

  test.each([[null], [undefined], ["99"], [Number.NEGATIVE_INFINITY]])(
    "refuses %s, which is not a limit the schema declares",
    (declared) => {
      expect(() => schemaLimit(declared)).toThrow("The schema declares no such limit");
    },
  );
});
