import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, compromiseResponseCompletions, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleCompromiseResponseStore } from "./drizzle-compromise-response-store.js";

const STARTED_AT = new Date("2026-10-01T09:00:00.000Z");
const LATER = new Date("2026-10-01T09:30:00.000Z");
const EVEN_LATER = new Date("2026-10-01T09:45:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let adminId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const [admin] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: "ada@example.test",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  adminId = admin?.id as string;
});

function store() {
  return new DrizzleCompromiseResponseStore(db, {
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => STARTED_AT,
  });
}

describe("DrizzleCompromiseResponseStore", () => {
  it("finds no response before one is started", async () => {
    expect(await store().findLatestResponse()).toBeNull();
    expect(await store().transaction((tx) => tx.lockLatestResponse())).toBeNull();
  });

  it("starts a response with nothing done and audits the start with the actor", async () => {
    const started = await store().transaction((tx) => tx.startResponse(adminId, STARTED_AT));

    expect(started).toEqual({
      id: expect.any(String),
      startedAt: STARTED_AT,
      startedBy: adminId,
      completions: [],
    });
    expect(
      await db.select().from(auditLog).where(eq(auditLog.entity, "compromise_response")),
    ).toEqual([
      {
        id: expect.any(String),
        entity: "compromise_response",
        entityId: started.id,
        actorId: adminId,
        at: STARTED_AT,
        previousValue: null,
        newValue: { started_at: STARTED_AT.toISOString() },
      },
    ]);
  });

  it("answers the latest started response, whether read or locked", async () => {
    await store().transaction((tx) => tx.startResponse(adminId, STARTED_AT));
    const second = await store().transaction((tx) => tx.startResponse(adminId, LATER));

    expect((await store().findLatestResponse())?.id).toBe(second.id);
    expect((await store().transaction((tx) => tx.lockLatestResponse()))?.id).toBe(second.id);
  });

  it("records a step done with who and when, and audits it", async () => {
    const started = await store().transaction((tx) => tx.startResponse(adminId, STARTED_AT));

    await store().transaction((tx) =>
      tx.recordStepDone(started.id, "revoke_every_installation", adminId, LATER),
    );

    expect((await store().findLatestResponse())?.completions).toEqual([
      { key: "revoke_every_installation", at: LATER },
    ]);
    expect(
      await db
        .select({ doneBy: compromiseResponseCompletions.doneBy })
        .from(compromiseResponseCompletions),
    ).toEqual([{ doneBy: adminId }]);
    expect(
      (await db.select().from(auditLog).where(eq(auditLog.entityId, started.id))).filter(
        (audit) => audit.at.getTime() === LATER.getTime(),
      ),
    ).toEqual([
      expect.objectContaining({
        entity: "compromise_response",
        actorId: adminId,
        newValue: { step: "revoke_every_installation", done_at: LATER.toISOString() },
      }),
    ]);
  });

  it("records an item done with who and when, and audits it", async () => {
    const started = await store().transaction((tx) => tx.startResponse(adminId, STARTED_AT));

    await store().transaction((tx) =>
      tx.recordItemDone(started.id, "claude_api_key", adminId, LATER),
    );

    expect((await store().findLatestResponse())?.completions).toEqual([
      { key: "claude_api_key", at: LATER },
    ]);
    expect(
      (await db.select().from(auditLog).where(eq(auditLog.entityId, started.id))).filter(
        (audit) => audit.at.getTime() === LATER.getTime(),
      ),
    ).toEqual([
      expect.objectContaining({
        entity: "compromise_response",
        actorId: adminId,
        newValue: { item: "claude_api_key", done_at: LATER.toISOString() },
      }),
    ]);
  });

  it("lists the completions in the order they were done", async () => {
    const started = await store().transaction((tx) => tx.startResponse(adminId, STARTED_AT));
    await store().transaction((tx) => tx.recordItemDone(started.id, "notify", adminId, EVEN_LATER));
    await store().transaction((tx) =>
      tx.recordStepDone(started.id, "force_pin_resets", adminId, LATER),
    );

    expect((await store().findLatestResponse())?.completions.map(({ key }) => key)).toEqual([
      "force_pin_resets",
      "notify",
    ]);
  });

  it("leaves nothing behind when the audit of a completion fails", async () => {
    const started = await store().transaction((tx) => tx.startResponse(adminId, STARTED_AT));

    await expect(
      store().transaction(async (tx) => {
        await tx.recordItemDone(started.id, "claude_api_key", adminId, LATER);
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");

    expect((await store().findLatestResponse())?.completions).toEqual([]);
  });

  it("refuses to record the same step twice in a response", async () => {
    const started = await store().transaction((tx) => tx.startResponse(adminId, STARTED_AT));
    await store().transaction((tx) =>
      tx.recordStepDone(started.id, "force_pin_resets", adminId, LATER),
    );

    await expect(
      store().transaction((tx) =>
        tx.recordStepDone(started.id, "force_pin_resets", adminId, EVEN_LATER),
      ),
    ).rejects.toThrow();
  });
});
