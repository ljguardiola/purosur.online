import { describe, expect, it } from "vitest";
import {
  ALERT_EMAIL_SEND_ATTEMPTS,
  alertEmailBranchName,
  isAlertEmailDue,
  isAlertEmailRecipient,
  nextAlertEmailAttemptAt,
  sendsAlertEmailAt,
} from "./alert-email.js";

const HERE = "location-here";
const ELSEWHERE = "location-elsewhere";

function candidate(
  overrides: {
    isAdministrator?: boolean;
    permissionKeys?: string[];
    alertEmailOptedIn?: boolean;
  } = {},
) {
  return {
    isAdministrator: overrides.isAdministrator ?? false,
    permissionKeys: overrides.permissionKeys ?? [],
    alertEmailOptedIn: overrides.alertEmailOptedIn ?? true,
    locationId: HERE,
  };
}

describe("sendsAlertEmailAt", () => {
  it("sends an alert that goes by email at every stage", () => {
    for (const stage of ["opened", "escalated", "resolved"] as const) {
      expect(sendsAlertEmailAt("sales_denied", stage)).toBe(true);
    }
  });

  it("sends the expiring ARCA certificate only when it escalates", () => {
    expect(sendsAlertEmailAt("arca_certificate_expiring", "opened")).toBe(false);
    expect(sendsAlertEmailAt("arca_certificate_expiring", "escalated")).toBe(true);
    expect(sendsAlertEmailAt("arca_certificate_expiring", "resolved")).toBe(false);
  });

  it("never sends an alert that stays on the board", () => {
    for (const stage of ["opened", "escalated", "resolved"] as const) {
      expect(sendsAlertEmailAt("lots_expiring", stage)).toBe(false);
    }
  });
});

describe("isAlertEmailRecipient", () => {
  const salesDeniedHere = { kind: "sales_denied", audience: "local", locationId: HERE } as const;
  const salesDeniedElsewhere = {
    kind: "sales_denied",
    audience: "local",
    locationId: ELSEWHERE,
  } as const;
  const rejectedDocument = {
    kind: "fiscal_rejected",
    audience: "all",
    locationId: null,
  } as const;
  const localButNotCritical = { kind: "clock_drift", audience: "local", locationId: HERE } as const;

  it("sends every alert to an administrator and to a holder of view_all_alerts who opted in", () => {
    for (const access of [
      candidate({ isAdministrator: true }),
      candidate({ permissionKeys: ["view_all_alerts"] }),
    ]) {
      for (const alert of [
        salesDeniedHere,
        salesDeniedElsewhere,
        rejectedDocument,
        localButNotCritical,
      ]) {
        expect(isAlertEmailRecipient(access, alert)).toBe(true);
      }
    }
  });

  it("sends nothing to someone who has not opted in, whatever they can see", () => {
    for (const access of [
      candidate({ isAdministrator: true, alertEmailOptedIn: false }),
      candidate({ permissionKeys: ["view_all_alerts"], alertEmailOptedIn: false }),
      candidate({ permissionKeys: ["view_branch_alerts"], alertEmailOptedIn: false }),
    ]) {
      expect(isAlertEmailRecipient(access, salesDeniedHere)).toBe(false);
    }
  });

  it("sends a holder of only view_branch_alerts the alerts that leave their branch's register unable to sell or to issue", () => {
    const access = candidate({ permissionKeys: ["view_branch_alerts"] });

    expect(isAlertEmailRecipient(access, salesDeniedHere)).toBe(true);
    expect(
      isAlertEmailRecipient(access, { ...salesDeniedHere, kind: "fiscal_emission_stopped" }),
    ).toBe(true);
  });

  it("sends a holder of only view_branch_alerts no alert of another branch", () => {
    expect(
      isAlertEmailRecipient(
        candidate({ permissionKeys: ["view_branch_alerts"] }),
        salesDeniedElsewhere,
      ),
    ).toBe(false);
  });

  it("sends a holder of only view_branch_alerts no other kind, even one they see on the board", () => {
    const access = candidate({ permissionKeys: ["view_branch_alerts"] });

    expect(isAlertEmailRecipient(access, localButNotCritical)).toBe(false);
    expect(isAlertEmailRecipient(access, rejectedDocument)).toBe(false);
  });

  it("sends nothing to someone who holds neither alert permission", () => {
    expect(
      isAlertEmailRecipient(candidate({ permissionKeys: ["sell_and_charge"] }), salesDeniedHere),
    ).toBe(false);
  });
});

describe("the retries of a failing send", () => {
  it("attempts a send at most 5 times", () => {
    expect(ALERT_EMAIL_SEND_ATTEMPTS).toBe(5);
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 4],
    [4, 8],
  ])(
    "waits %i failed attempts' backoff of %i minutes before the next one",
    (failedAttempts, minutes) => {
      const now = new Date("2026-10-01T12:00:00.000Z");

      expect(nextAlertEmailAttemptAt(failedAttempts, now)).toEqual(
        new Date(now.getTime() + minutes * 60 * 1000),
      );
    },
  );
});

describe("alertEmailBranchName", () => {
  it("names the alert's branch when it has one", () => {
    expect(alertEmailBranchName("Sucursal Centro", "Casa Central")).toBe("Sucursal Centro");
  });

  it("names the recipient's branch when the alert belongs to no branch", () => {
    expect(alertEmailBranchName(null, "Casa Central")).toBe("Casa Central");
  });
});

describe("isAlertEmailDue", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("is due when no attempt has been scheduled yet", () => {
    expect(isAlertEmailDue({ nextAttemptAt: null }, now)).toBe(true);
  });

  it("is due once its next attempt has come, including the very moment", () => {
    expect(isAlertEmailDue({ nextAttemptAt: new Date(now.getTime() - 1) }, now)).toBe(true);
    expect(isAlertEmailDue({ nextAttemptAt: new Date(now) }, now)).toBe(true);
  });

  it("is not due before its next attempt", () => {
    expect(isAlertEmailDue({ nextAttemptAt: new Date(now.getTime() + 1) }, now)).toBe(false);
  });
});
