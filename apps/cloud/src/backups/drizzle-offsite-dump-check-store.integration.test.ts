import { eq } from "drizzle-orm";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { offsiteDumpChecks } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleOffsiteDumpCheckStore } from "./drizzle-offsite-dump-check-store.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let store: DrizzleOffsiteDumpCheckStore<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("offsite_dump_check_store");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
  store = new DrizzleOffsiteDumpCheckStore(db, () => NOW);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function constraintViolatedBy(error: unknown, name: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { constraint_name: constraintName } = current as { constraint_name?: unknown };
    if (constraintName === name) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

describe("DrizzleOffsiteDumpCheckStore", () => {
  it("reads back a verified result recorded for a night", async () => {
    await store.transaction((tx) =>
      tx.recordResult("2026-09-01", { status: "verified", sizeBytes: 1_000 }),
    );

    expect(await store.offsiteDumpCheckOf("2026-09-01")).toEqual({
      status: "verified",
      sizeBytes: 1_000,
    });
  });

  it("reads back a failed result recorded for a night", async () => {
    await store.transaction((tx) =>
      tx.recordResult("2026-09-02", { status: "failed", reason: "hash_mismatch" }),
    );

    expect(await store.offsiteDumpCheckOf("2026-09-02")).toEqual({
      status: "failed",
      reason: "hash_mismatch",
    });
  });

  it("reads back a shrank result recorded for a night with the dump's size", async () => {
    await store.transaction((tx) =>
      tx.recordResult("2026-09-09", { status: "failed", reason: "shrank", sizeBytes: 400 }),
    );

    expect(await store.offsiteDumpCheckOf("2026-09-09")).toEqual({
      status: "failed",
      reason: "shrank",
      sizeBytes: 400,
    });
  });

  it("reads nothing for a night nobody reported", async () => {
    expect(await store.offsiteDumpCheckOf("2026-09-03")).toBeUndefined();
  });

  it("replaces the result of a night reported again", async () => {
    await store.transaction((tx) =>
      tx.recordResult("2026-09-04", { status: "failed", reason: "object_missing" }),
    );

    await store.transaction((tx) =>
      tx.recordResult("2026-09-04", { status: "verified", sizeBytes: 2_000 }),
    );

    expect(await store.offsiteDumpCheckOf("2026-09-04")).toEqual({
      status: "verified",
      sizeBytes: 2_000,
    });
    const rows = await db
      .select()
      .from(offsiteDumpChecks)
      .where(eq(offsiteDumpChecks.night, "2026-09-04"));
    expect(rows).toHaveLength(1);
  });

  it("answers the size of the latest night of known size before a night, ignoring nights of unknown size and later nights", async () => {
    await store.transaction(async (tx) => {
      await tx.recordResult("2026-08-10", { status: "verified", sizeBytes: 100 });
      await tx.recordResult("2026-08-11", { status: "verified", sizeBytes: 110 });
      await tx.recordResult("2026-08-12", { status: "failed", reason: "hash_mismatch" });
      await tx.recordResult("2026-08-14", { status: "verified", sizeBytes: 140 });
    });

    const size = await store.transaction((tx) => tx.latestKnownSizeBefore("2026-08-13"));

    expect(size).toBe(110);
  });

  it("answers the size of a shrank night as the latest known size", async () => {
    await store.transaction(async (tx) => {
      await tx.recordResult("2026-07-10", { status: "verified", sizeBytes: 1_000 });
      await tx.recordResult("2026-07-11", { status: "failed", reason: "shrank", sizeBytes: 400 });
    });

    const size = await store.transaction((tx) => tx.latestKnownSizeBefore("2026-07-12"));

    expect(size).toBe(400);
  });

  it("answers no size when no night of known size comes before", async () => {
    const size = await store.transaction((tx) => tx.latestKnownSizeBefore("2020-01-01"));

    expect(size).toBeUndefined();
  });

  it("leaves nothing recorded when the transaction fails", async () => {
    await expect(
      store.transaction(async (tx) => {
        await tx.recordResult("2026-09-05", { status: "verified", sizeBytes: 5 });
        throw new Error("storage unavailable");
      }),
    ).rejects.toThrow("storage unavailable");

    expect(await store.offsiteDumpCheckOf("2026-09-05")).toBeUndefined();
  });

  it("refuses a verified row without a size", async () => {
    const error = await db
      .insert(offsiteDumpChecks)
      .values({ night: "2026-09-06", status: "verified", recordedAt: NOW })
      .catch((cause: unknown) => cause);

    expect(constraintViolatedBy(error, "offsite_dump_checks_result_shape_check")).toBe(true);
  });

  it("refuses a failed row without a reason", async () => {
    const error = await db
      .insert(offsiteDumpChecks)
      .values({ night: "2026-09-07", status: "failed", recordedAt: NOW })
      .catch((cause: unknown) => cause);

    expect(constraintViolatedBy(error, "offsite_dump_checks_result_shape_check")).toBe(true);
  });

  it("refuses a shrank row without the dump's size", async () => {
    const error = await db
      .insert(offsiteDumpChecks)
      .values({ night: "2026-09-10", status: "failed", failureReason: "shrank", recordedAt: NOW })
      .catch((cause: unknown) => cause);

    expect(constraintViolatedBy(error, "offsite_dump_checks_result_shape_check")).toBe(true);
  });

  it("refuses a size on a row that failed before the dump's size was known", async () => {
    const error = await db
      .insert(offsiteDumpChecks)
      .values({
        night: "2026-09-11",
        status: "failed",
        failureReason: "hash_mismatch",
        sizeBytes: 10,
        recordedAt: NOW,
      })
      .catch((cause: unknown) => cause);

    expect(constraintViolatedBy(error, "offsite_dump_checks_result_shape_check")).toBe(true);
  });

  it("refuses a status other than verified or failed", async () => {
    const error = await db
      .insert(offsiteDumpChecks)
      .values({ night: "2026-09-08", status: "pending", recordedAt: NOW })
      .catch((cause: unknown) => cause);

    expect(constraintViolatedBy(error, "offsite_dump_checks_result_shape_check")).toBe(true);
  });
});
