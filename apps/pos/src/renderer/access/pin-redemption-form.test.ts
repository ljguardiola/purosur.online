import { expect, test } from "vitest";
import {
  EMPTY_PIN_REDEMPTION_FORM,
  pinRedemptionRequestFrom,
  pinRedemptionRequestSchema,
} from "./pin-redemption-form";

const WHOLE = { code: "k7qm 2xpa 3dtr 4hwn", newPin: "482915", repeat: "482915" };

function issuePaths(values: typeof WHOLE): string[] {
  const result = pinRedemptionRequestSchema.safeParse(pinRedemptionRequestFrom(values));
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

test("the typed values are sent as they were typed", () => {
  expect(pinRedemptionRequestFrom(WHOLE)).toEqual({
    reset_code: "k7qm 2xpa 3dtr 4hwn",
    new_pin: "482915",
    repeat: "482915",
  });
});

test("a whole code with a PIN repeated the same is accepted, the code normalized", () => {
  const result = pinRedemptionRequestSchema.safeParse(pinRedemptionRequestFrom(WHOLE));

  expect(result.success && result.data.reset_code).toBe("K7QM2XPA3DTR4HWN");
});

test.each([
  { name: "an empty form", values: EMPTY_PIN_REDEMPTION_FORM, paths: ["reset_code", "new_pin"] },
  { name: "a repeat that differs", values: { ...WHOLE, repeat: "482916" }, paths: ["repeat"] },
  {
    name: "a short PIN repeated differently",
    values: { ...WHOLE, newPin: "4829", repeat: "4828" },
    paths: ["new_pin", "repeat"],
  },
])("$name is refused on $paths", ({ values, paths }) => {
  expect(issuePaths(values)).toEqual(expect.arrayContaining(paths));
  expect(issuePaths(values)).toHaveLength(paths.length);
});
