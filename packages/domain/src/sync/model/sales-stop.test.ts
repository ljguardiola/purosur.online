import { describe, expect, it } from "vitest";
import { isSalesStopReason, SALES_STOP_REASONS, salesDeniedReportOf } from "./sales-stop.js";

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
