import { describe, expect, it } from "vitest";
import {
  REGISTER_BACKUP_OVERDUE_AFTER_MS,
  type RegisterBackupStanding,
} from "../model/register-backup-overdue.js";
import { detectOverdueRegisterBackups } from "./detect-overdue-register-backups.js";
import {
  FakeRegisterBackupOverdueAlerts,
  FakeRegisterBackupStandingReader,
} from "./test-support/fake-overdue-register-backups.js";

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

async function detect(standings: RegisterBackupStanding[]) {
  const alerts = new FakeRegisterBackupOverdueAlerts();
  const overdueCount = await detectOverdueRegisterBackups({
    standings: new FakeRegisterBackupStandingReader(standings),
    alerts,
    clock: { now: () => NOW },
  });
  return { alerts, overdueCount };
}

function backedUp(registerId: string) {
  return { holds: false, kind: "register_backup_overdue", scope: registerId };
}

describe("detectOverdueRegisterBackups", () => {
  it("keeps the register's alert open when the first change since the last verified generation is more than an hour old", async () => {
    const current = standing();

    const { alerts, overdueCount } = await detect([current]);

    expect(overdueCount).toBe(1);
    expect(alerts.observations).toEqual([
      {
        holds: true,
        alert: {
          kind: "register_backup_overdue",
          scope: "register-1",
          detail: {
            lastVerifiedGenerationAt: current.lastVerifiedGenerationAt?.toISOString(),
            firstChangeAt: current.firstChangeSinceLastVerifiedAt?.toISOString(),
          },
        },
      },
    ]);
  });

  it("keeps the alert of a register that never had a verified generation open, naming none", async () => {
    const { alerts } = await detect([standing({ lastVerifiedGenerationAt: null })]);

    expect(alerts.observations).toEqual([
      expect.objectContaining({
        holds: true,
        alert: expect.objectContaining({
          detail: expect.objectContaining({ lastVerifiedGenerationAt: null }),
        }),
      }),
    ]);
  });

  it("clears the alert of a register whose changes since the last verified generation are not overdue yet", async () => {
    const { alerts, overdueCount } = await detect([
      standing({ firstChangeSinceLastVerifiedAt: before(NOW, 10 * MINUTE_MS) }),
    ]);

    expect(overdueCount).toBe(0);
    expect(alerts.observations).toEqual([backedUp("register-1")]);
  });

  it("clears the alert of a register that recorded no changes since its last verified generation", async () => {
    const { alerts, overdueCount } = await detect([
      standing({ registerId: "register-1", firstChangeSinceLastVerifiedAt: null }),
      standing({
        registerId: "register-2",
        lastVerifiedGenerationAt: null,
        firstChangeSinceLastVerifiedAt: null,
      }),
    ]);

    expect(overdueCount).toBe(0);
    expect(alerts.observations).toEqual([backedUp("register-1"), backedUp("register-2")]);
  });

  it("keeps one alert open per overdue register and clears the others", async () => {
    const { alerts, overdueCount } = await detect([
      standing({ registerId: "register-1" }),
      standing({ registerId: "register-2", firstChangeSinceLastVerifiedAt: null }),
      standing({ registerId: "register-3" }),
    ]);

    expect(overdueCount).toBe(2);
    expect(alerts.observations).toEqual([
      expect.objectContaining({
        holds: true,
        alert: expect.objectContaining({ scope: "register-1" }),
      }),
      backedUp("register-2"),
      expect.objectContaining({
        holds: true,
        alert: expect.objectContaining({ scope: "register-3" }),
      }),
    ]);
  });

  it("clears the alert once a newer verified generation leaves no change after it", async () => {
    const { alerts } = await detect([
      standing({ lastVerifiedGenerationAt: NOW, firstChangeSinceLastVerifiedAt: null }),
    ]);

    expect(alerts.observations).toEqual([backedUp("register-1")]);
  });

  it("keeps the alert open with the new last verified time when changes after a newer generation are already more than an hour old", async () => {
    const newerGeneration = before(NOW, 90 * MINUTE_MS);
    const firstChange = before(NOW, 80 * MINUTE_MS);

    const { alerts } = await detect([
      standing({
        lastVerifiedGenerationAt: newerGeneration,
        firstChangeSinceLastVerifiedAt: firstChange,
      }),
    ]);

    expect(alerts.observations).toEqual([
      {
        holds: true,
        alert: {
          kind: "register_backup_overdue",
          scope: "register-1",
          detail: {
            lastVerifiedGenerationAt: newerGeneration.toISOString(),
            firstChangeAt: firstChange.toISOString(),
          },
        },
      },
    ]);
  });
});
