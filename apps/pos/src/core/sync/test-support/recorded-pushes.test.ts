import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { recordedPushes } from "./recorded-pushes.js";
import { eventVersionsBuiltBy } from "./register-event-versions.js";

const REPO_DIR = fileURLToPath(new URL("../../../../../../", import.meta.url));
const REGISTER_DIR = fileURLToPath(new URL("../../../../", import.meta.url));

const RECORDED_PUSHES = recordedPushes();

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

describe("the recorded pushes", () => {
  let builtByTheRegister: ReturnType<typeof eventVersionsBuiltBy>;

  beforeAll(() => {
    builtByTheRegister = eventVersionsBuiltBy(registerCoreProgram(), REPO_DIR);
  });

  it("can tell the version of every event the register's core builds", () => {
    expect(builtByTheRegister.unreadable).toEqual([]);
    expect(builtByTheRegister.versions).not.toEqual([]);
  });

  it("hold an event of every version the register's core builds", () => {
    const recorded = new Set(
      RECORDED_PUSHES.flatMap(({ push }) =>
        push.events.map((event) => `${event.event_type} v${event.schema_version}`),
      ),
    );

    expect(builtByTheRegister.versions.filter((version) => !recorded.has(version))).toEqual([]);
  });
});
