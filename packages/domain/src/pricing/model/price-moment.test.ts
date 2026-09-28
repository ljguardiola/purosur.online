import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { momentAfter } from "./price-moment.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

const instant = fc.date({
  min: new Date("2000-01-01"),
  max: new Date("2100-01-01"),
  noInvalidDate: true,
});
const committedMoments = fc.array(fc.option(instant, { nil: undefined }), { maxLength: 6 });

describe("momentAfter", () => {
  it("keeps now when every committed moment is earlier", () => {
    const earlier = new Date(NOON.getTime() - 5_000);

    expect(momentAfter(NOON, [earlier, undefined])).toEqual(NOON);
  });

  it("keeps now when nothing was committed before", () => {
    expect(momentAfter(NOON, [])).toEqual(NOON);
    expect(momentAfter(NOON, [undefined])).toEqual(NOON);
  });

  it("moves one millisecond past a committed moment equal to now", () => {
    expect(momentAfter(NOON, [new Date(NOON)])).toEqual(new Date(NOON.getTime() + 1));
  });

  it("moves past the latest committed moment when several are at or after now", () => {
    const later = new Date(NOON.getTime() + 5_000);

    expect(momentAfter(NOON, [later, new Date(NOON)])).toEqual(new Date(later.getTime() + 1));
    expect(momentAfter(NOON, [new Date(NOON), later])).toEqual(new Date(later.getTime() + 1));
  });

  it("is strictly after every committed moment, for any clock and any commits", () => {
    fc.assert(
      fc.property(instant, committedMoments, (now, committed) => {
        const moment = momentAfter(now, committed);

        for (const date of committed) {
          if (date) {
            expect(moment.getTime()).toBeGreaterThan(date.getTime());
          }
        }
      }),
    );
  });

  it("never moves before now, and moves no further than the first free millisecond", () => {
    fc.assert(
      fc.property(instant, committedMoments, (now, committed) => {
        const moment = momentAfter(now, committed);
        const latest = Math.max(...committed.flatMap((date) => (date ? [date.getTime()] : [])));

        expect(moment.getTime()).toBeGreaterThanOrEqual(now.getTime());
        expect(moment.getTime()).toBe(Math.max(now.getTime(), latest + 1));
      }),
    );
  });

  it("does not change the moments it is given", () => {
    const committed = new Date(NOON);

    momentAfter(NOON, [committed]);

    expect(committed).toEqual(NOON);
  });
});
