import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { EventApplication, SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { DrizzleEventApplication } from "../drizzle-event-application.js";
import { aCashSessionOpenedFact } from "./synced-facts.js";

export const APPLICATION_NOW = new Date("2026-10-06T15:00:00.000Z");

export const RECORDING_CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";

export interface EventApplicationUnderTest {
  readonly db: TestDatabase["db"];
  readonly application: EventApplication;
  readonly refundFollowRequests: number;
  enrollInstallation(options?: {
    registerName: string;
  }): ReturnType<typeof insertEnrolledInstallation>;
  record(fact: SyncedFact, overrides: Partial<UnappliedEvent>): Promise<void>;
  openSession(deviceId: string, sessionId?: string): Promise<string>;
}

export function eventApplicationUnderTest(): EventApplicationUnderTest {
  let testDatabase: TestDatabase;
  let application: EventApplication;
  let refundFollowRequests = 0;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
    refundFollowRequests = 0;
    application = new DrizzleEventApplication(
      testDatabase.db,
      () => APPLICATION_NOW,
      async () => {
        refundFollowRequests += 1;
      },
    );
  });

  async function record(fact: SyncedFact, overrides: Partial<UnappliedEvent>) {
    const event = unappliedEventOf(
      {
        event_id: overrides.eventId ?? randomUUID(),
        device_seq: 1,
        aggregate_type: "Sale",
        aggregate_id: randomUUID(),
        event_type: "sale_completed",
        schema_version: 2,
        payload: {},
        occurred_at: "2026-10-06T11:20:00.000Z",
        actor_id: RECORDING_CASHIER,
        chain_hmac: "hmac",
      },
      overrides,
    );
    await application.transaction((tx) => tx.record(fact, event));
  }

  return {
    get db() {
      return testDatabase.db;
    },
    get application() {
      return application;
    },
    get refundFollowRequests() {
      return refundFollowRequests;
    },
    enrollInstallation(options) {
      return insertEnrolledInstallation(testDatabase.db, { now: APPLICATION_NOW, ...options });
    },
    record,
    async openSession(deviceId, sessionId = randomUUID()) {
      await record(aCashSessionOpenedFact({ id: sessionId }), { deviceId });
      return sessionId;
    },
  };
}
