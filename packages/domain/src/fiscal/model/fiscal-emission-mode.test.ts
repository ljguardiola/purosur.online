import { describe, expect, it } from "vitest";
import {
  FISCAL_AUTHORIZATIONS,
  FISCAL_EMISSION_MODE_KINDS,
  fiscalEmissionModeOf,
} from "./fiscal-emission-mode.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const ONLINE = {
  lastHealthCheckOkAt: new Date(NOW.getTime() - 1_000),
  tokenValid: true,
  arcaReachable: true,
};
const SERIES = {
  pointOfSale: 12,
  localLastAuthorized: 40,
  taxAuthorityLastAuthorized: 38,
  documentRequesting: false,
  documentUnknown: false,
  numberingFrozen: false,
  clockMark: null,
  taxAuthorityLastIssuedOn: null,
  clockCorrections: [],
};
const OFFLINE_SERIES = {
  pointOfSale: 7,
  blocksInAssignmentOrder: [{ firstNumber: 101, lastNumber: 1100 }],
  localLastUsed: null,
  taxAuthorityLastAuthorized: 100,
  highestSyncedNumber: null,
  clockMark: null,
};
const CODE = "71234567890123";

function modeOf(changes: Partial<Parameters<typeof fiscalEmissionModeOf>[0]> = {}) {
  return fiscalEmissionModeOf({
    online: ONLINE,
    now: NOW,
    series: SERIES,
    offlineSeries: OFFLINE_SERIES,
    offlineAuthorizationCode: CODE,
    latestGate: undefined,
    ...changes,
  });
}

describe("fiscalEmissionModeOf", () => {
  it("is real time while the register would reserve the next number", () => {
    expect(modeOf()).toEqual({ kind: "real_time" });
  });

  it("defers while the register's latest pre-emission gate failed", () => {
    expect(
      modeOf({
        online: { ...ONLINE, arcaReachable: false },
        latestGate: { kind: "failed", reason: "legal_name_missing" },
      }),
    ).toEqual({ kind: "deferring", reason: "pre_emission_gate_failed" });
  });

  it("follows the register's series once its latest pre-emission gate passed", () => {
    expect(
      modeOf({ online: { ...ONLINE, arcaReachable: false }, latestGate: { kind: "passed" } }),
    ).toEqual({ kind: "offline_code", cause: "no_connectivity" });
  });

  it("is the offline code for lack of connectivity when it holds the code and a number", () => {
    expect(modeOf({ online: { ...ONLINE, arcaReachable: false } })).toEqual({
      kind: "offline_code",
      cause: "no_connectivity",
    });
  });

  it("is the offline code while the numbering is frozen", () => {
    expect(modeOf({ series: { ...SERIES, numberingFrozen: true } })).toEqual({
      kind: "offline_code",
      cause: "numbering_conflict",
    });
  });

  it("is the offline code while a document's outcome is unknown", () => {
    expect(modeOf({ series: { ...SERIES, documentUnknown: true } })).toEqual({
      kind: "offline_code",
      cause: "unclear_outcome",
    });
  });

  it("defers when it is offline and holds no code", () => {
    expect(
      modeOf({ online: { ...ONLINE, tokenValid: false }, offlineAuthorizationCode: null }),
    ).toEqual({ kind: "deferring", reason: "fiscally_offline" });
  });

  it("defers when it is offline and no offline number is left", () => {
    expect(
      modeOf({
        online: { ...ONLINE, tokenValid: false },
        offlineSeries: { ...OFFLINE_SERIES, blocksInAssignmentOrder: [] },
      }),
    ).toEqual({ kind: "deferring", reason: "fiscally_offline" });
  });

  it("is the offline code with the lapse as its cause while a clock correction keeps the reading behind the tax authority's day", () => {
    expect(
      modeOf({
        series: {
          ...SERIES,
          taxAuthorityLastIssuedOn: "2026-10-03",
          clockCorrections: [
            {
              previousReading: new Date("2026-10-04T15:00:00.000Z"),
              correctedReading: new Date("2026-10-01T10:00:00.000Z"),
            },
          ],
        },
      }),
    ).toEqual({ kind: "offline_code", cause: "clock_correction_lapse" });
  });

  it("defers without a point of sale", () => {
    expect(modeOf({ series: { ...SERIES, pointOfSale: null } })).toEqual({
      kind: "deferring",
      reason: "point_of_sale_missing",
    });
  });

  it("judges a sale happening now: a clock behind the register's mark defers", () => {
    expect(modeOf({ series: { ...SERIES, clockMark: new Date(NOW.getTime() + 61_000) } })).toEqual({
      kind: "deferring",
      reason: "clock_behind",
    });
  });
});

describe("FISCAL_EMISSION_MODE_KINDS", () => {
  it("lists the kinds of mode in order", () => {
    expect([...FISCAL_EMISSION_MODE_KINDS]).toEqual(["real_time", "offline_code", "deferring"]);
  });
});

describe("FISCAL_AUTHORIZATIONS", () => {
  it("lists how an issued document was authorized", () => {
    expect([...FISCAL_AUTHORIZATIONS]).toEqual(["real_time", "offline_code"]);
  });
});
