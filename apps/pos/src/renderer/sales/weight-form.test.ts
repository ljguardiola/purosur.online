import { parseWeightThousandths } from "@purosur/ui";
import { describe, expect, it } from "vitest";
import { weightFieldText, weightRequestFrom, weightRequestSchema } from "./weight-form";

function accepted(weight: string) {
  return weightRequestSchema.safeParse(weightRequestFrom({ weight })).success;
}

describe("weight form", () => {
  it("requests a typed weight in thousandths of a kilogram", () => {
    expect(weightRequestFrom({ weight: "1,25" })).toEqual({ weight_thousandths: 1250 });
  });

  it.each(["0,001", "1,250", "2", "1.250,5"])("accepts a typed weight of '%s'", (weight) => {
    expect(accepted(weight)).toBe(true);
  });

  it.each(["", "abc", "0", "0,000", "1,2345", "-1", "1.5"])(
    "refuses a typed weight of '%s'",
    (weight) => {
      expect(accepted(weight)).toBe(false);
    },
  );

  it("shows a weight in thousandths as the text to retype", () => {
    expect(weightFieldText(1250)).toBe("1,250");
    expect(weightFieldText(500)).toBe("0,500");
    expect(parseWeightThousandths(weightFieldText(1_234_567))).toBe(1_234_567);
  });
});
