import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  argentinaCalendarDay,
  argentinaInstant,
  FIXED_ARGENTINA_ZONE_RULES,
} from "../../shared/index.js";
import {
  DEFECT_RETURN_MONTHS,
  isReturnWindowOpen,
  returnWindowLastDay,
  returnWindows,
} from "./return-window.js";

const SOLD_AT = new Date(argentinaInstant("2026-09-12", "15:30", FIXED_ARGENTINA_ZONE_RULES));

describe("DEFECT_RETURN_MONTHS", () => {
  it("is the six months of the legal warranty for hidden defects", () => {
    expect(DEFECT_RETURN_MONTHS).toBe(6);
  });
});

describe("returnWindowLastDay", () => {
  it("lets a change of mind through the day the branch's days after the sale end, that day included", () => {
    expect(returnWindowLastDay("change_of_mind", SOLD_AT, 15, FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2026-09-27",
    );
  });

  it("follows the branch's days for a change of mind", () => {
    expect(returnWindowLastDay("change_of_mind", SOLD_AT, 30, FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2026-10-12",
    );
    expect(returnWindowLastDay("change_of_mind", SOLD_AT, 0, FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2026-09-12",
    );
  });

  it("lets a defect through the same day six months after the sale, whatever the branch's days", () => {
    expect(returnWindowLastDay("defective", SOLD_AT, 15, FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2027-03-12",
    );
    expect(returnWindowLastDay("defective", SOLD_AT, 1, FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2027-03-12",
    );
  });

  it("ends a defect's window on the last day of a month that is too short for the sale's day", () => {
    const soldAugust31 = new Date(
      argentinaInstant("2026-08-31", "10:00", FIXED_ARGENTINA_ZONE_RULES),
    );

    expect(returnWindowLastDay("defective", soldAugust31, 15, FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2027-02-28",
    );
  });

  it("counts the sale's day in Argentina, not in UTC", () => {
    const soldLateEvening = new Date(
      argentinaInstant("2026-09-12", "23:30", FIXED_ARGENTINA_ZONE_RULES),
    );

    expect(soldLateEvening.toISOString().slice(0, 10)).toBe("2026-09-13");
    expect(
      returnWindowLastDay("change_of_mind", soldLateEvening, 15, FIXED_ARGENTINA_ZONE_RULES),
    ).toBe("2026-09-27");
    expect(returnWindowLastDay("defective", soldLateEvening, 15, FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2027-03-12",
    );
  });

  it("never ends a change of mind before the sale's day nor a defect before a change of mind", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2020-01-01"), max: new Date("2040-01-01"), noInvalidDate: true }),
        fc.integer({ min: 0, max: 60 }),
        (soldAt, days) => {
          const changeOfMind = returnWindowLastDay(
            "change_of_mind",
            soldAt,
            days,
            FIXED_ARGENTINA_ZONE_RULES,
          );
          const defective = returnWindowLastDay(
            "defective",
            soldAt,
            days,
            FIXED_ARGENTINA_ZONE_RULES,
          );

          expect(changeOfMind >= argentinaCalendarDay(soldAt, FIXED_ARGENTINA_ZONE_RULES)).toBe(
            true,
          );
          expect(defective > changeOfMind).toBe(true);
        },
      ),
    );
  });
});

describe("isReturnWindowOpen", () => {
  it("is open through the last day's final minute", () => {
    expect(
      isReturnWindowOpen(
        "2026-09-27",
        new Date(argentinaInstant("2026-09-27", "23:59", FIXED_ARGENTINA_ZONE_RULES)),
        FIXED_ARGENTINA_ZONE_RULES,
      ),
    ).toBe(true);
  });

  it("is closed from the next day's first minute", () => {
    expect(
      isReturnWindowOpen(
        "2026-09-27",
        new Date(argentinaInstant("2026-09-28", "00:00", FIXED_ARGENTINA_ZONE_RULES)),
        FIXED_ARGENTINA_ZONE_RULES,
      ),
    ).toBe(false);
  });

  it("is open on the sale's own day and on every day before the last", () => {
    expect(isReturnWindowOpen("2026-09-27", SOLD_AT, FIXED_ARGENTINA_ZONE_RULES)).toBe(true);
    expect(
      isReturnWindowOpen(
        "2026-09-27",
        new Date(argentinaInstant("2026-09-20", "09:00", FIXED_ARGENTINA_ZONE_RULES)),
        FIXED_ARGENTINA_ZONE_RULES,
      ),
    ).toBe(true);
  });

  it("reads the day in Argentina, which is still the last day in UTC's next one", () => {
    const eveningOfLastDay = new Date(
      argentinaInstant("2026-09-27", "22:00", FIXED_ARGENTINA_ZONE_RULES),
    );

    expect(eveningOfLastDay.toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(isReturnWindowOpen("2026-09-27", eveningOfLastDay, FIXED_ARGENTINA_ZONE_RULES)).toBe(
      true,
    );
  });
});

describe("returnWindows", () => {
  it("allows a change of mind through the fifteenth day and refuses it from the sixteenth, while a defect stays allowed", () => {
    const fifteenDaysLater = new Date(
      argentinaInstant("2026-09-27", "10:00", FIXED_ARGENTINA_ZONE_RULES),
    );
    const sixteenDaysLater = new Date(
      argentinaInstant("2026-09-28", "10:00", FIXED_ARGENTINA_ZONE_RULES),
    );

    expect(returnWindows(SOLD_AT, 15, fifteenDaysLater, FIXED_ARGENTINA_ZONE_RULES)).toEqual({
      change_of_mind: { lastAllowedDay: "2026-09-27", open: true },
      defective: { lastAllowedDay: "2027-03-12", open: true },
    });
    expect(returnWindows(SOLD_AT, 15, sixteenDaysLater, FIXED_ARGENTINA_ZONE_RULES)).toEqual({
      change_of_mind: { lastAllowedDay: "2026-09-27", open: false },
      defective: { lastAllowedDay: "2027-03-12", open: true },
    });
  });

  it("refuses a defect once more than six months have passed", () => {
    const sevenMonthsLater = new Date(
      argentinaInstant("2027-04-12", "10:00", FIXED_ARGENTINA_ZONE_RULES),
    );

    expect(
      returnWindows(SOLD_AT, 15, sevenMonthsLater, FIXED_ARGENTINA_ZONE_RULES).defective.open,
    ).toBe(false);
  });
});
