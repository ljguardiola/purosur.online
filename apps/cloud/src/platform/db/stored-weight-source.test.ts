import { WEIGHT_SOURCES } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { storedWeightSource } from "./stored-weight-source.js";

describe("storedWeightSource", () => {
  it("reads a line sold with no weight as having no weight source", () => {
    expect(storedWeightSource(null)).toBeNull();
  });

  it.each(WEIGHT_SOURCES)("reads the stored weight source %s as itself", (weightSource) => {
    expect(storedWeightSource(weightSource)).toBe(weightSource);
  });

  it("refuses a stored weight source a sale line cannot have", () => {
    expect(() => storedWeightSource("GUESSED")).toThrow(
      "A stored sale line has an unknown weight source: GUESSED",
    );
  });
});
