import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CLOUD_MIGRATIONS_FOLDER,
  findMigrationNumberingProblems,
  generateCloudMigration,
  readMigrationFolder,
} from "./generate-cloud-migration.mjs";

function entry(idx, tag, when) {
  return { idx, version: "7", when, tag, breakpoints: true };
}

function folderState(entries, { sqlFiles, snapshotFiles } = {}) {
  const numbers = entries.map((candidate) => candidate.tag.slice(0, 4));
  return {
    journal: { version: "7", dialect: "postgresql", entries },
    sqlFiles: sqlFiles ?? entries.map((candidate) => `${candidate.tag}.sql`),
    snapshotFiles: snapshotFiles ?? numbers.map((number) => `${number}_snapshot.json`),
  };
}

const SHIPPED_ENTRIES = [
  entry(0, "0000_first", 100),
  entry(1, "0001_second", 200),
  entry(2, "0004_third", 300),
];

async function writeMigrationFolder(entries) {
  const folder = await mkdtemp(join(tmpdir(), "cloud-migrations-"));
  await mkdir(join(folder, "meta"));
  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries }, null, 2),
  );
  for (const { tag } of entries) {
    await writeFile(join(folder, `${tag}.sql`), `-- ${tag}`);
    await writeFile(join(folder, "meta", `${tag.slice(0, 4)}_snapshot.json`), `{"of":"${tag}"}`);
  }
  return folder;
}

async function listFolder(folder) {
  const top = (await readdir(folder)).filter((name) => name !== "meta").sort();
  const meta = (await readdir(join(folder, "meta"))).sort();
  const contents = {};
  for (const name of top) contents[name] = await readFile(join(folder, name), "utf8");
  for (const name of meta)
    contents[`meta/${name}`] = await readFile(join(folder, "meta", name), "utf8");
  return contents;
}

async function readJournal(folder) {
  return JSON.parse(await readFile(join(folder, "meta", "_journal.json"), "utf8"));
}

function drizzleKitWriting(name, { snapshot = '{"of":"new"}', sql = "-- new", when = 400 } = {}) {
  return async (folder) => {
    const journal = await readJournal(folder);
    const idx = journal.entries.at(-1).idx + 1;
    const prefix = String(idx).padStart(4, "0");
    await writeFile(join(folder, "meta", `${prefix}_snapshot.json`), snapshot);
    journal.entries.push(entry(idx, `${prefix}_${name}`, when));
    await writeFile(join(folder, "meta", "_journal.json"), JSON.stringify(journal, null, 2));
    await writeFile(join(folder, `${prefix}_${name}.sql`), sql);
  };
}

test("accepts a journal whose entries match their files in increasing order", () => {
  assert.deepEqual(findMigrationNumberingProblems(folderState(SHIPPED_ENTRIES)), []);
});

test("refuses an entry numbered at or below an earlier entry's number", () => {
  const problems = findMigrationNumberingProblems(
    folderState([...SHIPPED_ENTRIES, entry(3, "0003_late", 400)]),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0003_late/);
  assert.match(problems[0], /pnpm cloud:generate-migration/);
});

test("refuses two entries sharing a number", () => {
  const problems = findMigrationNumberingProblems(
    folderState([...SHIPPED_ENTRIES, entry(3, "0004_again", 400)], {
      snapshotFiles: ["0000_snapshot.json", "0001_snapshot.json", "0004_snapshot.json"],
    }),
  );
  assert.ok(problems.some((problem) => problem.includes("0004_again")));
});

test("refuses an entry whose idx does not increase", () => {
  const problems = findMigrationNumberingProblems(
    folderState([...SHIPPED_ENTRIES, entry(2, "0005_same_idx", 400)]),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0005_same_idx/);
  assert.match(problems[0], /idx/);
});

test("refuses an entry not dated after the entry before it", () => {
  const problems = findMigrationNumberingProblems(
    folderState([...SHIPPED_ENTRIES, entry(3, "0005_early", 300)]),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0005_early/);
  assert.match(problems[0], /dated/);
});

test("refuses an entry whose tag does not start with a four-digit number", () => {
  const problems = findMigrationNumberingProblems(
    folderState([...SHIPPED_ENTRIES, entry(3, "five_unnumbered", 400)], {
      snapshotFiles: [
        "0000_snapshot.json",
        "0001_snapshot.json",
        "0004_snapshot.json",
        "five_snapshot.json",
      ],
    }),
  );
  assert.ok(problems.some((problem) => problem.includes("five_unnumbered")));
});

test("refuses an entry without its migration file", () => {
  const state = folderState(SHIPPED_ENTRIES);
  const problems = findMigrationNumberingProblems({
    ...state,
    sqlFiles: state.sqlFiles.filter((name) => name !== "0001_second.sql"),
  });
  assert.deepEqual(problems.length, 1);
  assert.match(problems[0], /0001_second\.sql/);
});

