import {
  BRANCH_HOURS_RANGES_PER_DAY_MAX,
  BRANCH_SETTINGS_DAYS_MAX,
  BRANCH_SETTINGS_TEXT_MAX_LENGTH,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { branchSettingsEditBodySchema } from "./branch-settings-edit.js";

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

function firstFailingField(body: unknown): unknown {
  const result = branchSettingsEditBodySchema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.path[0];
}

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = branchSettingsEditBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

function isAccepted(body: unknown): boolean {
  return branchSettingsEditBodySchema.safeParse(body).success;
}

describe("branchSettingsEditBodySchema, per-day hours", () => {
  it("accepts a day closed (an empty list)", () => {
    expect(isAccepted(validBody())).toBe(true);
  });

  it("accepts more than one range on the same day, keeping them in the order sent", () => {
    const monday_hours = [
      { opens_at: "09:00", closes_at: "13:00" },
      { opens_at: "17:00", closes_at: "21:00" },
    ];

    const result = branchSettingsEditBodySchema.safeParse(validBody({ monday_hours }));

    expect(result).toMatchObject({ success: true, data: { monday_hours } });
  });

  it("keeps each day independent", () => {
    const friday_hours = [{ opens_at: "09:00", closes_at: "21:00" }];

    const result = branchSettingsEditBodySchema.safeParse(validBody({ friday_hours }));

    expect(result).toMatchObject({ success: true, data: { friday_hours, monday_hours: [] } });
  });

  it("rejects a day's hours that are not an array", () => {
    expect(firstFailingField(validBody({ monday_hours: null }))).toBe("monday_hours");
  });

  it("rejects a day missing from the body", () => {
    const body = validBody();
    delete body["sunday_hours"];

    expect(firstFailingField(body)).toBe("sunday_hours");
  });

  it("rejects a range that is not an object", () => {
    expect(firstFailingField(validBody({ monday_hours: ["09:00-13:00"] }))).toBe("monday_hours");
  });

  it("rejects a range missing one of its two times", () => {
    expect(firstFailingField(validBody({ sunday_hours: [{ opens_at: "09:00" }] }))).toBe(
      "sunday_hours",
    );
  });

  it("rejects a range with a time that isn't a zero-padded HH:MM", () => {
    expect(
      firstFailingField(validBody({ monday_hours: [{ opens_at: "9:00", closes_at: "13:00" }] })),
    ).toBe("monday_hours");
  });

  it("rejects a range whose closing time isn't later than its opening time", () => {
    expect(
      firstFailingField(validBody({ tuesday_hours: [{ opens_at: "13:00", closes_at: "09:00" }] })),
    ).toBe("tuesday_hours");
  });

  it("rejects a range whose closing time equals its opening time", () => {
    expect(
      firstFailingField(validBody({ tuesday_hours: [{ opens_at: "09:00", closes_at: "09:00" }] })),
    ).toBe("tuesday_hours");
  });

  it("rejects two overlapping ranges on the same day, whatever order they were sent in", () => {
    const morning = { opens_at: "09:00", closes_at: "14:00" };
    const afternoon = { opens_at: "13:00", closes_at: "18:00" };

    expect(firstFailingField(validBody({ wednesday_hours: [morning, afternoon] }))).toBe(
      "wednesday_hours",
    );
    expect(firstFailingField(validBody({ wednesday_hours: [afternoon, morning] }))).toBe(
      "wednesday_hours",
    );
  });

  it("accepts two ranges that touch (one's close equals the other's open)", () => {
    expect(
      isAccepted(
        validBody({
          thursday_hours: [
            { opens_at: "09:00", closes_at: "13:00" },
            { opens_at: "13:00", closes_at: "17:00" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it(`accepts exactly ${BRANCH_HOURS_RANGES_PER_DAY_MAX} ranges`, () => {
    const ranges = Array.from({ length: BRANCH_HOURS_RANGES_PER_DAY_MAX }, (_, index) => ({
      opens_at: `0${index}:00`,
      closes_at: `0${index}:30`,
    }));

    expect(isAccepted(validBody({ monday_hours: ranges }))).toBe(true);
  });

  it(`rejects more than ${BRANCH_HOURS_RANGES_PER_DAY_MAX} ranges on the same day`, () => {
    const ranges = Array.from({ length: BRANCH_HOURS_RANGES_PER_DAY_MAX + 1 }, (_, index) => ({
      opens_at: `0${index}:00`,
      closes_at: `0${index}:30`,
    }));

    expect(firstFailingField(validBody({ monday_hours: ranges }))).toBe("monday_hours");
  });

  it("reports the first day that fails, in Monday to Sunday order", () => {
    const body = validBody({ friday_hours: null, tuesday_hours: null });

    expect(firstFailingField(body)).toBe("tuesday_hours");
  });
});

describe("branchSettingsEditBodySchema, text fields", () => {
  function textFailure(field: string) {
    return {
      field,
      message: `${field} must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`,
    };
  }

  it.each(["address", "whatsapp_number", "instagram_handle"])(
    "accepts %s of exactly the maximum length",
    (field) => {
      const text = "a".repeat(BRANCH_SETTINGS_TEXT_MAX_LENGTH);

      expect(isAccepted(validBody({ [field]: text }))).toBe(true);
    },
  );

  it.each(["address", "whatsapp_number", "instagram_handle"])(
    "rejects %s longer than the maximum length",
    (field) => {
      const text = "a".repeat(BRANCH_SETTINGS_TEXT_MAX_LENGTH + 1);

      expect(firstFailure(validBody({ [field]: text }))).toEqual(textFailure(field));
    },
  );

  it.each(["address", "whatsapp_number", "instagram_handle"])(
    "rejects %s that isn't a string",
    (field) => {
      expect(firstFailure(validBody({ [field]: 541155555555 }))).toEqual(textFailure(field));
    },
  );

  it.each(["address", "whatsapp_number", "instagram_handle"])("rejects a missing %s", (field) => {
    const body = validBody();
    delete body[field];

    expect(firstFailure(body)).toEqual(textFailure(field));
  });

  it.each(["address", "whatsapp_number", "instagram_handle"])(
    "trims %s before measuring it and keeps the trimmed value",
    (field) => {
      const padded = `  ${"a".repeat(BRANCH_SETTINGS_TEXT_MAX_LENGTH)}  `;

      const result = branchSettingsEditBodySchema.safeParse(validBody({ [field]: padded }));

      expect(result).toMatchObject({
        success: true,
        data: { [field]: "a".repeat(BRANCH_SETTINGS_TEXT_MAX_LENGTH) },
      });
    },
  );

  it("reports the first failing text field in address, whatsapp number, instagram handle order", () => {
    const body = validBody({ instagram_handle: 1, whatsapp_number: 1 });

    expect(firstFailingField(body)).toBe("whatsapp_number");
  });
});

describe("branchSettingsEditBodySchema, window values in days", () => {
  const dayFields = [
    "expiring_lot_alert_days",
    "unreviewed_price_alert_days",
    "good_condition_return_days",
  ];

  it.each(dayFields)("accepts %s of 0 and of the maximum", (field) => {
    expect(isAccepted(validBody({ [field]: 0 }))).toBe(true);
    expect(isAccepted(validBody({ [field]: BRANCH_SETTINGS_DAYS_MAX }))).toBe(true);
  });

  it.each(dayFields)("rejects %s above the maximum", (field) => {
    expect(firstFailingField(validBody({ [field]: BRANCH_SETTINGS_DAYS_MAX + 1 }))).toBe(field);
  });

  it.each(dayFields)("rejects a negative %s", (field) => {
    expect(firstFailingField(validBody({ [field]: -1 }))).toBe(field);
  });

  it.each(dayFields)("rejects a non-integer %s", (field) => {
    expect(firstFailingField(validBody({ [field]: 30.5 }))).toBe(field);
  });

  it.each(dayFields)("rejects a %s that isn't a number", (field) => {
    expect(firstFailingField(validBody({ [field]: "30" }))).toBe(field);
  });
});

describe("branchSettingsEditBodySchema, version", () => {
  it.each([
    { case: "a missing version", version: undefined },
    { case: "a non-integer version", version: 1.5 },
    { case: "a version below 1", version: 0 },
    { case: "a version that isn't a number", version: "1" },
  ])("rejects $case", ({ version }) => {
    expect(firstFailingField(validBody({ version }))).toBe("version");
  });

  it("reports version after every other field", () => {
    const body = validBody({ version: 0, expiring_lot_alert_days: -1 });

    expect(firstFailingField(body)).toBe("expiring_lot_alert_days");
  });
});

describe("branchSettingsEditBodySchema, unknown fields", () => {
  it("drops fields it does not know", () => {
    const result = branchSettingsEditBodySchema.safeParse(validBody({ unexpected: true }));

    expect(result.success && "unexpected" in result.data).toBe(false);
  });
});
