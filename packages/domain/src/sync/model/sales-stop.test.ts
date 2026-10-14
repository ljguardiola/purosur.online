import { describe, expect, it } from "vitest";
import {
  isInstallationRevoked,
  isSalesStopReason,
  SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE,
  SALES_STOP_REASONS,
  salesDenialOf,
  salesDeniedReportOf,
} from "./sales-stop.js";

describe("SALES_STOP_REASONS", () => {
  it("lists why a register stops opening new sales: its event history broke or the cloud revoked its installation", () => {
    expect(SALES_STOP_REASONS).toEqual(["event_history_broken", "installation_revoked"]);
  });
});

describe("isSalesStopReason", () => {
  it("accepts every reason and refuses anything else", () => {
    for (const reason of SALES_STOP_REASONS) {
      expect(isSalesStopReason(reason)).toBe(true);
    }
    expect(isSalesStopReason("out_of_paper")).toBe(false);
    expect(isSalesStopReason(null)).toBe(false);
  });
});

describe("salesDeniedReportOf", () => {
  it("reports that a register still opening new sales can sell", () => {
    expect(salesDeniedReportOf({ stopped: false })).toEqual({ sales_denied: false });
  });

  it("reports that a register whose event history broke can't sell, and why", () => {
    expect(salesDeniedReportOf({ stopped: true, reason: "event_history_broken" })).toEqual({
      sales_denied: true,
      sales_denied_reason: "event_history_broken",
    });
  });

  it("reports nothing of a register stopped because the cloud revoked its installation", () => {
    expect(salesDeniedReportOf({ stopped: true, reason: "installation_revoked" })).toEqual({});
  });

  it("reports nothing of a register stopped for a reason it did not record", () => {
    expect(salesDeniedReportOf({ stopped: true, reason: undefined })).toEqual({});
  });
});

describe("salesDeniedReportOf with a storage stop", () => {
  it("reports a register stopped by its storage as unable to sell, and why", () => {
    expect(salesDeniedReportOf({ stopped: false }, { reason: "disk_full" })).toEqual({
      sales_denied: true,
      sales_denied_reason: "disk_full",
    });
  });

  it("reports nothing of a revoked installation, whatever the storage stop", () => {
    expect(
      salesDeniedReportOf(
        { stopped: true, reason: "installation_revoked" },
        { reason: "disk_full" },
      ),
    ).toEqual({});
  });
});

describe("salesDenialOf", () => {
  const SHORT_AT_STARTUP = {
    reason: "disk_space_short_at_startup",
    required_free_bytes: 5_000_000_000,
  } as const;

  it("denies nothing to a register still opening new sales with no storage stop", () => {
    expect(salesDenialOf({ stopped: false }, undefined)).toBeUndefined();
  });

  it("denies sales for the storage stop of a register with no persisted stop, with what it needs", () => {
    expect(salesDenialOf({ stopped: false }, SHORT_AT_STARTUP)).toEqual(SHORT_AT_STARTUP);
  });

  it("names a broken event history over a storage stop", () => {
    expect(
      salesDenialOf({ stopped: true, reason: "event_history_broken" }, SHORT_AT_STARTUP),
    ).toEqual({ reason: "event_history_broken" });
  });

  it("denies nothing it can name to a revoked installation, whatever the storage stop", () => {
    expect(
      salesDenialOf({ stopped: true, reason: "installation_revoked" }, SHORT_AT_STARTUP),
    ).toBeUndefined();
  });

  it("denies nothing it can name to a stop with no recorded reason, whatever the storage stop", () => {
    expect(salesDenialOf({ stopped: true, reason: undefined }, SHORT_AT_STARTUP)).toBeUndefined();
  });
});

describe("SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE", () => {
  it("reports that a register whose local database is damaged can't sell, and why", () => {
    expect(SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE).toEqual({
      sales_denied: true,
      sales_denied_reason: "local_database_damaged",
    });
  });
});

describe("isInstallationRevoked", () => {
  it("is true for a register stopped because the cloud revoked its installation", () => {
    expect(isInstallationRevoked({ stopped: true, reason: "installation_revoked" })).toBe(true);
  });

  it("is false for a register still opening new sales", () => {
    expect(isInstallationRevoked({ stopped: false })).toBe(false);
  });

  it("is false for a register stopped because its event history broke", () => {
    expect(isInstallationRevoked({ stopped: true, reason: "event_history_broken" })).toBe(false);
  });

  it("is false for a register stopped for a reason it did not record", () => {
    expect(isInstallationRevoked({ stopped: true, reason: undefined })).toBe(false);
  });
});
