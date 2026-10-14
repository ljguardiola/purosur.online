import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { offsiteDumpCommand } from "./backups/offsite-dump.js";
import { dumpToFile, offsiteDumpCommands } from "./backups/offsite-dump-pipeline.js";

if (import.meta.main) {
  const exitCode = await offsiteDumpCommand(process.env, {
    now: () => new Date(),
    fetch: (request) => fetch(request),
    workspace: async () => {
      const directory = await mkdtemp(join(tmpdir(), "offsite-dump-"));
      return {
        dumpPath: join(directory, "dump.age"),
        cleanup: () => rm(directory, { recursive: true, force: true }),
      };
    },
    dumpToFile: (request) =>
      dumpToFile(
        offsiteDumpCommands({
          databaseUrl: request.databaseUrl,
          ageRecipient: request.ageRecipient,
        }),
        request.outputPath,
      ),
    readDump: (path) => Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
    log: (line) => {
      if (line.startsWith("offsite-dump: shipped")) {
        console.log(line);
      } else {
        console.error(line);
      }
    },
  });
  process.exit(exitCode);
}
