import { describe, expect, it } from "vitest";
import type { ClockMark } from "../model/clock-correction.js";
import { readRegisterClockGuard } from "./read-register-clock-guard.js";
import {
  type FakeRegisterClockGuardState,
  fakeRegisterClockGuardReader,
} from "./test-support/fake-register-clock-guard-reader.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const READING = new Date("2026-10-01T15:00:00.000Z");
const ahead = (ms: number) => new Date(READING.getTime() + ms);
const CORRECTOR = { isAdministrator: false, permissionKeys: ["correct_register_clock"] };
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const REAL_TIME_MARK: ClockMark = {
  pointOfSale: 12,
  documentType: "factura_c",
  reading: ahead(3_600_000),
};
const OFFLINE_MARK: ClockMark = {
  pointOfSale: 7,
  documentType: "factura_c",
  reading: ahead(120_000),
};

function readAs(userId: string | undefined, state: Partial<FakeRegisterClockGuardState> = {}) {
  return readRegisterClockGuard(
    {
      reader: fakeRegisterClockGuardReader({
        accesses: { ana: CORRECTOR, bruno: CASHIER },
        ...state,
      }),
      clock: new FixedClock(READING),
    },
    { userId },
  );
}

function read(state: Partial<FakeRegisterClockGuardState>) {
  return readAs("ana", state);
}

