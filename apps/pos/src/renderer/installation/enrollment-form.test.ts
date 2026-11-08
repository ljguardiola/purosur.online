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

test.each([
  "p4nx 7kwe 2qrt 6mzd",
  "P4NX7KWE2QRT6MZD",
  EMPTY_ENROLLMENT_FORM.code,
  "P4NX 7KWE 2QRT",
  "P4NX 7KWE 2QRT 6MZ1",
])("what is typed, '%s', is left for the core to judge", (code) => {
  expect(accepts(code)).toBe(true);
});
