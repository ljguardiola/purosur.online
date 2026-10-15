import { describe, expect, it } from "vitest";
import { dueOffsiteDumpNight, isOffsiteDumpNight } from "./offsite-dump-deadline.js";

describe("isOffsiteDumpNight", () => {
  it.each(["2026-10-14", "2028-02-29"])("accepts the calendar day %s", (night) => {
    expect(isOffsiteDumpNight(night)).toBe(true);
  });

  it.each(["2026-02-30", "2026-10-14T06:00:00Z", "14/10/2026", "2026-1-4", ""])(
    "refuses %j",
    (night) => {
      expect(isOffsiteDumpNight(night)).toBe(false);
    },
  );
});

describe("dueOffsiteDumpNight", () => {
  it("is the night whose deadline is exactly now", () => {
    expect(dueOffsiteDumpNight(new Date("2026-10-14T15:00:00.000Z"))).toBe("2026-10-14");
  });

  it("is still the previous night one millisecond before a deadline", () => {
    expect(dueOffsiteDumpNight(new Date("2026-10-14T14:59:59.999Z"))).toBe("2026-10-13");
  });

  it("stays on the night until the next deadline", () => {
    expect(dueOffsiteDumpNight(new Date("2026-10-14T23:59:59.999Z"))).toBe("2026-10-14");
    expect(dueOffsiteDumpNight(new Date("2026-10-15T00:00:00.000Z"))).toBe("2026-10-14");
  });

  it("crosses month and year boundaries", () => {
    expect(dueOffsiteDumpNight(new Date("2027-01-01T10:00:00.000Z"))).toBe("2026-12-31");
    expect(dueOffsiteDumpNight(new Date("2026-03-01T14:00:00.000Z"))).toBe("2026-02-28");
  });
});
