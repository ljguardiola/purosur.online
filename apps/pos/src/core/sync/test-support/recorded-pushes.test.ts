import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { recordedEvents, sentEvents } from "@purosur/contracts/sync/test-support";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { shapeOf } from "./event-shape.js";
import { eventVersionsBuiltBy } from "./register-event-versions.js";
import { registerSessionPush } from "./register-session-push.js";

const REPO_DIR = fileURLToPath(new URL("../../../../../../", import.meta.url));
const REGISTER_DIR = fileURLToPath(new URL("../../../../", import.meta.url));

const RECORDED_EVENTS = recordedEvents();

function registerCoreProgram(): ts.Program {
  const config = ts.getParsedCommandLineOfConfigFile(`${REGISTER_DIR}tsconfig.json`, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  if (!config) {
    throw new Error("apps/pos/tsconfig.json could not be read");
  }
  return ts.createProgram([`${REGISTER_DIR}src/core/index.ts`], config.options);
}

const RECORD_HINT =
  "A register change that moves an event to a form no recorded event has must bump the event's schema_version, or record the new form with: REGISTER_PUSH_RECORDING=<name> pnpm record:register-push";

function describeEvent(event: { event_type: string; schema_version: number }): string {
  return `${event.event_type} v${event.schema_version}`;
}

describe("the recorded pushes", () => {
  let session: Awaited<ReturnType<typeof registerSessionPush>>;

  beforeAll(async () => {
    session = await registerSessionPush();
  });

  it("hold an event of every version the register's core builds, sent by a register session", () => {
    const program = registerCoreProgram();
    const built = eventVersionsBuiltBy(program, REPO_DIR);
    const sent = new Set(sentEvents(session.sentBody).map(describeEvent));

    expect(
      program
        .getSourceFiles()
        .filter(
          (file) =>
            !file.isDeclarationFile && file.fileName.startsWith(`${REPO_DIR}packages/domain/src/`),
        ),
    ).not.toEqual([]);
    expect(built.versions).not.toEqual([]);
    expect(built.unreadable).toEqual([]);
    expect(built.versions.filter((version) => !sent.has(version))).toEqual([]);
  });

  it("hold an event of the type, version and form of every event a register session sends", () => {
    const unmatched = sentEvents(session.sentBody)
      .filter(
        (sent) =>
          !RECORDED_EVENTS.some(
            (event) =>
              event.event_type === sent.event_type &&
              event.schema_version === sent.schema_version &&
              isDeepStrictEqual(shapeOf(event), shapeOf(sent)),
          ),
      )
      .map(describeEvent);

    expect(unmatched, RECORD_HINT).toEqual([]);
  });
});
