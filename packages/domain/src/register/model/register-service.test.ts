import { describe, expect, it } from "vitest";
import { installationService, isOutOfService, isWatchedForQuietness } from "./register-service.js";

const EARLIER = new Date("2026-10-05T14:00:00.000Z");

describe("installationService", () => {
  it("puts an installation the cloud never revoked in service", () => {
    expect(installationService({ revokedAt: null })).toEqual({ kind: "in_service" });
  });

  it("puts an installation the cloud revoked out of service", () => {
    expect(installationService({ revokedAt: EARLIER })).toEqual({ kind: "out_of_service" });
  });
});

describe("isOutOfService", () => {
  it("tells an installation the cloud revoked is out of service", () => {
    expect(isOutOfService({ revokedAt: EARLIER })).toBe(true);
  });

  it("tells an installation the cloud never revoked is not out of service", () => {
    expect(isOutOfService({ revokedAt: null })).toBe(false);
  });
});

describe("isWatchedForQuietness", () => {
  it("watches an installation in service known to report on every sync cycle", () => {
    expect(isWatchedForQuietness({ revokedAt: null, reportsEveryCycleSince: EARLIER })).toBe(true);
  });

  it("does not watch an installation in service never known to report on every sync cycle", () => {
    expect(isWatchedForQuietness({ revokedAt: null, reportsEveryCycleSince: null })).toBe(false);
  });

  it("does not watch a revoked installation, even one that reported on every sync cycle", () => {
    expect(isWatchedForQuietness({ revokedAt: EARLIER, reportsEveryCycleSince: EARLIER })).toBe(
      false,
    );
  });
});
