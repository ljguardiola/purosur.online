import { BRANCH_HOURS_RANGES_PER_DAY_MAX } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  BRANCH_SETTINGS_DAYS_MAX,
  BRANCH_SETTINGS_TEXT_MAX_LENGTH,
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

  it("rejects a range missing one of its two times", () => {
    const result = readBranchSettingsEditBody(validBody({ sunday_hours: [{ opens_at: "09:00" }] }));

    expect(result).toMatchObject({ field: "sunday_hours" });
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

describe("readBranchSettingsEditBody, text fields", () => {
  it.each(["address", "whatsapp_number", "instagram_handle"])(
    "accepts %s of exactly the maximum length",
    (field) => {
      const text = "a".repeat(BRANCH_SETTINGS_TEXT_MAX_LENGTH);

      const result = readBranchSettingsEditBody(validBody({ [field]: text }));

      expect(isValidationFailure(result)).toBe(false);
    },
  );

  it.each(["address", "whatsapp_number", "instagram_handle"])(
    "rejects %s longer than the maximum length",
    (field) => {
      const text = "a".repeat(BRANCH_SETTINGS_TEXT_MAX_LENGTH + 1);

      const result = readBranchSettingsEditBody(validBody({ [field]: text }));

      expect(result).toMatchObject({ field });
    },
  );

  it.each(["address", "whatsapp_number", "instagram_handle"])(
    "rejects %s that isn't a string",
    (field) => {
      const result = readBranchSettingsEditBody(validBody({ [field]: 541155555555 }));

      expect(result).toMatchObject({ field });
    },
  );
});

describe("readBranchSettingsEditBody, window values in days", () => {
  const dayFields = [
    "expiring_lot_alert_days",
    "unreviewed_price_alert_days",
    "good_condition_return_days",
  ];

  it.each(dayFields)("accepts %s of 0 and of the maximum", (field) => {
    expect(isValidationFailure(readBranchSettingsEditBody(validBody({ [field]: 0 })))).toBe(false);
    expect(
      isValidationFailure(
        readBranchSettingsEditBody(validBody({ [field]: BRANCH_SETTINGS_DAYS_MAX })),
      ),
    ).toBe(false);
  });

  it.each(dayFields)("rejects %s above the maximum", (field) => {
    const result = readBranchSettingsEditBody(validBody({ [field]: BRANCH_SETTINGS_DAYS_MAX + 1 }));

    expect(result).toMatchObject({ field });
  });

  it.each(dayFields)("rejects a negative %s", (field) => {
    const result = readBranchSettingsEditBody(validBody({ [field]: -1 }));

    expect(result).toMatchObject({ field });
  });

  it.each(dayFields)("rejects a non-integer %s", (field) => {
    const result = readBranchSettingsEditBody(validBody({ [field]: 30.5 }));

    expect(result).toMatchObject({ field });
  });
});

describe("readBranchSettingsEditBody, version", () => {
  it.each([
    { case: "a missing version", version: undefined },
    { case: "a non-integer version", version: 1.5 },
    { case: "a version below 1", version: 0 },
  ])("rejects $case", ({ version }) => {
    const result = readBranchSettingsEditBody(validBody({ version }));

    expect(result).toMatchObject({ field: "version" });
  });
});
