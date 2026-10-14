import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface PipelineCommand {
  file: string;
  args: string[];
}

export interface DumpedFile {
  sizeBytes: number;
  sha256: string;
}

const STDERR_TAIL_BYTES = 2000;

export function offsiteDumpCommands(input: { databaseUrl: string; ageRecipient: string }): {
  dump: PipelineCommand;
  encrypt: PipelineCommand;
} {
  return {
    dump: {
      file: "pg_dump",
      args: [
        "--format=custom",
        // graphile-worker's tables have row-level security with no policy for this role, which
        // makes pg_dump refuse them; its own migration recreates the schema on a restore.
        "--exclude-schema=graphile_worker",
        `--dbname=${input.databaseUrl}`,
      ],
    },
    encrypt: { file: "age", args: ["--encrypt", "--recipient", input.ageRecipient] },
  };
}

interface Running {
  process: ChildProcess;
  finished: Promise<void>;
}

function start(label: string, command: PipelineCommand): Running {
  const child = spawn(command.file, command.args, { stdio: ["pipe", "pipe", "pipe"] });
  let stderrTail = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-STDERR_TAIL_BYTES);
  });
  const finished = new Promise<void>((resolve, reject) => {
    child.once("error", () => {
      reject(new Error(`the ${label} command could not be started`));
    });
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const how = code === null ? `was stopped by ${signal}` : `exited with code ${code}`;
      const detail = stderrTail.trim();
      reject(new Error(`the ${label} command ${how}${detail ? `: ${detail}` : ""}`));
    });
  });
  finished.catch(() => undefined);
  return { process: child, finished };
}

/**
 * Runs `dump | encrypt` into a file, hashing what is written. A dump that fails midway still
 * leaves the encrypt command a clean end of input, so both exit codes are checked.
 */
export async function dumpToFile(
  commands: { dump: PipelineCommand; encrypt: PipelineCommand },
  outputPath: string,
): Promise<DumpedFile> {
  const dump = start("dump", commands.dump);
  const encrypt = start("encrypt", commands.encrypt);
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const counted = new PassThrough();
  counted.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    sizeBytes += chunk.length;
  });

  const copy = Promise.all([
    dump.process.stdout && encrypt.process.stdin
      ? pipeline(dump.process.stdout, encrypt.process.stdin)
      : Promise.resolve(),
    encrypt.process.stdout
      ? pipeline(encrypt.process.stdout, counted, createWriteStream(outputPath))
      : Promise.resolve(),
  ]);

  const outcomes = await Promise.allSettled([dump.finished, encrypt.finished, copy]);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      throw outcome.reason;
    }
  }
  return { sizeBytes, sha256: hash.digest("hex") };
}
