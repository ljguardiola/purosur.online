import { describe, expect, expectTypeOf, it } from "vitest";
import { type BranchSettingsBody, branchSettingsSchema } from "./branch-settings.js";

const settings = {
  address: "Av. Belgrano 1450, CABA",
  whatsapp_number: "+54 9 11 3333-2211",
  instagram_handle: "@purosur.dietetica",
  monday_hours: [
    { opens_at: "09:00", closes_at: "13:00" },
    { opens_at: "17:00", closes_at: "21:00" },
  ],
  tuesday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  wednesday_hours: [],
  thursday_hours: [],
  friday_hours: [],
  saturday_hours: [],
  sunday_hours: [],
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 30,
  good_condition_return_days: 15,
  version: 1,
};

const requiredFields = Object.keys(settings) as (keyof typeof settings)[];
const dayFields = requiredFields.filter((field) => field.endsWith("_hours"));

describe("branchSettingsSchema", () => {
  it("accepts settings with closed days and days with several ranges", () => {
    expect(branchSettingsSchema.safeParse(settings).data).toEqual(settings);
  });

  it("strips keys it does not define", () => {
    expect(branchSettingsSchema.safeParse({ ...settings, timezone: "UTC" }).data).toEqual(settings);
  });

  it("strips keys a range does not define", () => {
    const parsed = branchSettingsSchema.safeParse({
      ...settings,
      tuesday_hours: [{ opens_at: "09:00", closes_at: "20:00", position: 0 }],
    });

    expect(parsed.data?.tuesday_hours).toEqual([{ opens_at: "09:00", closes_at: "20:00" }]);
  });

  it.each(requiredFields)("requires %s", (field) => {
    const { [field]: _omitted, ...rest } = settings;

    expect(branchSettingsSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["address", 1],
    ["address", null],
    ["whatsapp_number", 1],
    ["instagram_handle", null],
    ["expiring_lot_alert_days", "30"],
    ["expiring_lot_alert_days", 1.5],
    ["unreviewed_price_alert_days", null],
    ["unreviewed_price_alert_days", 2.5],
    ["good_condition_return_days", "15"],
    ["good_condition_return_days", 0.5],
    ["version", "1"],
    ["version", 1.5],
    ["version", null],
  ])("refuses %s as %j", (field, value) => {
    expect(branchSettingsSchema.safeParse({ ...settings, [field]: value }).success).toBe(false);
  });

  it.each(dayFields)("refuses %s that is not a list", (field) => {
    expect(branchSettingsSchema.safeParse({ ...settings, [field]: null }).success).toBe(false);
    expect(branchSettingsSchema.safeParse({ ...settings, [field]: {} }).success).toBe(false);
  });

  it.each(dayFields)("refuses %s holding a malformed range", (field) => {
    const malformedRanges = [
      [{ opens_at: "09:00" }],
      [{ closes_at: "13:00" }],
      [{ opens_at: 900, closes_at: "13:00" }],
      [{ opens_at: "09:00", closes_at: null }],
      ["09:00"],
    ];

    for (const ranges of malformedRanges) {
      expect(branchSettingsSchema.safeParse({ ...settings, [field]: ranges }).success).toBe(false);
    }
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<BranchSettingsBody["monday_hours"]>().toEqualTypeOf<
      { opens_at: string; closes_at: string }[]
    >();
    expectTypeOf<BranchSettingsBody["version"]>().toEqualTypeOf<number>();
  });
});
