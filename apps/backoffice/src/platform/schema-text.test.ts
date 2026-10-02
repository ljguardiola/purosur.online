import { describe, expect, test } from "vitest";
import { schemaText } from "./schema-text";

describe("schemaText", () => {
  test("gives back a text the schema declares", () => {
    expect(schemaText("America/Argentina/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
  });

  test.each([[null], [undefined], [""], [99]])(
    "refuses %s, which is not a text the schema declares",
    (declared) => {
      expect(() => schemaText(declared)).toThrow("The schema declares no such text");
    },
  );
});
