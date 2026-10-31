import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runGitSync } from "./applied-migrations-unchanged.mjs";
import { resolveBaseRef, resolveBaseSha } from "./change-base.mjs";
import {
  CLOUD_MIGRATIONS_FOLDER,
  findMigrationNumberingProblems,
  generateCloudMigration,
  readBaseJournal,
  readMigrationFolder,
  runCli,
  runPnpmViaChildProcess,
} from "./generate-cloud-migration.mjs";

function entry(idx, tag, when) {
  return { idx, version: "7", when, tag, breakpoints: true };
}

function journalOf(entries) {
  return { version: "7", dialect: "postgresql", entries };
}

function folderState(entries, { sqlFiles, snapshotFiles, baseEntries = entries } = {}) {
  const numbers = entries.map((candidate) => candidate.tag.slice(0, 4));
  return {
    journal: journalOf(entries),
    sqlFiles: sqlFiles ?? entries.map((candidate) => `${candidate.tag}.sql`),
    snapshotFiles: snapshotFiles ?? numbers.map((number) => `${number}_snapshot.json`),
    baseJournal: journalOf(baseEntries),
  };
}

async function generatedFolderProblems(folder, baseEntries) {
  return findMigrationNumberingProblems({
    ...(await readMigrationFolder(folder)),
    baseJournal: journalOf(baseEntries),
  });
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
    JSON.stringify(journalOf(entries), null, 2),
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

test("refuses an entry added since the base whose idx is not its number", () => {
  const problems = findMigrationNumberingProblems(
    folderState([...SHIPPED_ENTRIES, entry(3, "0005_behind", 400)], {
      baseEntries: SHIPPED_ENTRIES,
    }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0005_behind/);
  assert.match(problems[0], /idx 3/);
  assert.match(problems[0], /pnpm cloud:generate-migration/);
});

test("accepts an entry added since the base whose idx is its number", () => {
  assert.deepEqual(
    findMigrationNumberingProblems(
      folderState([...SHIPPED_ENTRIES, entry(5, "0005_added", 400)], {
        baseEntries: SHIPPED_ENTRIES,
      }),
    ),
    [],
  );
});

test("the cloud's migrations folder has no numbering problem", async () => {
  const ref = resolveBaseRef(process.env);
  const base = resolveBaseSha({ ref, runGit: runGitSync });
  assert.ok(
    base,
    `could not resolve base ref "${ref}" for the cloud migration numbering check — fetch it first, e.g. \`git fetch origin main\``,
  );
  assert.deepEqual(
    findMigrationNumberingProblems({
      ...(await readMigrationFolder(CLOUD_MIGRATIONS_FOLDER)),
      baseJournal: readBaseJournal({ base, runGit: runGitSync }),
    }),
    [],
  );
});

test("reads the cloud's journal as the base commit holds it", () => {
  const calls = [];
  const journal = readBaseJournal({
    base: "abc123",
    runGit: (args) => {
      calls.push(args);
      return Buffer.from(JSON.stringify(journalOf(SHIPPED_ENTRIES)));
    },
  });
  assert.deepEqual(calls, [["show", "abc123:apps/cloud/migrations/meta/_journal.json"]]);
  assert.deepEqual(journal, journalOf(SHIPPED_ENTRIES));
});

test("reads a migrations folder's journal, migration files and snapshots", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  const { baseJournal: _, ...expected } = folderState(SHIPPED_ENTRIES);
  assert.deepEqual(await readMigrationFolder(folder), expected);
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
  assert.deepEqual(await generatedFolderProblems(folder, SHIPPED_ENTRIES), []);
});

test("numbers a generated migration after a migration file no journal entry names", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  await writeFile(join(folder, "0007_orphan.sql"), "-- orphan");

  const result = await generateCloudMigration({
    folder,
    runDrizzleKit: drizzleKitWriting("added"),
  });

  assert.deepEqual(result, { generated: "0008_added" });
  const after = await listFolder(folder);
  assert.equal(after["0008_added.sql"], "-- new");
  assert.equal(after["meta/0008_snapshot.json"], '{"of":"new"}');
});

