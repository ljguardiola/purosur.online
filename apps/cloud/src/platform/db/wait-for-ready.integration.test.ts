import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterEach, describe, expect, inject, it, vi } from "vitest";
import { runMigrations } from "../../migrate.js";
import { CLOUD_APP_PASSWORD } from "../../test-support/cloud-app-password.js";
import { withExclusiveMigration } from "../../test-support/recovery-integration-database.js";
import { waitForReady } from "../../wait-for-ready.js";
import { MIGRATIONS_FOLDER } from "./migrations-folder.js";
import {
  migrationsFolderBefore,
  readRealJournal,
} from "./test-support/migration-journal-test-helpers.js";

function databaseUrlFor(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function asCloudApp(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = "cloud_app";
  url.password = CLOUD_APP_PASSWORD;
  return url.toString();
}

async function createUnmigratedDatabase(namePrefix: string): Promise<{
  adminUrl: string;
  databaseName: string;
  databaseUrl: string;
}> {
  const adminUrl = inject("recoveryPostgresAdminUrl");
  const databaseName = `${namePrefix}_${randomUUID().replaceAll("-", "")}`;

  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 1 });
  }

  return { adminUrl, databaseName, databaseUrl: databaseUrlFor(adminUrl, databaseName) };
}

async function dropDatabase(adminUrl: string, databaseName: string): Promise<void> {
  const cleanup = postgres(adminUrl, { max: 1 });
  try {
    await cleanup.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await cleanup.end({ timeout: 1 });
  }
}

async function migrationsFolderWithoutTheLatestMigration(): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const latestEntry = (await readRealJournal()).entries.at(-1);
  if (!latestEntry) {
    throw new Error("test setup: the migration journal has no entries");
  }
  const path = await mkdtemp(join(tmpdir(), "wait-for-ready-migrations-"));
  await migrationsFolderBefore(path, latestEntry);
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) };
}

function fakeClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
  };
}

describe("waitForReady", () => {
  let adminUrl: string;
  let databaseName: string | undefined;

  afterEach(async () => {
    if (databaseName) {
      await dropDatabase(adminUrl, databaseName);
      databaseName = undefined;
    }
  });

  it("keeps waiting on an unmigrated database and times out with a clear failure", async () => {
    const created = await createUnmigratedDatabase("wait_for_ready_unmigrated");
    adminUrl = created.adminUrl;
    databaseName = created.databaseName;
    const clock = fakeClock();
    const onWaiting = vi.fn();

    await expect(
      waitForReady(asCloudApp(created.databaseUrl), {
        migrationsFolder: MIGRATIONS_FOLDER,
        connectTimeoutSeconds: 1,
        waitForReadySeconds: 5,
        waitIntervalMs: 1000,
        sleep: clock.sleep,
        now: clock.now,
        onWaiting,
      }),
    ).rejects.toThrow();

    expect(onWaiting).toHaveBeenCalled();
  }, 30_000);

  it("becomes ready once runMigrations has applied every bundled migration", async () => {
    const created = await createUnmigratedDatabase("wait_for_ready_migrated");
    adminUrl = created.adminUrl;
    databaseName = created.databaseName;

    await withExclusiveMigration(() =>
      runMigrations(created.databaseUrl, CLOUD_APP_PASSWORD, {
        migrationsFolder: MIGRATIONS_FOLDER,
      }),
    );

    await expect(
      waitForReady(asCloudApp(created.databaseUrl), {
        migrationsFolder: MIGRATIONS_FOLDER,
        connectTimeoutSeconds: 5,
        waitForReadySeconds: 5,
        waitIntervalMs: 200,
      }),
    ).resolves.toBeUndefined();
  }, 30_000);

  it("is not ready while the database lacks a migration bundled in this image", async () => {
    const created = await createUnmigratedDatabase("wait_for_ready_behind");
    adminUrl = created.adminUrl;
    databaseName = created.databaseName;
    const behind = await migrationsFolderWithoutTheLatestMigration();

    try {
      await withExclusiveMigration(() =>
        runMigrations(created.databaseUrl, CLOUD_APP_PASSWORD, {
          migrationsFolder: behind.path,
        }),
      );
      const clock = fakeClock();

      await expect(
        waitForReady(asCloudApp(created.databaseUrl), {
          migrationsFolder: MIGRATIONS_FOLDER,
          connectTimeoutSeconds: 5,
          waitForReadySeconds: 3,
          waitIntervalMs: 500,
          sleep: clock.sleep,
          now: clock.now,
        }),
      ).rejects.toMatchObject({ code: "SCHEMA_NOT_READY" });
    } finally {
      await behind.cleanup();
    }
  }, 30_000);

  describe("once runMigrations has run but its graphile-worker setup is incomplete", () => {
    async function migratedDatabaseAfter(
      namePrefix: string,
      undoAsAdmin: (admin: postgres.Sql) => Promise<unknown>,
    ): Promise<string> {
      const created = await createUnmigratedDatabase(namePrefix);
      adminUrl = created.adminUrl;
      databaseName = created.databaseName;
      await withExclusiveMigration(() =>
        runMigrations(created.databaseUrl, CLOUD_APP_PASSWORD, {
          migrationsFolder: MIGRATIONS_FOLDER,
        }),
      );
      const admin = postgres(created.databaseUrl, { max: 1 });
      try {
        await undoAsAdmin(admin);
      } finally {
        await admin.end({ timeout: 1 });
      }
      return created.databaseUrl;
    }

    async function expectNotReady(databaseUrl: string): Promise<void> {
      const clock = fakeClock();
      await expect(
        waitForReady(asCloudApp(databaseUrl), {
          migrationsFolder: MIGRATIONS_FOLDER,
          connectTimeoutSeconds: 5,
          waitForReadySeconds: 3,
          waitIntervalMs: 500,
          sleep: clock.sleep,
          now: clock.now,
        }),
      ).rejects.toMatchObject({ code: "SCHEMA_NOT_READY" });
    }

    it("is not ready while graphile-worker's schema is behind the bundled graphile-worker", async () => {
      const databaseUrl = await migratedDatabaseAfter(
        "wait_for_ready_worker_behind",
        (admin) =>
          admin`delete from graphile_worker.migrations where id = (select max(id) from graphile_worker.migrations)`,
      );

      await expectNotReady(databaseUrl);
    }, 30_000);

    it("is not ready while cloud_app lacks a privilege on a graphile-worker table", async () => {
      const databaseUrl = await migratedDatabaseAfter("wait_for_ready_worker_grant", (admin) =>
        admin.unsafe("revoke update on graphile_worker._private_jobs from cloud_app"),
      );

      await expectNotReady(databaseUrl);
    }, 30_000);

    it("is not ready while a graphile-worker row-security table has no policy for cloud_app", async () => {
      const databaseUrl = await migratedDatabaseAfter("wait_for_ready_worker_policy", (admin) =>
        admin.unsafe("drop policy cloud_app_full_access on graphile_worker._private_jobs"),
      );

      await expectNotReady(databaseUrl);
    }, 30_000);
  });
});
