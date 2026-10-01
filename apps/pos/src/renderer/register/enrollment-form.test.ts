import { expect, test } from "vitest";
import {
  EMPTY_ENROLLMENT_FORM,
  enrollmentRequestFrom,
  enrollmentRequestSchema,
} from "./enrollment-form";

function accepts(code: string): boolean {
  return enrollmentRequestSchema.safeParse(enrollmentRequestFrom({ code })).success;
}

test("the code is sent as it was typed", () => {
  expect(enrollmentRequestFrom({ code: "p4nx 7kwe 2qrt 6mzd" })).toEqual({
    code: "p4nx 7kwe 2qrt 6mzd",
  });
});

test.each(["p4nx 7kwe 2qrt 6mzd", "P4NX7KWE2QRT6MZD"])(
  "a whole code of '%s' is accepted",
  (code) => {
    expect(accepts(code)).toBe(true);
  },
);

test.each([EMPTY_ENROLLMENT_FORM.code, "P4NX 7KWE 2QRT", "P4NX 7KWE 2QRT 6MZ1"])(
  "a code of '%s' is not a whole code",
  (code) => {
    expect(accepts(code)).toBe(false);
  },
);
