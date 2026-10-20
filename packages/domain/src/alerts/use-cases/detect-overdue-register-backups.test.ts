import { describe, expect, it } from "vitest";
import {
  REGISTER_BACKUP_OVERDUE_AFTER_MS,
  type RegisterBackupStanding,
} from "../../backups/index.js";
import { detectOverdueRegisterBackups } from "./detect-overdue-register-backups.js";
import { seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock, PrefixHasher } from "./test-support/fake-alert-store.js";
import { FakeRegisterBackupStandingReader } from "./test-support/fake-register-backup-standing-reader.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const MINUTE_MS = 60 * 1000;

function before(instant: Date, ms: number): Date {
  return new Date(instant.getTime() - ms);
}

function standing(overrides: Partial<RegisterBackupStanding> = {}): RegisterBackupStanding {
  return {
    registerId: "register-1",
    lastVerifiedGenerationAt: before(NOW, 5 * 60 * MINUTE_MS),
    firstChangeSinceLastVerifiedAt: before(NOW, REGISTER_BACKUP_OVERDUE_AFTER_MS + MINUTE_MS),
    ...overrides,
  };
}

function storeWithViewers(): FakeAlertStore {
  const store = new FakeAlertStore();
  store.seedViewer({
    userId: "administrator",
    locationId: "location-elsewhere",
    permissionKeys: [],
    isAdministrator: true,
    active: true,
  });
  return store;
}

function detect(store: FakeAlertStore, standings: RegisterBackupStanding[], at = NOW) {
  const reader = new FakeRegisterBackupStandingReader(standings);
  const outcome = detectOverdueRegisterBackups({
    standings: reader,
    store,
    clock: new FixedClock(at),
    hasher: new PrefixHasher(),
  });
  return { outcome };
}

describe("detectOverdueRegisterBackups", () => {
  it("opens a critical alert for everyone who sees every alert when the first change since the last verified generation is more than an hour old", async () => {
    const store = storeWithViewers();
    const current = standing();

    const { outcome } = detect(store, [current]);

    await expect(outcome).resolves.toBe(1);
    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({
        kind: "register_backup_overdue",
        scope: "register-1",
        level: "critical",
        audience: "all",
        locationId: null,
        openedAt: NOW,
        detail: {
          lastVerifiedGenerationAt: current.lastVerifiedGenerationAt?.toISOString(),
          firstChangeAt: current.firstChangeSinceLastVerifiedAt?.toISOString(),
        },
      }),
    ]);
    expect(store.snapshot().deliveries).toEqual([
      { alertId: "alert-1", recipientUserId: "administrator" },
    ]);
  });

  it("opens the alert of a register that never had a verified generation, naming none", async () => {
    const store = storeWithViewers();

    await detect(store, [standing({ lastVerifiedGenerationAt: null })]).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({ lastVerifiedGenerationAt: null }),
      }),
    ]);
  });

  it("opens nothing when the first change is exactly an hour old", async () => {
    const store = storeWithViewers();

    const { outcome } = detect(store, [
      standing({ firstChangeSinceLastVerifiedAt: before(NOW, REGISTER_BACKUP_OVERDUE_AFTER_MS) }),
    ]);

    await expect(outcome).resolves.toBe(0);
    expect(store.snapshot().alerts).toEqual([]);
  });

  it("opens nothing when the first change is less than an hour old", async () => {
    const store = storeWithViewers();

    await detect(store, [standing({ firstChangeSinceLastVerifiedAt: before(NOW, 10 * MINUTE_MS) })])
      .outcome;

    expect(store.snapshot().alerts).toEqual([]);
  });

  it("opens nothing for a register that recorded no changes since its last verified generation", async () => {
    const store = storeWithViewers();

    await detect(store, [standing({ firstChangeSinceLastVerifiedAt: null })]).outcome;
    await detect(store, [
      standing({ lastVerifiedGenerationAt: null, firstChangeSinceLastVerifiedAt: null }),
    ]).outcome;

    expect(store.snapshot().alerts).toEqual([]);
  });

  it("raises one alert per overdue register and leaves the others alone", async () => {
    const store = storeWithViewers();

    const { outcome } = detect(store, [
      standing({ registerId: "register-1" }),
      standing({ registerId: "register-2", firstChangeSinceLastVerifiedAt: null }),
      standing({ registerId: "register-3" }),
    ]);

    await expect(outcome).resolves.toBe(2);
    expect(store.snapshot().alerts.map(({ scope }) => scope)).toEqual(["register-1", "register-3"]);
  });

  it("keeps the one alert open, opening no second, while the register stays overdue", async () => {
    const store = storeWithViewers();

    await detect(store, [standing()]).outcome;
    await detect(store, [standing()], new Date(NOW.getTime() + MINUTE_MS)).outcome;

    expect(store.snapshot().alerts).toHaveLength(1);
  });

  it("starts clearing an open alert once a newer verified generation leaves no change older than an hour", async () => {
    const store = storeWithViewers();
    await detect(store, [standing()]).outcome;
    const later = new Date(NOW.getTime() + 10 * MINUTE_MS);

    await detect(
      store,
      [standing({ lastVerifiedGenerationAt: later, firstChangeSinceLastVerifiedAt: null })],
      later,
    ).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ resolvedAt: null, conditionClearedAt: later }),
    ]);
  });

  it("keeps the alert open with the new last verified time when changes after a newer generation are already more than an hour old", async () => {
    const store = storeWithViewers();
    await detect(store, [standing()]).outcome;
    const newerGeneration = before(NOW, 90 * MINUTE_MS);
    const firstChange = before(NOW, 80 * MINUTE_MS);

    await detect(store, [
      standing({
        lastVerifiedGenerationAt: newerGeneration,
        firstChangeSinceLastVerifiedAt: firstChange,
      }),
    ]).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({
        resolvedAt: null,
        conditionClearedAt: null,
        detail: {
          lastVerifiedGenerationAt: newerGeneration.toISOString(),
          firstChangeAt: firstChange.toISOString(),
        },
      }),
    ]);
  });

  it("takes back the clearing of an open alert when the register is overdue again", async () => {
    const store = storeWithViewers();
    store.seedAlert(
      seededAlert({
        kind: "register_backup_overdue",
        scope: "register-1",
        level: "critical",
        audience: "all",
        locationId: null,
        escalateAt: null,
        conditionClearedAt: before(NOW, 5 * MINUTE_MS),
      }),
    );

    await detect(store, [standing()]).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ resolvedAt: null, conditionClearedAt: null }),
    ]);
  });
});