describe("readRegisterClockGuard", () => {
  it("answers the register's current reading", () => {
    expect(read({}).reading).toEqual(READING);
  });

  it("blocks nothing while the register holds no mark and no tax authority day", () => {
    expect(read({}).blocks).toEqual([]);
  });

  it.each([
    ["behind it", ahead(-1000)],
    ["equal to it", READING],
    ["within a minute ahead of it", ahead(60_000)],
  ])("blocks nothing for a mark %s", (_case, reading) => {
    const mark = { ...REAL_TIME_MARK, reading };

    expect(read({ marks: [mark] }).blocks).toEqual([]);
  });

  it("blocks the point of sale whose mark is more than a minute ahead of the reading", () => {
    expect(read({ marks: [REAL_TIME_MARK] }).blocks).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        latestReading: REAL_TIME_MARK.reading,
        taxAuthorityLastIssuedOn: null,
      },
    ]);
  });

  it("blocks each point of sale behind its own mark, leaving the others", () => {
    const state = {
      marks: [{ ...REAL_TIME_MARK, reading: ahead(0) }, OFFLINE_MARK],
    };

    expect(read(state).blocks.map(({ pointOfSale }) => pointOfSale)).toEqual([7]);
  });

  it("blocks the point of sale of the tax authority's day when the reading's day is before it, whatever its mark", () => {
    const floor = {
      pointOfSale: 12,
      documentType: "factura_c",
      lastIssuedOn: "2026-10-02",
    } as const;

    expect(read({ floor }).blocks).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        latestReading: null,
        taxAuthorityLastIssuedOn: "2026-10-02",
      },
    ]);
  });

  it("answers one block carrying both the mark and the day when both hold the point of sale", () => {
    const floor = {
      pointOfSale: 12,
      documentType: "factura_c",
      lastIssuedOn: "2026-10-02",
    } as const;

    expect(read({ floor, marks: [REAL_TIME_MARK] }).blocks).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        latestReading: REAL_TIME_MARK.reading,
        taxAuthorityLastIssuedOn: "2026-10-02",
      },
    ]);
  });

  it("blocks the point of sale of the tax authority's day by its mark too when the mark is not behind", () => {
    const floor = {
      pointOfSale: 12,
      documentType: "factura_c",
      lastIssuedOn: "2026-10-02",
    } as const;
    const mark = { ...REAL_TIME_MARK, reading: ahead(0) };

    expect(read({ floor, marks: [mark] }).blocks).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        latestReading: mark.reading,
        taxAuthorityLastIssuedOn: "2026-10-02",
      },
    ]);
  });

  it("blocks no other point of sale for the tax authority's day", () => {
    const floor = {
      pointOfSale: 12,
      documentType: "factura_c",
      lastIssuedOn: "2026-10-02",
    } as const;
    const other = { ...OFFLINE_MARK, reading: ahead(0) };

    expect(read({ floor, marks: [other] }).blocks.map(({ pointOfSale }) => pointOfSale)).toEqual([
      12,
    ]);
  });

  it.each([
    ["the same day as the reading's", "2026-10-01"],
    ["before the reading's day", "2026-09-30"],
  ])("does not block for a tax authority day %s", (_case, lastIssuedOn) => {
    const floor = { pointOfSale: 12, documentType: "factura_c", lastIssuedOn } as const;

    expect(read({ floor }).blocks).toEqual([]);
  });

  it("does not block a point of sale holding a mark that is not behind when its tax authority day is not ahead of the reading", () => {
    const floor = {
      pointOfSale: 12,
      documentType: "factura_c",
      lastIssuedOn: "2026-10-01",
    } as const;
    const mark = { ...REAL_TIME_MARK, reading: ahead(0) };

    expect(read({ floor, marks: [mark] }).blocks).toEqual([]);
  });

  it("names the tax authority's day on the block of a mark only when the day belongs to that point of sale", () => {
    const floor = {
      pointOfSale: 12,
      documentType: "factura_c",
      lastIssuedOn: "2026-09-30",
    } as const;

    const [block] = read({ floor, marks: [OFFLINE_MARK] }).blocks;

    expect(block?.taxAuthorityLastIssuedOn).toBeNull();
  });

  it("reads the day of the reading in Argentina", () => {
    const floor = {
      pointOfSale: 12,
      documentType: "factura_c",
      lastIssuedOn: "2026-10-01",
    } as const;
    const lateNight = readRegisterClockGuard(
      {
        reader: fakeRegisterClockGuardReader({ floor }),
        clock: new FixedClock(new Date("2026-10-02T01:00:00.000Z")),
      },
      { userId: undefined },
    );

    expect(lateNight.blocks).toEqual([]);
  });

  describe("who may correct", () => {
    it("is a person holding the permission to correct the register's clock", () => {
      expect(readAs("ana").mayCorrect).toBe(true);
    });

    it.each([
      ["a person without it", "bruno"],
      ["a person the register does not know", "nadie"],
      ["no one signed in", undefined],
    ])("is not %s", (_case, userId) => {
      expect(readAs(userId).mayCorrect).toBe(false);
    });
  });

  describe("whether a correction is available", () => {
    it("is when a mark is ahead of the reading and no correction was made in the period", () => {
      expect(read({ marks: [REAL_TIME_MARK] }).correction).toBe("available");
    });

    it("is not, with nothing behind, when no mark is more than a minute ahead of the reading", () => {
      expect(read({ marks: [{ ...REAL_TIME_MARK, reading: ahead(60_000) }] }).correction).toBe(
        "not_behind",
      );
    });

    it("is not, with nothing behind, when only the tax authority's day blocks, which no correction lowers", () => {
      const floor = {
        pointOfSale: 12,
        documentType: "factura_c",
        lastIssuedOn: "2026-10-02",
      } as const;

      expect(read({ floor }).correction).toBe("not_behind");
    });

    it("is not, with nothing behind, when only the tax authority's day blocks and the period's correction was made", () => {
      const state = {
        floor: { pointOfSale: 12, documentType: "factura_c", lastIssuedOn: "2026-10-02" } as const,
        standing: { openSessionId: "session-1", lastClosedSessionId: "session-0" },
        periodsWithCorrection: ["session-1"],
      };

      expect(read(state).correction).toBe("not_behind");
    });

    it("is not, already used, when a correction was made in the open cash session", () => {
      const state = {
        marks: [REAL_TIME_MARK],
        standing: { openSessionId: "session-1", lastClosedSessionId: "session-0" },
        periodsWithCorrection: ["session-1"],
      };

      expect(read(state).correction).toBe("already_corrected_in_period");
    });

    it("is when the correction was made in an earlier cash session", () => {
      const state = {
        marks: [REAL_TIME_MARK],
        standing: { openSessionId: "session-2", lastClosedSessionId: "session-1" },
        periodsWithCorrection: ["session-1"],
      };

      expect(read(state).correction).toBe("available");
    });

    it("is not, already used, when a correction was made since the last session closed, with none open", () => {
      const state = {
        marks: [REAL_TIME_MARK],
        standing: { openSessionId: null, lastClosedSessionId: "session-1" },
        periodsWithCorrection: ["after session session-1"],
      };

      expect(read(state).correction).toBe("already_corrected_in_period");
    });

    it("is when the correction since the last session closed does not count against the next session", () => {
      const state = {
        marks: [REAL_TIME_MARK],
        standing: { openSessionId: "session-2", lastClosedSessionId: "session-1" },
        periodsWithCorrection: ["after session session-1"],
      };

      expect(read(state).correction).toBe("available");
    });
  });
});
