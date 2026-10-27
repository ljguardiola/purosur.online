import { describe, expect, it } from "vitest";
import { currentZoneRulesSchema } from "./current-zone-rules.js";

const rules = {
  version: "2026a",
  transitions: [
    { from: "1970-01-01T00:00:00.000Z", offset_minutes: -180 },
    { from: "2030-03-01T03:00:00.000Z", offset_minutes: -120 },
  ],
};

describe("currentZoneRulesSchema", () => {
  it("accepts the version and the transitions of published zone rules", () => {
    expect(currentZoneRulesSchema.safeParse(rules).data).toEqual(rules);
  });

  it("strips keys it does not define", () => {
    expect(currentZoneRulesSchema.safeParse({ ...rules, publication_number: 3 }).data).toEqual(
      rules,
    );
  });

  it.each(["version", "transitions"])("requires %s", (field) => {
    const { [field as keyof typeof rules]: _omitted, ...rest } = rules;

    expect(currentZoneRulesSchema.safeParse(rest).success).toBe(false);
  });

  it("refuses an empty version", () => {
    expect(currentZoneRulesSchema.safeParse({ ...rules, version: "" }).success).toBe(false);
  });

  it("refuses rules without a transition", () => {
    expect(currentZoneRulesSchema.safeParse({ ...rules, transitions: [] }).success).toBe(false);
  });

  it.each([
    ["a transition that is not a date", [{ from: "soon", offset_minutes: -180 }]],
    ["a fractional offset", [{ from: "1970-01-01T00:00:00.000Z", offset_minutes: -90.5 }]],
    ["a transition without an offset", [{ from: "1970-01-01T00:00:00.000Z" }]],
  ])("refuses %s", (_case, transitions) => {
    expect(currentZoneRulesSchema.safeParse({ ...rules, transitions }).success).toBe(false);
  });

  it("refuses transitions that do not start in increasing order", () => {
    expect(
      currentZoneRulesSchema.safeParse({
        ...rules,
        transitions: [...rules.transitions].reverse(),
      }).success,
    ).toBe(false);
  });
});
