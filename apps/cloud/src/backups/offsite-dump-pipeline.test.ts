import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dumpToFile, offsiteDumpCommands, type PipelineCommand } from "./offsite-dump-pipeline.js";

function node(script: string): PipelineCommand {
  return { file: process.execPath, args: ["-e", script] };
}

const PRODUCE = node("process.stdout.write('plain-dump-bytes')");
const UPPERCASE = node(
  "process.stdin.on('data', (chunk) => process.stdout.write(String(chunk).toUpperCase()))",
);

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "offsite-dump-pipeline-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("dumpToFile", () => {
  it("writes what the dump command produces through the encrypt command", async () => {
    const outputPath = join(directory, "out");

    await dumpToFile({ dump: PRODUCE, encrypt: UPPERCASE }, outputPath);

    expect(await readFile(outputPath, "utf8")).toBe("PLAIN-DUMP-BYTES");
  });

  it("reports the size and SHA-256 of the file it wrote", async () => {
    const outputPath = join(directory, "out");

    const result = await dumpToFile({ dump: PRODUCE, encrypt: UPPERCASE }, outputPath);

    expect(result).toEqual({
      sizeBytes: "PLAIN-DUMP-BYTES".length,
      sha256: createHash("sha256").update("PLAIN-DUMP-BYTES").digest("hex"),
    });
  });

  it("fails when the dump command exits non-zero, even if encryption succeeded on what it got", async () => {
    const failing = node("process.stdout.write('partial'); process.exit(3)");

    await expect(
      dumpToFile({ dump: failing, encrypt: UPPERCASE }, join(directory, "out")),
    ).rejects.toThrow("the dump command exited with code 3");
  });

  it("fails when the encrypt command exits non-zero", async () => {
    const failing = node("process.stdin.resume(); process.stdin.on('end', () => process.exit(4))");

    await expect(
      dumpToFile({ dump: PRODUCE, encrypt: failing }, join(directory, "out")),
    ).rejects.toThrow("the encrypt command exited with code 4");
  });

  it("includes what the failing command wrote to stderr", async () => {
    const failing = node("console.error('pg_dump: error: connection refused'); process.exit(1)");

    await expect(
      dumpToFile({ dump: failing, encrypt: UPPERCASE }, join(directory, "out")),
    ).rejects.toThrow("pg_dump: error: connection refused");
  });

  it("fails when a command cannot be started", async () => {
    const missing = { file: join(directory, "no-such-command"), args: [] };

    await expect(
      dumpToFile({ dump: missing, encrypt: UPPERCASE }, join(directory, "out")),
    ).rejects.toThrow("the dump command could not be started");
  });

  it("does not leave the command's arguments in its failure message", async () => {
    const failing = {
      file: process.execPath,
      args: ["-e", "process.exit(1)", "--", "--dbname=postgresql://u:s3cret@host/db"],
    };

    const failure = await dumpToFile({ dump: failing, encrypt: UPPERCASE }, join(directory, "out"))
      .then(() => undefined)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain("s3cret");
  });
});

describe("offsiteDumpCommands", () => {
  const commands = offsiteDumpCommands({
    databaseUrl: "postgresql://offsite_dump:pw@db.internal:5432/app",
    ageRecipient: "age1fictionalrecipient",
  });

  it("dumps the database in pg_dump's custom archive format", () => {
    expect(commands.dump.file).toBe("pg_dump");
    expect(commands.dump.args).toContain("--format=custom");
    expect(commands.dump.args).toContain(
      "--dbname=postgresql://offsite_dump:pw@db.internal:5432/app",
    );
  });

  it("leaves out graphile-worker's queue, which its row-level security hides from this role and its own migration recreates", () => {
    expect(commands.dump.args).toContain("--exclude-schema=graphile_worker");
  });

  it("encrypts to the recipient's public key alone", () => {
    expect(commands.encrypt).toEqual({
      file: "age",
      args: ["--encrypt", "--recipient", "age1fictionalrecipient"],
    });
  });
});
