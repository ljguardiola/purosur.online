import { describe, expect, it } from "vitest";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { OfflineAuthorizationCode } from "./offline-authorization-code-ports.js";
import { readCurrentOfflineAuthorizationCode } from "./read-current-offline-authorization-code.js";
import { FakeHeldOfflineAuthorizationCodes } from "./test-support/fake-held-offline-authorization-codes.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const FIRST_HALF: OfflineAuthorizationCode = {
  code: "36123456789012",
  fortnight: { start: "2026-10-01", end: "2026-10-15" },
  reportDeadline: "2026-10-20",
};
const SECOND_HALF: OfflineAuthorizationCode = {
  code: "36123456789013",
  fortnight: { start: "2026-10-16", end: "2026-10-31" },
  reportDeadline: "2026-11-05",
};

function at(day: string, time: string): Date {
  return new Date(argentinaInstant(day, time, FIXED_ARGENTINA_ZONE_RULES));
}

function read(now: Date, ...held: OfflineAuthorizationCode[]) {
  const codes = new FakeHeldOfflineAuthorizationCodes();
  for (const code of held) {
    codes.hold(code);
  }
  return {
    codes,
    current: readCurrentOfflineAuthorizationCode({
      codes,
      clock: new FixedClock(now),
      zoneRules: new FakeZoneRulesSource(),
    }),
  };
}

describe("readCurrentOfflineAuthorizationCode", () => {
  it("answers the code stored for the fortnight that contains today", async () => {
    const { current } = read(at("2026-10-10", "12:00"), FIRST_HALF, SECOND_HALF);

    await expect(current).resolves.toEqual(FIRST_HALF);
  });

  it("answers the code of the second half from its first day", async () => {
    const { current } = read(at("2026-10-16", "00:00"), FIRST_HALF, SECOND_HALF);

    await expect(current).resolves.toEqual(SECOND_HALF);
  });

  it("answers the code of the first half until the end of its last day in Argentina", async () => {
    const { current } = read(at("2026-10-15", "23:59"), FIRST_HALF, SECOND_HALF);

    await expect(current).resolves.toEqual(FIRST_HALF);
  });

  it("answers none while the current fortnight's code is not stored, even when another fortnight's is", async () => {
    const { current } = read(at("2026-10-20", "12:00"), FIRST_HALF);

    await expect(current).resolves.toBeNull();
  });

  it("asks for exactly the current fortnight", async () => {
    const { codes, current } = read(at("2026-10-20", "12:00"), SECOND_HALF);
    await current;

    expect(codes.asked).toEqual([SECOND_HALF.fortnight]);
  });
});
