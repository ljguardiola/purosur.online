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

test("what is typed is left for the core to judge, a repeat that matches being the only thing checked", () => {
  const result = pinRedemptionRequestSchema.safeParse(pinRedemptionRequestFrom(WHOLE));

  expect(result.success && result.data.reset_code).toBe("k7qm 2xpa 3dtr 4hwn");
});

test.each([
  { name: "an empty form", values: EMPTY_PIN_REDEMPTION_FORM },
  { name: "a code that is too short", values: { ...WHOLE, code: "k7qm" } },
  { name: "a PIN that is too short", values: { ...WHOLE, newPin: "4829", repeat: "4829" } },
])("$name is accepted", ({ values }) => {
  expect(issuePaths(values)).toEqual([]);
});

test.each([
  { name: "a repeat that differs", values: { ...WHOLE, repeat: "482916" } },
  {
    name: "a short PIN repeated differently",
    values: { ...WHOLE, newPin: "4829", repeat: "4828" },
  },
])("$name is refused on the repeat", ({ values }) => {
  expect(issuePaths(values)).toEqual(["repeat"]);
});
