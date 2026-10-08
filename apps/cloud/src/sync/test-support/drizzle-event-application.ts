import type { EventApplication } from "@purosur/domain/sync/use-cases";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { DrizzleEventApplication } from "../drizzle-event-application.js";

export const APPLICATION_NOW = new Date("2026-10-06T15:00:00.000Z");

export interface EventApplicationUnderTest {
  readonly db: TestDatabase["db"];
  readonly application: EventApplication;
  enrollInstallation(): ReturnType<typeof insertEnrolledInstallation>;
}

export function eventApplicationUnderTest(): EventApplicationUnderTest {
  let testDatabase: TestDatabase;
  let application: EventApplication;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
    application = new DrizzleEventApplication(testDatabase.db, () => APPLICATION_NOW);
  });

  return {
    get db() {
      return testDatabase.db;
    },
    get application() {
      return application;
    },
    enrollInstallation() {
      return insertEnrolledInstallation(testDatabase.db, { now: APPLICATION_NOW });
    },
  };
}
