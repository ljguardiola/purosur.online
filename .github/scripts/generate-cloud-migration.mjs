import { spawnSync } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CLOUD_MIGRATIONS_FOLDER = "apps/cloud/migrations";

const GENERATE_COMMAND = "pnpm cloud:generate-migration";
const NUMBER_WIDTH = 4;
const SNAPSHOT_SUFFIX = "_snapshot.json";

function journalPath(folder) {
  return join(folder, "meta", "_journal.json");
}

function snapshotName(number) {
  return `${number}${SNAPSHOT_SUFFIX}`;
}

function tagNumber(tag) {
  return new RegExp(`^\\d{${NUMBER_WIDTH}}(?=_)`).exec(tag)?.[0];
}

export async function readMigrationFolder(folder) {
  const journal = JSON.parse(await readFile(journalPath(folder), "utf8"));
  const sqlFiles = (await readdir(folder)).filter((name) => name.endsWith(".sql")).sort();
  const snapshotFiles = (await readdir(join(folder, "meta")))
    .filter((name) => name.endsWith(SNAPSHOT_SUFFIX))
    .sort();
  return { journal, sqlFiles, snapshotFiles };
}

export function readBaseJournal({ base, runGit }) {
  return JSON.parse(
    runGit(["show", `${base}:${journalPath(CLOUD_MIGRATIONS_FOLDER)}`]).toString("utf8"),
  );
}

export function findMigrationNumberingProblems({ journal, sqlFiles, snapshotFiles, baseJournal }) {
  const problems = [];
  const fix = `generate cloud migrations with \`${GENERATE_COMMAND}\``;
  const baseTags = new Set(baseJournal.entries.map((entry) => entry.tag));
  const expectedSql = new Set();
  const expectedSnapshots = new Set();
  let previous;
  for (const entry of journal.entries) {
    const number = tagNumber(entry.tag);
    expectedSql.add(`${entry.tag}.sql`);
    if (number === undefined) {
      problems.push(
        `${entry.tag}: its tag does not start with a ${NUMBER_WIDTH}-digit number — ${fix}`,
      );
    } else {
      expectedSnapshots.add(snapshotName(number));
      if (!baseTags.has(entry.tag) && entry.idx !== Number(number)) {
        problems.push(
          `${entry.tag}: added since main with idx ${entry.idx} instead of its number ${Number(number)} — ${fix}`,
        );
      }
      if (previous?.number !== undefined && Number(number) <= Number(previous.number)) {
        problems.push(
          `${entry.tag}: numbered at or below ${previous.entry.tag}, the entry before it — ${fix}`,
        );
      }
    }
    if (previous !== undefined && !(entry.idx > previous.entry.idx)) {
      problems.push(
        `${entry.tag}: its idx ${entry.idx} is not above ${previous.entry.tag}'s idx ${previous.entry.idx} — ${fix}`,
      );
    }
    if (previous !== undefined && !(entry.when > previous.entry.when)) {
      problems.push(
        `${entry.tag}: not dated after ${previous.entry.tag}, the entry before it — ${fix}`,
      );
    }
    previous = { entry, number };
  }
  const sqlPresent = new Set(sqlFiles);
  const snapshotsPresent = new Set(snapshotFiles);
  for (const name of expectedSql) {
    if (!sqlPresent.has(name)) problems.push(`${name}: missing for its journal entry — ${fix}`);
  }
  for (const name of expectedSnapshots) {
    if (!snapshotsPresent.has(name)) {
      problems.push(`meta/${name}: missing for its journal entry — ${fix}`);
    }
  }
  for (const name of sqlFiles) {
    if (!expectedSql.has(name)) problems.push(`${name}: belongs to no journal entry — ${fix}`);
  }
  for (const name of snapshotFiles) {
    if (!expectedSnapshots.has(name)) {
      problems.push(`meta/${name}: belongs to no journal entry — ${fix}`);
    }
  }
  return problems;
}

async function folderPaths(folder) {
  const top = (await readdir(folder)).filter((name) => name !== "meta");
  const meta = (await readdir(join(folder, "meta"))).map((name) => join("meta", name));
  return [...top, ...meta];
}

function padded(number) {
  return String(number).padStart(NUMBER_WIDTH, "0");
}

function highestNumber({ journal, sqlFiles }) {
  const numbers = [...journal.entries.map((entry) => entry.tag), ...sqlFiles]
    .map(tagNumber)
    .filter((number) => number !== undefined)
    .map(Number);
  return numbers.length === 0 ? -1 : Math.max(...numbers);
}

async function readFolderBytes(folder) {
  const bytes = new Map();
  for (const path of await folderPaths(folder)) bytes.set(path, await readFile(join(folder, path)));
  return bytes;
}

export async function generateCloudMigration({ folder, runDrizzleKit }) {
  const before = await readMigrationFolder(folder);
  const bytesBefore = await readFolderBytes(folder);

  async function restore() {
    const pathsAfter = new Set(await folderPaths(folder));
    for (const path of pathsAfter) {
      if (!bytesBefore.has(path)) await rm(join(folder, path));
    }
    for (const [path, bytes] of bytesBefore) {
      if (!pathsAfter.has(path) || !bytes.equals(await readFile(join(folder, path)))) {
        await writeFile(join(folder, path), bytes);
      }
    }
  }

  try {
    await runDrizzleKit(folder);
    const after = await readMigrationFolder(folder);
    const added = after.journal.entries.length - before.journal.entries.length;
    if (added === 0) {
      await restore();
      return { generated: undefined };
    }
    if (added !== 1) {
      throw new Error(`drizzle-kit left ${added} new journal entries instead of one`);
    }
    const generated = after.journal.entries.at(-1);
    const generatedNumber = tagNumber(generated.tag);
    const number = padded(highestNumber(before) + 1);
    const tag = `${number}${generated.tag.slice(generatedNumber.length)}`;
    const generatedSnapshot = await readFile(join(folder, "meta", snapshotName(generatedNumber)));
    const sql = await readFile(join(folder, `${generated.tag}.sql`));
    await restore();
    await writeFile(join(folder, "meta", snapshotName(number)), generatedSnapshot);
    await writeFile(join(folder, `${tag}.sql`), sql);
    const journal = {
      ...after.journal,
      entries: [...before.journal.entries, { ...generated, idx: Number(number), tag }],
    };
    await writeFile(journalPath(folder), `${JSON.stringify(journal, null, 2)}\n`);
    return { generated: tag };
  } catch (error) {
    await restore();
    throw error;
  }
}

export function runPnpmViaChildProcess(args, { spawn = spawnSync } = {}) {
  const result = spawn("pnpm", args, { stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} exited with status ${result.status}`);
  }
}

export async function runCli({
  argv = process.argv.slice(2),
  folder = CLOUD_MIGRATIONS_FOLDER,
  runPnpm = runPnpmViaChildProcess,
  log = console.log,
} = {}) {
  const args = argv.filter((arg, index) => !(index === 0 && arg === "--"));
  const { generated } = await generateCloudMigration({
    folder,
    runDrizzleKit: async () =>
      runPnpm(["--filter", "@purosur/cloud", "exec", "drizzle-kit", "generate", ...args]),
  });
  if (generated === undefined) {
    log("No cloud migration generated.");
    return;
  }
  await runPnpm([
    "exec",
    "biome",
    "format",
    "--write",
    journalPath(folder),
    join(folder, "meta", snapshotName(tagNumber(generated))),
  ]);
  log(`Cloud migration ${folder}/${generated}.sql`);
}

if (import.meta.main) {
  await runCli();
}
