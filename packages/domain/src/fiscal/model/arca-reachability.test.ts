import { describe, expect, it } from "vitest";
import {
  ARCA_REACHABILITY_HORIZON_MS,
  ARCA_VITALITY_CHECK_INTERVAL_MS,
  isArcaReachable,
  isArcaVitalityAnswerOk,
} from "./arca-reachability.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("ARCA reachability policy", () => {
  it("checks ARCA's vitality every 30 seconds", () => {
    expect(ARCA_VITALITY_CHECK_INTERVAL_MS).toBe(30_000);
  });

  it("counts ARCA as reachable for 90 seconds after the latest evidence", () => {
    expect(ARCA_REACHABILITY_HORIZON_MS).toBe(90_000);
  });
});

describe("isArcaVitalityAnswerOk", () => {
  it("is true when the application, database and authentication servers report OK", () => {
    expect(
      isArcaVitalityAnswerOk({ appServer: "OK", dbServer: "OK", authServer: "OK" }),
    ).toBe(true);
  });

  it.each([
    { appServer: "NOT OK", dbServer: "OK", authServer: "OK" },
    { appServer: "OK", dbServer: "NOT OK", authServer: "OK" },
    { appServer: "OK", dbServer: "OK", authServer: "NOT OK" },
    { appServer: "OK", dbServer: "OK", authServer: "ok" },
    { appServer: "OK", dbServer: "OK", authServer: "" },
  ])("is false when any server does not report exactly OK: %o", (answer) => {
    expect(isArcaVitalityAnswerOk(answer)).toBe(false);
  });
});

describe("isArcaReachable", () => {
  it("is false with no evidence at all", () => {
    expect(isArcaReachable({ lastVitalityCheckOkAt: null, lastWsfeCallOkAt: null }, NOW)).toBe(
      false,
    );
  });

  it("is true when the last vitality check is exactly 90 seconds old", () => {
    expect(
      isArcaReachable(
        { lastVitalityCheckOkAt: ago(ARCA_REACHABILITY_HORIZON_MS), lastWsfeCallOkAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("is false when the only evidence is older than 90 seconds", () => {
    expect(
      isArcaReachable(
        { lastVitalityCheckOkAt: ago(ARCA_REACHABILITY_HORIZON_MS + 1), lastWsfeCallOkAt: null },
        NOW,
      ),
    ).toBe(false);
    expect(
      isArcaReachable(
        { lastVitalityCheckOkAt: null, lastWsfeCallOkAt: ago(ARCA_REACHABILITY_HORIZON_MS + 1) },
        NOW,
      ),
    ).toBe(false);
  });

  it("is true when only the last WSFE call is recent", () => {
    expect(
      isArcaReachable({ lastVitalityCheckOkAt: null, lastWsfeCallOkAt: ago(10_000) }, NOW),
    ).toBe(true);
  });

  it("is true when the vitality check is stale but the WSFE call is recent", () => {
    expect(
      isArcaReachable(
        { lastVitalityCheckOkAt: ago(10 * 60_000), lastWsfeCallOkAt: ago(5_000) },
        NOW,
      ),
    ).toBe(true);
  });

  it("is true when the WSFE call is stale but the vitality check is recent", () => {
    expect(
      isArcaReachable(
        { lastVitalityCheckOkAt: ago(5_000), lastWsfeCallOkAt: ago(10 * 60_000) },
        NOW,
      ),
    ).toBe(true);
  });
});
