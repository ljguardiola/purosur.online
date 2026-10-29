import { describe, expect, test } from "vitest";
import { creatableChoice } from "./creatable-options";

const options = [{ value: "a", label: "A" }] as const;
const creation = { recordKind: "producto", onCreate: () => {} };

describe("creatableChoice", () => {
  test("offers the options alone when there is no way to create", () => {
    expect(creatableChoice(options, undefined)).toEqual({ options });
  });

  test("offers the options with the way to create", () => {
    expect(creatableChoice(options, creation)).toEqual({ options, creation });
  });

  test("offers no options and the way to create when there are no options", () => {
    expect(creatableChoice(undefined, creation)).toEqual({ options: [], creation });
  });

  test("offers nothing when there are no options and no way to create", () => {
    expect(creatableChoice(undefined, undefined)).toBeUndefined();
  });
});
