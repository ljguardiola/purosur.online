import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recoveryRejectedAttemptAccumulator } from "../db/schema.js";
import { recordRejectedAttempt, windowStartFor } from "./recovery-rejected-attempt-accumulator.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(async () => {
  await client.close();
});

async function rows() {
  return db
    .select()
    .from(recoveryRejectedAttemptAccumulator)
    .orderBy(asc(recoveryRejectedAttemptAccumulator.windowStart));
}

describe("windowStartFor", () => {
  it("floors a timestamp to the start of its hour", () => {
    expect(windowStartFor(new Date("2026-01-05T12:34:56.789Z"))).toEqual(
      new Date("2026-01-05T12:00:00.000Z"),
    );
  });

  it("leaves an exact hour boundary unchanged", () => {
    expect(windowStartFor(new Date("2026-01-05T12:00:00.000Z"))).toEqual(
      new Date("2026-01-05T12:00:00.000Z"),
    );
  });
});

describe("recordRejectedAttempt", () => {
  it("inserts one row with count 1 and first/last set to the attempt time", async () => {
    const at = new Date("2026-01-05T12:10:00.000Z");

    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-a", now: at });

    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      kind: "request",
      keyHash: "hash-a",
      windowStart: new Date("2026-01-05T12:00:00.000Z"),
      count: 1,
      firstAt: at,
      lastAt: at,
    });
  });

  it("increments the count and moves last_at without touching first_at on a later attempt", async () => {
    const first = new Date("2026-01-05T12:10:00.000Z");
    const second = new Date("2026-01-05T12:40:00.000Z");

    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-a", now: first });
    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-a", now: second });

    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ count: 2, firstAt: first, lastAt: second });
  });

  it("keeps separate rows for different kinds, keys, or hour windows", async () => {
    const withinHour = new Date("2026-01-05T12:10:00.000Z");
    const nextHour = new Date("2026-01-05T13:10:00.000Z");

    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-a", now: withinHour });
    await recordRejectedAttempt(db, {
      kind: "registration_options",
      keyHash: "hash-a",
      now: withinHour,
    });
    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-b", now: withinHour });
    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-a", now: nextHour });

    expect(await rows()).toHaveLength(4);
  });

  it("keeps first_at at the earliest and last_at at the latest attempt when attempts arrive out of order", async () => {
    const earliest = new Date("2026-01-05T12:05:00.000Z");
    const middle = new Date("2026-01-05T12:20:00.000Z");
    const latest = new Date("2026-01-05T12:40:00.000Z");

    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-a", now: middle });
    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-a", now: latest });
    await recordRejectedAttempt(db, { kind: "request", keyHash: "hash-a", now: earliest });

    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ count: 3, firstAt: earliest, lastAt: latest });
  });

  it("merges two upserts of the same key at the same instant into one row counting both", async () => {
    const at = new Date("2026-01-05T12:10:00.000Z");

    await Promise.all([
      recordRejectedAttempt(db, { kind: "redeem", keyHash: "hash-c", now: at }),
      recordRejectedAttempt(db, { kind: "redeem", keyHash: "hash-c", now: at }),
    ]);

    const stored = await db
      .select()
      .from(recoveryRejectedAttemptAccumulator)
      .where(eq(recoveryRejectedAttemptAccumulator.keyHash, "hash-c"));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.count).toBe(2);
  });
});
