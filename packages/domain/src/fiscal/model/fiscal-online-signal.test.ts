import { describe, expect, it } from "vitest";
import {
  isRegisterFiscallyOnline,
  REGISTER_HEALTH_CHECK_HORIZON_MS,
} from "./fiscal-online-signal.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const ONLINE = { lastHealthCheckOkAt: ago(1_000), tokenValid: true, arcaReachable: true };

describe("REGISTER_HEALTH_CHECK_HORIZON_MS", () => {
  it("counts a register's health check for 15 seconds", () => {
    expect(REGISTER_HEALTH_CHECK_HORIZON_MS).toBe(15_000);
  });
});

describe("isRegisterFiscallyOnline", () => {
  it("is true when the health check is recent, the token is valid and ARCA is reachable", () => {
    expect(isRegisterFiscallyOnline(ONLINE, NOW)).toBe(true);
  });

  it("is true when the health check is exactly 15 seconds old", () => {
    expect(
      isRegisterFiscallyOnline(
        { ...ONLINE, lastHealthCheckOkAt: ago(REGISTER_HEALTH_CHECK_HORIZON_MS) },
        NOW,
      ),
    ).toBe(true);
  });

  it("is false when the health check is older than 15 seconds", () => {
    expect(
      isRegisterFiscallyOnline(
        { ...ONLINE, lastHealthCheckOkAt: ago(REGISTER_HEALTH_CHECK_HORIZON_MS + 1) },
        NOW,
      ),
    ).toBe(false);
  });

  it("is false when the register never had a successful health check", () => {
    expect(isRegisterFiscallyOnline({ ...ONLINE, lastHealthCheckOkAt: null }, NOW)).toBe(false);
  });

  it("is false when the token is not valid", () => {
    expect(isRegisterFiscallyOnline({ ...ONLINE, tokenValid: false }, NOW)).toBe(false);
  });

  it("is false when ARCA is not reachable", () => {
    expect(isRegisterFiscallyOnline({ ...ONLINE, arcaReachable: false }, NOW)).toBe(false);
  });
});
