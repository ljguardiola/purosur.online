import { describe, expect, it } from "vitest";
import {
  addWeighedProductRequestSchema,
  changeLineWeightRequestSchema,
  weightMessage,
  weightRequestFrom,
} from "./weight-form";

const INVALID_WEIGHT_MESSAGE = "Ingresá un peso mayor a 0 kg, con hasta 3 decimales.";
const ABOVE_LINE_LIMIT_MESSAGE = "El peso supera el máximo de una línea.";

const REQUEST_SCHEMAS = [
  ["adding a weighed product", addWeighedProductRequestSchema],
  ["changing a line's weight", changeLineWeightRequestSchema],
] as const;

describe("weight form", () => {
  it("requests a typed weight in thousandths of a kilogram", () => {
    expect(weightRequestFrom({ weight: "1,25" })).toEqual({ weight_thousandths: 1250 });
  });

  describe.each(REQUEST_SCHEMAS)("when %s", (_action, schema) => {
    it.each(["0,001", "1,250", "2", "1.250,5"])("accepts a typed weight of '%s'", (weight) => {
      expect(schema.safeParse(weightRequestFrom({ weight })).success).toBe(true);
    });

    it.each(["", "abc", "0", "0,000", "1,2345", "-1", "1.5", "3.000.000"])(
      "refuses a typed weight of '%s'",
      (weight) => {
        expect(schema.safeParse(weightRequestFrom({ weight })).success).toBe(false);
      },
    );

    it.each(["", "abc", "0", "0,000", "1,2345", "-1", "1.5"])(
      "asks for a weight above 0 kg with up to 3 decimals when '%s' is typed",
      (weight) => {
        expect(weightMessage(schema, { weight })).toBe(INVALID_WEIGHT_MESSAGE);
      },
    );

    it("tells that a weight above what a line may carry is too large", () => {
      expect(weightMessage(schema, { weight: "3.000.000" })).toBe(ABOVE_LINE_LIMIT_MESSAGE);
    });
  });
});
