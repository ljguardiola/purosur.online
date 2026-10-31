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

export function findMigrationNumberingProblems({ journal, sqlFiles, snapshotFiles }) {
  const problems = [];
  const fix = `generate cloud migrations with \`${GENERATE_COMMAND}\``;
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

async function readIfPresent(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
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

// drizzle-kit numbers a new migration with the journal's last idx plus one, and writes its snapshot
// over any snapshot already holding that number.
function drizzleKitNumber(journal) {
  const last = journal.entries.at(-1);
  return padded(last === undefined ? 0 : last.idx + 1);
}

export async function generateCloudMigration({ folder, runDrizzleKit }) {
  const before = await readMigrationFolder(folder);
  const journalBytes = await readFile(journalPath(folder));
  const overwrittenPath = join(folder, "meta", snapshotName(drizzleKitNumber(before.journal)));
  const overwrittenBytes = await readIfPresent(overwrittenPath);
  const pathsBefore = new Set(await folderPaths(folder));

  async function restore() {
    for (const path of await folderPaths(folder)) {
      if (!pathsBefore.has(path)) await rm(join(folder, path));
    }
    if (overwrittenBytes !== undefined) await writeFile(overwrittenPath, overwrittenBytes);
    await writeFile(journalPath(folder), journalBytes);
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

function runPnpm(args) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0)
    throw new Error(`pnpm ${args.join(" ")} exited with status ${result.status}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
  const { generated } = await generateCloudMigration({
    folder: CLOUD_MIGRATIONS_FOLDER,
    runDrizzleKit: async () =>
      runPnpm(["--filter", "@purosur/cloud", "exec", "drizzle-kit", "generate", ...args]),
  });
  if (generated === undefined) {
    console.log("No cloud migration generated.");
  } else {
    runPnpm([
      "exec",
      "biome",
      "format",
      "--write",
      journalPath(CLOUD_MIGRATIONS_FOLDER),
      join(CLOUD_MIGRATIONS_FOLDER, "meta", snapshotName(tagNumber(generated))),
    ]);
    console.log(`Cloud migration ${CLOUD_MIGRATIONS_FOLDER}/${generated}.sql`);
  }
}
