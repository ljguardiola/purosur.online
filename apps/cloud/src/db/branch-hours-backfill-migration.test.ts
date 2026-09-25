import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { branchHours } from "./schema.js";
import { MIGRATIONS_FOLDER, migrateFreshDatabase } from "./test-database-snapshot.js";

const BACKFILL_MIGRATION_TAG_SUFFIX = "_branch_hours";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

async function readRealJournal(): Promise<Journal> {
  const raw = await readFile(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8");
  return JSON.parse(raw) as Journal;
}

// Found by name rather than by number, so a renumbering after merging another branch's migration
// doesn't silently point this test at the wrong file.
async function branchHoursEntry(): Promise<JournalEntry> {
  const journal = await readRealJournal();
  const entry = journal.entries.find((candidate) =>
    candidate.tag.endsWith(BACKFILL_MIGRATION_TAG_SUFFIX),
  );
  if (!entry) {
    throw new Error("test setup: no branch_hours migration in the journal");
  }
  return entry;
}

/**
 * Builds a migrations folder holding only the real migrations that precede the branch_hours one:
 * the schema as it stood right before this feature's own migration existed, so the backfill it adds
 * can be applied afterward, on its own, against data seeded in that pre-migration shape. Only
 * `_journal.json` and the migration `.sql` files themselves matter to the runtime migrator (unlike
 * `drizzle-kit generate`, it never reads the per-migration snapshot files).
 */
async function migrationsFolderBeforeBranchHours(destFolder: string): Promise<void> {
  await mkdir(join(destFolder, "meta"), { recursive: true });
  const journal = await readRealJournal();
  const { idx } = await branchHoursEntry();
  const entriesBefore = journal.entries.filter((entry) => entry.idx < idx);
  await writeFile(
    join(destFolder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: entriesBefore }),
  );
  for (const entry of entriesBefore) {
    await copyFile(
      join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
      join(destFolder, `${entry.tag}.sql`),
    );
  }
}

/** Adds this feature's real, already hand-edited branch_hours migration to the folder. */
async function addBranchHoursMigration(destFolder: string): Promise<void> {
  const journalPath = join(destFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
  const entry = await branchHoursEntry();
  journal.entries.push(entry);
  await writeFile(journalPath, JSON.stringify(journal));
  await copyFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(destFolder, `${entry.tag}.sql`));
}

async function insertLocation(client: {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "insert into locations default values returning id",
  );
  const location = rows[0];
  if (!location) {
    throw new Error("test setup: seeding a location returned no row");
  }
  await client.query("insert into branch_settings (location_id) values ($1)", [location.id]);
  return location.id;
}

describe("the branch_hours migration's backfill of existing hours", {
  timeout: 30_000,
}, () => {
  it("splits weekday hours into Monday..Friday, keeps Saturday and Sunday as their own day, and skips closed groups", async () => {
    const folder = await mkdtemp(join(tmpdir(), "branch-hours-backfill-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBeforeBranchHours(folder);

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    // Seeded by migration 0011: the one location every earlier migration already assumes exists.
    const { rows: seededLocationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const seededLocation = seededLocationRows[0];
    if (!seededLocation) {
      throw new Error("test setup: no location seeded by the migrations run so far");
    }
    // Weekday and Saturday hours set, Sunday left closed.
    await client.query(
      `update branch_settings set
         weekday_opens_at = $1, weekday_closes_at = $2,
         saturday_opens_at = $3, saturday_closes_at = $4
       where location_id = $5`,
      ["09:00", "19:00", "09:00", "13:00", seededLocation.id],
    );
    // Sunday-only hours, everything else left closed.
    const sundayOnlyLocationId = await insertLocation(client);
    await client.query(
      "update branch_settings set sunday_opens_at = $1, sunday_closes_at = $2 where location_id = $3",
      ["10:00", "14:00", sundayOnlyLocationId],
    );
    // Every group left closed.
    const closedLocationId = await insertLocation(client);

    await addBranchHoursMigration(folder);
    await migrate(drizzle(client), { migrationsFolder: folder });

    const db = drizzle(client);
    const hoursOf = (locationId: string) =>
      db
        .select({
          dayOfWeek: branchHours.dayOfWeek,
          position: branchHours.position,
          opensAt: branchHours.opensAt,
          closesAt: branchHours.closesAt,
        })
        .from(branchHours)
        .where(eq(branchHours.locationId, locationId))
        .orderBy(asc(branchHours.dayOfWeek));

    expect(await hoursOf(seededLocation.id)).toEqual([
      { dayOfWeek: 1, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 2, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 3, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 4, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 5, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 6, position: 0, opensAt: "09:00:00", closesAt: "13:00:00" },
    ]);
    expect(await hoursOf(sundayOnlyLocationId)).toEqual([
      { dayOfWeek: 7, position: 0, opensAt: "10:00:00", closesAt: "14:00:00" },
    ]);
    expect(await hoursOf(closedLocationId)).toEqual([]);
  });
});
