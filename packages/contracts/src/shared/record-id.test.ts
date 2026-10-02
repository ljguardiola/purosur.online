import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { recordIdSchema } from "./record-id.js";

const GROUP_LENGTHS = [8, 4, 4, 4, 12];
const HEX_DIGITS = [..."0123456789abcdefABCDEF"];

const hexText = (length: number) =>
  fc.string({ unit: fc.constantFrom(...HEX_DIGITS), minLength: length, maxLength: length });

const anyRecordId = fc.tuple(...GROUP_LENGTHS.map(hexText)).map((groups) => groups.join("-"));

function failure(value: unknown, message?: string): string[] {
  const result = recordIdSchema(message).safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("recordIdSchema", () => {
  it("accepts every id of five hyphenated hexadecimal groups, whatever its version, variant or letter case", () => {
    fc.assert(
      fc.property(anyRecordId, (id) => {
        expect(recordIdSchema().safeParse(id).success).toBe(true);
      }),
    );
  });

  it("reads an id in lower case", () => {
    fc.assert(
      fc.property(anyRecordId, (id) => {
        expect(recordIdSchema().parse(id)).toBe(id.toLowerCase());
      }),
    );
  });

  it("refuses an id with a group one digit shorter or longer, or holding a character that is not hexadecimal", () => {
    fc.assert(
      fc.property(
        anyRecordId,
        fc.nat(GROUP_LENGTHS.length - 1),
        fc.constantFrom(
          (group: string) => group.slice(1),
          (group: string) => `${group}0`,
          (group: string) => `${group.slice(1)}g`,
          (group: string) => `${group.slice(1)}-`,
          (group: string) => `${group.slice(1)} `,
        ),
        (id, index, change) => {
          const groups = id.split("-");
          const changed = groups.toSpliced(index, 1, change(groups[index] ?? "")).join("-");
          expect(recordIdSchema().safeParse(changed).success).toBe(false);
        },
      ),
    );
  });

  it.each([
    ["the id without its hyphens", "0123abcdef014567f9abcdef01234567"],
    ["the id between braces", "{0123abcd-ef01-4567-f9ab-cdef01234567}"],
    ["the id with surrounding whitespace", " 0123abcd-ef01-4567-f9ab-cdef01234567"],
    ["the id with a trailing newline", "0123abcd-ef01-4567-f9ab-cdef01234567\n"],
    ["an empty text", ""],
    ["a number", 42],
    ["nothing", undefined],
  ])("refuses %s", (_case, value) => {
    expect(recordIdSchema().safeParse(value).success).toBe(false);
  });

  it("refuses with the message it is given", () => {
    expect(failure("not-an-id", "role_id must be a role's id")).toEqual([
      "role_id must be a role's id",
    ]);
    expect(failure(42, "role_id must be a role's id")).toEqual(["role_id must be a role's id"]);
  });

  it("refuses with the message a function of the issue returns", () => {
    const schema = recordIdSchema((issue) =>
      issue.input === undefined ? "is missing" : "is wrong",
    );

    expect(schema.safeParse(undefined).error?.issues.map((issue) => issue.message)).toEqual([
      "is missing",
    ]);
    expect(schema.safeParse("not-an-id").error?.issues.map((issue) => issue.message)).toEqual([
      "is wrong",
    ]);
  });

  it("refuses with a message of its own when given none", () => {
    expect(failure("not-an-id")).toEqual(["must be a record id"]);
  });
});