test("refuses an entry without its snapshot", () => {
  const state = folderState(SHIPPED_ENTRIES);
  const problems = findMigrationNumberingProblems({
    ...state,
    snapshotFiles: state.snapshotFiles.filter((name) => name !== "0004_snapshot.json"),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0004_snapshot\.json/);
});

test("refuses a migration file and a snapshot that belong to no entry", () => {
  const state = folderState(SHIPPED_ENTRIES);
  const problems = findMigrationNumberingProblems({
    ...state,
    sqlFiles: [...state.sqlFiles, "0005_orphan.sql"],
    snapshotFiles: [...state.snapshotFiles, "0005_snapshot.json"],
  });
  assert.equal(problems.length, 2);
  assert.ok(problems.some((problem) => problem.includes("0005_orphan.sql")));
  assert.ok(problems.some((problem) => problem.includes("0005_snapshot.json")));
});

test("the cloud's migrations folder has no numbering problem", async () => {
  assert.deepEqual(
    findMigrationNumberingProblems(await readMigrationFolder(CLOUD_MIGRATIONS_FOLDER)),
    [],
  );
});

test("reads a migrations folder's journal, migration files and snapshots", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  assert.deepEqual(await readMigrationFolder(folder), folderState(SHIPPED_ENTRIES));
});

test("numbers a generated migration after the highest migration number", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  const before = await listFolder(folder);

  const result = await generateCloudMigration({
    folder,
    runDrizzleKit: drizzleKitWriting("added"),
  });

  assert.deepEqual(result, { generated: "0005_added" });
  const after = await listFolder(folder);
  for (const [name, contents] of Object.entries(before)) {
    if (name !== "meta/_journal.json") assert.equal(after[name], contents, name);
  }
  assert.equal(after["0005_added.sql"], "-- new");
  assert.equal(after["meta/0005_snapshot.json"], '{"of":"new"}');
  assert.equal(after["0003_added.sql"], undefined);
  assert.equal(after["meta/0003_snapshot.json"], undefined);
  const journal = await readJournal(folder);
  assert.deepEqual(journal.entries, [...SHIPPED_ENTRIES, entry(5, "0005_added", 400)]);
  assert.deepEqual(findMigrationNumberingProblems(await readMigrationFolder(folder)), []);
});

test("keeps the shipped snapshot drizzle-kit overwrote", async () => {
  const shipped = [...SHIPPED_ENTRIES, entry(3, "0005_fourth", 350)];
  const folder = await writeMigrationFolder(shipped);

  await generateCloudMigration({ folder, runDrizzleKit: drizzleKitWriting("added") });

  const after = await listFolder(folder);
  assert.equal(after["meta/0004_snapshot.json"], '{"of":"0004_third"}');
  assert.equal(after["meta/0006_snapshot.json"], '{"of":"new"}');
  assert.equal(after["0006_added.sql"], "-- new");
  assert.equal(after["0004_added.sql"], undefined);
});

test("leaves the name alone when drizzle-kit already chose the next number", async () => {
  const folder = await writeMigrationFolder([
    entry(0, "0000_first", 100),
    entry(1, "0001_second", 200),
  ]);

  const result = await generateCloudMigration({
    folder,
    runDrizzleKit: drizzleKitWriting("added"),
  });

  assert.deepEqual(result, { generated: "0002_added" });
  const after = await listFolder(folder);
  assert.equal(after["0002_added.sql"], "-- new");
  assert.equal(after["meta/0002_snapshot.json"], '{"of":"new"}');
  assert.deepEqual(findMigrationNumberingProblems(await readMigrationFolder(folder)), []);
});

test("changes nothing when drizzle-kit generates no migration", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  const before = await listFolder(folder);

  const result = await generateCloudMigration({ folder, runDrizzleKit: async () => {} });

  assert.deepEqual(result, { generated: undefined });
  assert.deepEqual(await listFolder(folder), before);
});

test("restores the folder when drizzle-kit fails after writing part of a migration", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  const before = await listFolder(folder);

  await assert.rejects(
    generateCloudMigration({
      folder,
      runDrizzleKit: async (target) => {
        await writeFile(join(target, "meta", "0003_snapshot.json"), '{"of":"partial"}');
        await writeFile(join(target, "0003_partial.sql"), "-- partial");
        throw new Error("drizzle-kit exited with status 1");
      },
    }),
    /drizzle-kit exited with status 1/,
  );

  assert.deepEqual(await listFolder(folder), before);
});

test("restores the overwritten snapshot when drizzle-kit fails", async () => {
  const shipped = [...SHIPPED_ENTRIES, entry(3, "0005_fourth", 350)];
  const folder = await writeMigrationFolder(shipped);
  const before = await listFolder(folder);

  await assert.rejects(
    generateCloudMigration({
      folder,
      runDrizzleKit: async (target) => {
        await writeFile(join(target, "meta", "0004_snapshot.json"), '{"of":"new"}');
        throw new Error("drizzle-kit exited with status 1");
      },
    }),
  );

  assert.deepEqual(await listFolder(folder), before);
});

test("restores the folder when drizzle-kit leaves more than one new entry", async () => {
  const folder = await writeMigrationFolder([
    entry(0, "0000_first", 100),
    entry(1, "0001_second", 200),
    entry(2, "0009_third", 300),
  ]);
  const before = await listFolder(folder);
  const writeOne = drizzleKitWriting("one");
  const writeTwo = drizzleKitWriting("two", { when: 500 });

  await assert.rejects(
    generateCloudMigration({
      folder,
      runDrizzleKit: async (target) => {
        await writeOne(target);
        await writeTwo(target);
      },
    }),
    /2 new journal entries/,
  );

  assert.deepEqual(await listFolder(folder), before);
});

test("writes the journal ending with a newline, as the formatter keeps it", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);

  await generateCloudMigration({ folder, runDrizzleKit: drizzleKitWriting("added") });

  assert.ok((await readFile(join(folder, "meta", "_journal.json"), "utf8")).endsWith("}\n"));
});
