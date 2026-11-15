import { describe, expect, it } from "vitest";
import { findOwnAlertEmailOptIn } from "./find-own-alert-email-opt-in.js";
import { FakeAlertEmailOptInReads } from "./test-support/fake-alert-email-opt-in-reads.js";

const BRANCH = "branch-1";
const OPTED_IN_AT = new Date("2026-09-01T10:00:00.000Z");

function readsWith() {
  const reads = new FakeAlertEmailOptInReads();
  reads.seedUser({ id: "u-1", locationId: BRANCH, active: true, alertEmailOptedInAt: OPTED_IN_AT });
  reads.seedUser({ id: "u-2", locationId: BRANCH, active: true, alertEmailOptedInAt: null });
  reads.seedUser({
    id: "u-3",
    locationId: "branch-2",
    active: true,
    alertEmailOptedInAt: OPTED_IN_AT,
  });
  reads.seedUser({
    id: "u-4",
    locationId: BRANCH,
    active: false,
    alertEmailOptedInAt: OPTED_IN_AT,
  });
  return reads;
}

describe("findOwnAlertEmailOptIn", () => {
  it("answers since when the user receives alerts by email", async () => {
    expect(
      await findOwnAlertEmailOptIn({ reads: readsWith() }, { userId: "u-1", locationId: BRANCH }),
    ).toEqual({ optedInAt: OPTED_IN_AT });
  });

  it("answers no moment for a user who has not opted in", async () => {
    expect(
      await findOwnAlertEmailOptIn({ reads: readsWith() }, { userId: "u-2", locationId: BRANCH }),
    ).toEqual({ optedInAt: null });
  });

  it.each(["u-3", "u-4", "nobody"])("finds nothing for %s", async (userId) => {
    expect(
      await findOwnAlertEmailOptIn({ reads: readsWith() }, { userId, locationId: BRANCH }),
    ).toBeUndefined();
  });
});