test("keeps the shipped migration file drizzle-kit overwrote", async () => {
  const shipped = [entry(0, "0000_first", 100), entry(1, "0002_added", 200)];
  const folder = await writeMigrationFolder(shipped);
  const before = await listFolder(folder);

  const result = await generateCloudMigration({
    folder,
    runDrizzleKit: drizzleKitWriting("added"),
  });

  assert.deepEqual(result, { generated: "0003_added" });
  const after = await listFolder(folder);
  for (const [name, contents] of Object.entries(before)) {
    if (name !== "meta/_journal.json") assert.equal(after[name], contents, name);
  }
  assert.equal(after["0003_added.sql"], "-- new");
  assert.equal(after["meta/0003_snapshot.json"], '{"of":"new"}');
  assert.deepEqual(await generatedFolderProblems(folder, shipped), []);
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
  assert.deepEqual(
    await generatedFolderProblems(folder, [
      entry(0, "0000_first", 100),
      entry(1, "0001_second", 200),
    ]),
    [],
  );
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

test("restores the shipped migration file drizzle-kit overwrote when it fails", async () => {
  const folder = await writeMigrationFolder([
    entry(0, "0000_first", 100),
    entry(1, "0002_added", 200),
  ]);
  const before = await listFolder(folder);

  await assert.rejects(
    generateCloudMigration({
      folder,
      runDrizzleKit: async (target) => {
        await writeFile(join(target, "0002_added.sql"), "-- partial");
        throw new Error("drizzle-kit exited with status 1");
      },
    }),
    /drizzle-kit exited with status 1/,
  );

  assert.deepEqual(await listFolder(folder), before);
});

test("restores the folder when drizzle-kit leaves more than one new entry", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
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

async function cliRun({ argv, writeMigration = async () => {} }) {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  const calls = [];
  const logs = [];
  await runCli({
    argv,
    folder,
    log: (line) => logs.push(line),
    runPnpm: async (args) => {
      calls.push(args);
      if (args.includes("drizzle-kit")) await writeMigration(folder);
    },
  });
  return { folder, calls, logs };
}

const BUILD_DOMAIN_AND_CONTRACTS = ["exec", "tsc", "-b", "packages/domain", "packages/contracts"];

test("the command builds the domain and the contracts before running drizzle-kit", async () => {
  const { calls } = await cliRun({ argv: [] });

  assert.deepEqual(calls[0], BUILD_DOMAIN_AND_CONTRACTS);
  assert.ok(calls[1].includes("drizzle-kit"));
});

test("the command stops before drizzle-kit and leaves the migrations folder untouched when the build fails", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  const before = await listFolder(folder);
  const calls = [];

  await assert.rejects(
    runCli({
      argv: ["--name", "added"],
      folder,
      log: () => {},
      runPnpm: async (args) => {
        calls.push(args);
        if (args.includes("tsc")) throw new Error("pnpm exec tsc exited with status 2");
        if (args.includes("drizzle-kit")) await drizzleKitWriting("added")(folder);
      },
    }),
    /exited with status 2/,
  );
  assert.deepEqual(calls, [BUILD_DOMAIN_AND_CONTRACTS]);
  assert.deepEqual(await listFolder(folder), before);
});

test("the command passes its arguments to drizzle-kit generate in the cloud, dropping a leading --", async () => {
  const { calls } = await cliRun({ argv: ["--", "--name", "added"] });

  assert.deepEqual(calls[1], [
    "--filter",
    "@purosur/cloud",
    "exec",
    "drizzle-kit",
    "generate",
    "--name",
    "added",
  ]);
});

test("the command formats the journal and the new snapshot and prints the new migration", async () => {
  const { folder, calls, logs } = await cliRun({
    argv: ["--name", "added"],
    writeMigration: drizzleKitWriting("added"),
  });

  assert.deepEqual(calls.slice(2), [
    [
      "exec",
      "biome",
      "format",
      "--write",
      join(folder, "meta", "_journal.json"),
      join(folder, "meta", "0005_snapshot.json"),
    ],
  ]);
  assert.deepEqual(logs, [`Cloud migration ${folder}/0005_added.sql`]);
});

test("the command formats nothing and says so when drizzle-kit generates no migration", async () => {
  const { calls, logs } = await cliRun({ argv: [] });

  assert.equal(calls.length, 2);
  assert.deepEqual(logs, ["No cloud migration generated."]);
});

test("the command stops when drizzle-kit fails", async () => {
  const folder = await writeMigrationFolder(SHIPPED_ENTRIES);
  const calls = [];

  await assert.rejects(
    runCli({
      argv: [],
      folder,
      log: () => {},
      runPnpm: async (args) => {
        calls.push(args);
        if (args.includes("drizzle-kit")) throw new Error("pnpm exited with status 1");
      },
    }),
    /exited with status 1/,
  );
  assert.equal(calls.length, 2);
});

test("runs pnpm with the given arguments, showing its output", () => {
  const calls = [];
  runPnpmViaChildProcess(["exec", "biome"], {
    spawn: (...call) => {
      calls.push(call);
      return { status: 0 };
    },
  });
  assert.deepEqual(calls, [["pnpm", ["exec", "biome"], { stdio: "inherit" }]]);
});

test("throws when pnpm exits with a non-zero status", () => {
  assert.throws(
    () => runPnpmViaChildProcess(["exec", "biome"], { spawn: () => ({ status: 2 }) }),
    /pnpm exec biome exited with status 2/,
  );
});

test("throws when pnpm cannot start", () => {
  assert.throws(
    () =>
      runPnpmViaChildProcess(["exec"], {
        spawn: () => ({ error: new Error("spawn pnpm ENOENT"), status: null }),
      }),
    /ENOENT/,
  );
});
