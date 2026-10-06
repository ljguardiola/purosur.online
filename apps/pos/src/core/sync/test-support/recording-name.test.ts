import { describe, expect, it } from "vitest";
import { recordingNameFrom } from "./recording-name.js";

describe("the name of a recording", () => {
  it("is the kebab-case name given", () => {
    expect(recordingNameFrom("sales-dated-when-charged", [])).toBe("sales-dated-when-charged");
  });

  it("is refused when none is given", () => {
    expect(() => recordingNameFrom(undefined, [])).toThrow("REGISTER_PUSH_RECORDING");
    expect(() => recordingNameFrom("", [])).toThrow("REGISTER_PUSH_RECORDING");
  });

  it.each(["Sales", "two words", "under_score", "-leading", "trailing-", "double--dash", "a/b"])(
    "is refused when %j is not kebab-case",
    (name) => {
      expect(() => recordingNameFrom(name, [])).toThrow("kebab-case");
    },
  );

  it("is refused when a recording of that name already exists", () => {
    expect(() => recordingNameFrom("first-form", ["first-form.json", "other.json"])).toThrow(
      "already exists",
    );
    expect(recordingNameFrom("second-form", ["first-form.json"])).toBe("second-form");
  });
});
