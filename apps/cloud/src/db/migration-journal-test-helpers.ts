import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MIGRATIONS_FOLDER } from "./test-database-snapshot.js";

export interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

export async function readRealJournal(): Promise<Journal> {
  const raw = await readFile(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8");
  return JSON.parse(raw) as Journal;
}

// Found by the suffix of its tag rather than by number, so a renumbering after merging another
// branch's migration doesn't silently point a test at the wrong file.
export async function findMigrationEntry(
  tagSuffix: string,
  notFoundMessage: string,
): Promise<JournalEntry> {
  const journal = await readRealJournal();
  const entry = journal.entries.find((candidate) => candidate.tag.endsWith(tagSuffix));
  if (!entry) {
    throw new Error(notFoundMessage);
  }
  return entry;
}

/**
 * Builds a migrations folder holding only the real migrations that precede the given one: the
 * schema as it stood right before that migration existed, so it can be applied afterward, on its
 * own, against data already seeded in that pre-migration shape. Only `_journal.json` and the
 * migration `.sql` files themselves matter to the runtime migrator (unlike `drizzle-kit generate`,
 * it never reads the per-migration snapshot files).
 */
export async function migrationsFolderBefore(
  destFolder: string,
  entry: JournalEntry,
): Promise<void> {
  await mkdir(join(destFolder, "meta"), { recursive: true });
  const journal = await readRealJournal();
  const entriesBefore = journal.entries.filter((candidate) => candidate.idx < entry.idx);
  await writeFile(
    join(destFolder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: entriesBefore }),
  );
  for (const before of entriesBefore) {
    await copyFile(
      join(MIGRATIONS_FOLDER, `${before.tag}.sql`),
      join(destFolder, `${before.tag}.sql`),
    );
  }
}

/** Adds one already-generated real migration entry to a folder built by `migrationsFolderBefore`. */
export async function addMigrationEntry(destFolder: string, entry: JournalEntry): Promise<void> {
  const journalPath = join(destFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
  journal.entries.push(entry);
  await writeFile(journalPath, JSON.stringify(journal));
  await copyFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(destFolder, `${entry.tag}.sql`));
}
