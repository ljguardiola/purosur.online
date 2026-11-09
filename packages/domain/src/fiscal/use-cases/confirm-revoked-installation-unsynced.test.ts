import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import type { InstallationStreamReach } from "../model/event-stream-reach.js";
import { confirmRevokedInstallationUnsynced } from "./confirm-revoked-installation-unsynced.js";
import {
  DEFAULT_LOCATION_ID,
  FakeConfirmRevokedInstallationStore,
} from "./test-support/fake-confirm-revoked-installation.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const FORTNIGHT = { start: "2026-09-16", end: "2026-09-30" };
const KEY = { pointOfSaleNumber: 7, fortnight: FORTNIGHT };
const ACTOR = "user-1";
const NOW = new Date("2026-10-20T15:00:00.000Z");
const REVOKED_AT = new Date("2026-09-20T12:00:00.000Z");
const INSTALLATION_ID = "installation-revoked";
const REGISTER_ID = "register-1";

function revoked(overrides: Partial<InstallationStreamReach> = {}): InstallationStreamReach {
  return {
    installationId: INSTALLATION_ID,
    enrolledAt: new Date("2026-08-01T12:00:00.000Z"),
    revokedAt: REVOKED_AT,
    latestOccurredAt: new Date("2026-09-19T12:00:00.000Z"),
    caughtUpAt: null,
    holdsUnappliedEvents: false,
    ...overrides,
  };
}

function setUp(installation: InstallationStreamReach | null = revoked()) {
  const store = new FakeConfirmRevokedInstallationStore();
  if (installation !== null) {
    store.seedInstallation(KEY, REGISTER_ID, installation);
  }
  return store;
}

function confirm(
  store: FakeConfirmRevokedInstallationStore,
  overrides: Partial<Parameters<typeof confirmRevokedInstallationUnsynced>[1]> = {},
) {
  return confirmRevokedInstallationUnsynced(
    {
      store,
      clock: new FixedClock(NOW),
      zoneRules: { zoneRules: () => FIXED_ARGENTINA_ZONE_RULES },
    },
    {
      locationId: DEFAULT_LOCATION_ID,
      pointOfSaleNumber: 7,
      fortnightStart: FORTNIGHT.start,
      installationId: INSTALLATION_ID,
      actorId: ACTOR,
      ...overrides,
    },
  );
}

describe("confirmRevokedInstallationUnsynced", () => {
  it("records the confirmation and its audit for a revoked installation that never reached past the close", async () => {
    const store = setUp();

    await expect(confirm(store)).resolves.toEqual({ kind: "confirmed" });

    expect(store.snapshot()).toEqual({
      confirmations: [
        {
          pointOfSaleNumber: 7,
          fortnight: FORTNIGHT,
          installationId: INSTALLATION_ID,
          confirmedBy: ACTOR,
          confirmedAt: NOW,
        },
      ],
      audits: [
        {
          pointOfSaleNumber: 7,
          fortnight: FORTNIGHT,
          installationId: INSTALLATION_ID,
          registerId: REGISTER_ID,
          revokedAt: REVOKED_AT,
          actorId: ACTOR,
          at: NOW,
        },
      ],
    });
  });

  it("takes the fortnight's presentation lock first and the audit is recorded after the confirmation", async () => {
    const store = setUp();

    await confirm(store);

    expect(store.heldPresentations).toEqual([KEY]);
    expect(store.operationOrder[0]).toBe("holdFortnightPresentation");
    expect(store.operationOrder.slice(-2)).toEqual([
      "recordConfirmation",
      "recordConfirmationAudit",
    ]);
  });

  it("confirms an installation revoked after the fortnight closed", async () => {
    const store = setUp(revoked({ revokedAt: new Date("2026-10-05T12:00:00.000Z") }));

    await expect(confirm(store)).resolves.toEqual({ kind: "confirmed" });
  });

  it("answers not found, recording nothing, for an installation it does not know in that fortnight", async () => {
    const store = setUp(null);

    await expect(confirm(store)).resolves.toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual({ confirmations: [], audits: [] });
  });

  it("answers not found for an installation of another branch's register", async () => {
    const store = setUp();

    await expect(confirm(store, { locationId: "location-2" })).resolves.toEqual({
      kind: "not_found",
    });
    expect(store.snapshot()).toEqual({ confirmations: [], audits: [] });
  });

  it("answers already confirmed, recording nothing more, when the installation has a confirmation", async () => {
    const store = setUp();
    store.seedConfirmation(KEY, INSTALLATION_ID);

    await expect(confirm(store)).resolves.toEqual({ kind: "already_confirmed" });
    expect(store.snapshot().confirmations).toHaveLength(1);
    expect(store.snapshot().audits).toEqual([]);
  });

  it("is not blocked by another installation's confirmation", async () => {
    const store = setUp();
    store.seedConfirmation(KEY, "installation-other");

    await expect(confirm(store)).resolves.toEqual({ kind: "confirmed" });
  });

  it("answers already presented when the fortnight's report is accepted", async () => {
    const store = setUp();
    store.seedReportState(KEY, "accepted");

    await expect(confirm(store)).resolves.toEqual({ kind: "already_presented" });
    expect(store.snapshot()).toEqual({ confirmations: [], audits: [] });
  });

  it.each(["blocked", "refused", "submitting"] as const)(
    "still confirms while the report is %s",
    async (state) => {
      const store = setUp();
      store.seedReportState(KEY, state);

      await expect(confirm(store)).resolves.toEqual({ kind: "confirmed" });
    },
  );

  it("answers not revoked for an installation still enrolled", async () => {
    const store = setUp(revoked({ revokedAt: null }));

    await expect(confirm(store)).resolves.toEqual({ kind: "not_revoked" });
    expect(store.snapshot()).toEqual({ confirmations: [], audits: [] });
  });

  it("answers not holding back when the revoked installation reached past the close", async () => {
    const store = setUp(revoked({ latestOccurredAt: new Date("2026-10-02T12:00:00.000Z") }));

    await expect(confirm(store)).resolves.toEqual({ kind: "not_holding_back" });
    expect(store.snapshot()).toEqual({ confirmations: [], audits: [] });
  });

  it("answers not holding back when the installation was revoked before the fortnight began", async () => {
    const store = setUp(revoked({ revokedAt: new Date("2026-09-10T12:00:00.000Z") }));

    await expect(confirm(store)).resolves.toEqual({ kind: "not_holding_back" });
  });

  it("answers holds unapplied events, recording nothing, for a revoked installation whose events are not all applied", async () => {
    const store = setUp(revoked({ holdsUnappliedEvents: true }));

    await expect(confirm(store)).resolves.toEqual({ kind: "holds_unapplied_events" });
    expect(store.snapshot()).toEqual({ confirmations: [], audits: [] });
  });

  it("answers not holding back for an installation revoked before the fortnight began that holds events not yet applied", async () => {
    const store = setUp(
      revoked({ revokedAt: new Date("2026-09-10T12:00:00.000Z"), holdsUnappliedEvents: true }),
    );

    await expect(confirm(store)).resolves.toEqual({ kind: "not_holding_back" });
  });

  it("rolls back the confirmation when its audit cannot be recorded", async () => {
    const store = setUp();
    store.failingWrites.add("recordConfirmationAudit");

    await expect(confirm(store)).rejects.toThrow("recordConfirmationAudit failed");
    expect(store.snapshot()).toEqual({ confirmations: [], audits: [] });
  });
});
