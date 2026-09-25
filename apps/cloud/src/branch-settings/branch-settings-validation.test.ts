import { BRANCH_HOURS_RANGES_PER_DAY_MAX as SHARED_BRANCH_HOURS_RANGES_PER_DAY_MAX } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  BRANCH_HOURS_RANGES_PER_DAY_MAX,
  type BranchSettingsFieldValidationFailure,
  readBranchSettingsEditBody,
} from "./branch-settings-validation.js";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    address: "",
    whatsapp_number: "",
    instagram_handle: "",
    monday_hours: [],
    tuesday_hours: [],
    wednesday_hours: [],
    thursday_hours: [],
    friday_hours: [],
    saturday_hours: [],
    sunday_hours: [],
    expiring_lot_alert_days: 30,
    unreviewed_price_alert_days: 30,
    good_condition_return_days: 15,
    version: 1,
    ...overrides,
  };
}

function isValidationFailure(
  value: ReturnType<typeof readBranchSettingsEditBody>,
): value is BranchSettingsFieldValidationFailure {
  return "field" in value;
}

describe("the cloud's local branch hours ranges-per-day cap", () => {
  it("matches the shared cap", () => {
    expect(BRANCH_HOURS_RANGES_PER_DAY_MAX).toBe(SHARED_BRANCH_HOURS_RANGES_PER_DAY_MAX);
  });
});

describe("readBranchSettingsEditBody, per-day hours", () => {
  it("accepts a day closed (an empty list)", () => {
    const result = readBranchSettingsEditBody(validBody());

    expect(isValidationFailure(result)).toBe(false);
  });

  it("accepts more than one range on the same day", () => {
    const result = readBranchSettingsEditBody(
      validBody({
        monday_hours: [
          { opens_at: "09:00", closes_at: "13:00" },
          { opens_at: "17:00", closes_at: "21:00" },
        ],
      }),
    );

    expect(isValidationFailure(result)).toBe(false);
    if (!isValidationFailure(result)) {
      expect(result.mondayHours).toEqual([
        { opensAt: "09:00", closesAt: "13:00" },
        { opensAt: "17:00", closesAt: "21:00" },
      ]);
    }
  });

  it("keeps each day independent", () => {
    const result = readBranchSettingsEditBody(
      validBody({
        friday_hours: [{ opens_at: "09:00", closes_at: "21:00" }],
      }),
    );

    expect(isValidationFailure(result)).toBe(false);
    if (!isValidationFailure(result)) {
      expect(result.fridayHours).toEqual([{ opensAt: "09:00", closesAt: "21:00" }]);
      expect(result.mondayHours).toEqual([]);
    }
  });

  it("rejects a day's hours that are not an array", () => {
    const result = readBranchSettingsEditBody(validBody({ monday_hours: null }));

    expect(result).toMatchObject({ field: "monday_hours" });
  });

  it("rejects a day missing from the body", () => {
    const body = validBody();
    delete body.sunday_hours;

    const result = readBranchSettingsEditBody(body);

    expect(result).toMatchObject({ field: "sunday_hours" });
  });

  it("rejects a range that is not an object", () => {
    const result = readBranchSettingsEditBody(validBody({ monday_hours: ["09:00-13:00"] }));

    expect(result).toMatchObject({ field: "monday_hours" });
  });

  it("rejects a range with a time that isn't a zero-padded HH:MM", () => {
    const result = readBranchSettingsEditBody(
      validBody({ monday_hours: [{ opens_at: "9:00", closes_at: "13:00" }] }),
    );

    expect(result).toMatchObject({ field: "monday_hours" });
  });

  it("rejects a range whose closing time isn't later than its opening time", () => {
    const result = readBranchSettingsEditBody(
      validBody({ tuesday_hours: [{ opens_at: "13:00", closes_at: "09:00" }] }),
    );

    expect(result).toMatchObject({ field: "tuesday_hours" });
  });

  it("rejects a range whose closing time equals its opening time", () => {
    const result = readBranchSettingsEditBody(
      validBody({ tuesday_hours: [{ opens_at: "09:00", closes_at: "09:00" }] }),
    );

    expect(result).toMatchObject({ field: "tuesday_hours" });
  });

  it("rejects two overlapping ranges on the same day", () => {
    const result = readBranchSettingsEditBody(
      validBody({
        wednesday_hours: [
          { opens_at: "09:00", closes_at: "14:00" },
          { opens_at: "13:00", closes_at: "18:00" },
        ],
      }),
    );

    expect(result).toMatchObject({ field: "wednesday_hours" });
  });

  it("rejects overlapping ranges regardless of the order they were sent in", () => {
    const result = readBranchSettingsEditBody(
      validBody({
        wednesday_hours: [
          { opens_at: "13:00", closes_at: "18:00" },
          { opens_at: "09:00", closes_at: "14:00" },
        ],
      }),
    );

    expect(result).toMatchObject({ field: "wednesday_hours" });
  });

  it("accepts two ranges that touch (one's close equals the other's open)", () => {
    const result = readBranchSettingsEditBody(
      validBody({
        thursday_hours: [
          { opens_at: "09:00", closes_at: "13:00" },
          { opens_at: "13:00", closes_at: "17:00" },
        ],
      }),
    );

    expect(isValidationFailure(result)).toBe(false);
  });

  it(`accepts exactly ${BRANCH_HOURS_RANGES_PER_DAY_MAX} ranges`, () => {
    const ranges = Array.from({ length: BRANCH_HOURS_RANGES_PER_DAY_MAX }, (_, index) => ({
      opens_at: `0${index}:00`.slice(-5),
      closes_at: `0${index}:30`.slice(-5),
    }));

    const result = readBranchSettingsEditBody(validBody({ monday_hours: ranges }));

    expect(isValidationFailure(result)).toBe(false);
  });

  it(`rejects more than ${BRANCH_HOURS_RANGES_PER_DAY_MAX} ranges on the same day`, () => {
    const ranges = Array.from({ length: BRANCH_HOURS_RANGES_PER_DAY_MAX + 1 }, (_, index) => ({
      opens_at: `0${index}:00`.slice(-5),
      closes_at: `0${index}:30`.slice(-5),
    }));

    const result = readBranchSettingsEditBody(validBody({ monday_hours: ranges }));

    expect(result).toMatchObject({ field: "monday_hours" });
  });
});
