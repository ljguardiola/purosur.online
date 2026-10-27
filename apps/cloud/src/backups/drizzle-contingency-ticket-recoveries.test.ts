import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  contingencyTicketRecoveries,
  registerInstallations,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleContingencyTicketRecoveries } from "./drizzle-contingency-ticket-recoveries.js";
import { rescueSession } from "./test-support/contingency-backup-ticket-rescue-route.js";
import { insertContingencyTicketRecovery } from "./test-support/contingency-ticket-recoveries.js";

const OPENED_AT = new Date("2026-10-20T12:00:00.000Z");
const FINISHED_AT = new Date("2026-10-20T15:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function aRestoredInstallation(registerName = "Caja 1") {
  const predecessor = await insertEnrolledInstallation(db, {
    now: OPENED_AT,
    registerName,
    revokedAt: OPENED_AT,
  });
  const current = await insertEnrolledInstallation(db, {
    now: OPENED_AT,
    existingRegisterId: predecessor.registerId,
  });
  return { registerId: predecessor.registerId, restoredDeviceId: current.deviceId };
}

describe("DrizzleContingencyTicketRecoveries", () => {
  it("opens a recovery for the restored installation, awaiting", async () => {
    const restored = await aRestoredInstallation();
    const recoveries = new DrizzleContingencyTicketRecoveries(db);

    const standing = await recoveries.transaction((tx) =>
      tx.openRecovery({ ...restored, at: OPENED_AT }),
    );

    expect(standing).toEqual({ kind: "awaiting" });
    expect(await db.select().from(contingencyTicketRecoveries)).toMatchObject([
      { ...restored, openedAt: OPENED_AT, finishedAt: null, finishedBy: null },
    ]);
  });

  it("opens one recovery however many times it is asked to", async () => {
    const restored = await aRestoredInstallation();
    const recoveries = new DrizzleContingencyTicketRecoveries(db);
    await recoveries.transaction((tx) => tx.openRecovery({ ...restored, at: OPENED_AT }));

    const standing = await recoveries.transaction((tx) =>
      tx.openRecovery({ ...restored, at: FINISHED_AT }),
    );

    expect(standing).toEqual({ kind: "awaiting" });
    expect(await db.select().from(contingencyTicketRecoveries)).toMatchObject([
      { openedAt: OPENED_AT },
    ]);
  });

  it("answers finished for a recovery that was finished", async () => {
    const restored = await aRestoredInstallation();
    const { userId } = await rescueSession(db);
    await insertContingencyTicketRecovery(db, {
      ...restored,
      openedAt: OPENED_AT,
      finishedAt: FINISHED_AT,
      finishedBy: userId,
    });

    const standing = await new DrizzleContingencyTicketRecoveries(db).transaction((tx) =>
      tx.openRecovery({ ...restored, at: FINISHED_AT }),
    );

    expect(standing).toEqual({ kind: "finished" });
  });

  it("locks a recovery, telling its register and whether it is finished", async () => {
    const restored = await aRestoredInstallation();
    const recoveryId = await insertContingencyTicketRecovery(db, {
      ...restored,
      openedAt: OPENED_AT,
    });

    const locked = await new DrizzleContingencyTicketRecoveries(db).transaction((tx) =>
      tx.lockRecovery(recoveryId),
    );

    expect(locked).toEqual({ registerId: restored.registerId, finished: false });
  });

  it("finds no recovery that does not exist", async () => {
    const locked = await new DrizzleContingencyTicketRecoveries(db).transaction((tx) =>
      tx.lockRecovery(crypto.randomUUID()),
    );

    expect(locked).toBeUndefined();
  });

  it("records who finished a recovery and when, in the audit log", async () => {
    const restored = await aRestoredInstallation();
    const { userId } = await rescueSession(db);
    const recoveryId = await insertContingencyTicketRecovery(db, {
      ...restored,
      openedAt: OPENED_AT,
    });

    await new DrizzleContingencyTicketRecoveries(db).transaction((tx) =>
      tx.recordFinished({
        recoveryId,
        registerId: restored.registerId,
        finishedBy: userId,
        at: FINISHED_AT,
      }),
    );

    expect(await db.select().from(contingencyTicketRecoveries)).toMatchObject([
      { finishedAt: FINISHED_AT, finishedBy: userId },
    ]);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entity, "contingency_ticket_recovery_finished")),
    ).toMatchObject([
      {
        entityId: recoveryId,
        actorId: userId,
        at: FINISHED_AT,
        previousValue: null,
        newValue: { register_id: restored.registerId },
      },
    ]);
  });

  it("lists the recoveries that await, oldest first, with their register's name", async () => {
    const first = await aRestoredInstallation("Caja 1");
    const second = await aRestoredInstallation("Caja 2");
    const third = await aRestoredInstallation("Caja 3");
    const { userId } = await rescueSession(db);
    const laterId = await insertContingencyTicketRecovery(db, {
      ...second,
      openedAt: FINISHED_AT,
    });
    const earlierId = await insertContingencyTicketRecovery(db, {
      ...first,
      openedAt: OPENED_AT,
    });
    await insertContingencyTicketRecovery(db, {
      ...third,
      openedAt: OPENED_AT,
      finishedAt: FINISHED_AT,
      finishedBy: userId,
    });

    const awaiting = await new DrizzleContingencyTicketRecoveries(db).awaiting();

    expect(awaiting).toEqual([
      {
        recoveryId: earlierId,
        registerId: first.registerId,
        registerName: "Caja 1",
        openedAt: OPENED_AT,
      },
      {
        recoveryId: laterId,
        registerId: second.registerId,
        registerName: "Caja 2",
        openedAt: FINISHED_AT,
      },
    ]);
  });

  it("lists only the recovery of the installation the register still runs on", async () => {
    const restoredFirst = await aRestoredInstallation("Caja 1");
    const recoveries = new DrizzleContingencyTicketRecoveries(db);
    await recoveries.transaction((tx) => tx.openRecovery({ ...restoredFirst, at: OPENED_AT }));
    await db
      .update(registerInstallations)
      .set({ revokedAt: FINISHED_AT })
      .where(eq(registerInstallations.id, restoredFirst.restoredDeviceId));
    const restoredAgain = await insertEnrolledInstallation(db, {
      now: FINISHED_AT,
      existingRegisterId: restoredFirst.registerId,
    });
    await recoveries.transaction((tx) =>
      tx.openRecovery({
        registerId: restoredFirst.registerId,
        restoredDeviceId: restoredAgain.deviceId,
        at: FINISHED_AT,
      }),
    );

    const awaiting = await recoveries.awaiting();

    expect(awaiting).toEqual([
      expect.objectContaining({ registerName: "Caja 1", openedAt: FINISHED_AT }),
    ]);
  });
});
