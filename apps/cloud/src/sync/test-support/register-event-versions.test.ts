import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { eventVersionsBuiltBy } from "./register-event-versions.js";

const SOURCE_DIR = "/register/src";

function programOf(sources: Record<string, string>): ts.Program {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const files = new Map(
    Object.entries(sources).map(([name, source]) => [path.join(SOURCE_DIR, name), source]),
  );
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (fileName) => files.get(fileName) ?? readFile(fileName);
  host.fileExists = (fileName) => files.has(fileName) || fileExists(fileName);
  return ts.createProgram([...files.keys()], options, host);
}

function versionsIn(sources: Record<string, string>) {
  return eventVersionsBuiltBy(programOf(sources), SOURCE_DIR);
}

describe("eventVersionsBuiltBy", () => {
  it("reads the type and version of an event written as literals", () => {
    expect(
      versionsIn({
        "open.ts": `export const opened = () => ({ event_type: "cash_session_opened", schema_version: 1, payload: {} });`,
      }),
    ).toEqual({ versions: ["cash_session_opened v1"], unreadable: [] });
  });

  it("reads a version and a type held in constants, in another module too", () => {
    expect(
      versionsIn({
        "versions.ts": `export const SALE_COMPLETED_VERSION = 3;\nexport const SALE_COMPLETED = "sale_completed";`,
        "sale.ts": `import { SALE_COMPLETED, SALE_COMPLETED_VERSION } from "./versions";
const schema_version = SALE_COMPLETED_VERSION;
export const completed = () => ({ event_type: SALE_COMPLETED, schema_version });`,
      }),
    ).toEqual({ versions: ["sale_completed v3"], unreadable: [] });
  });

  it("lists each version once, sorted, however many builders write it", () => {
    expect(
      versionsIn({
        "a.ts": `export const a = () => ({ event_type: "sale_completed", schema_version: 2 });
export const b = () => ({ event_type: "cash_session_closed", schema_version: 1 });`,
        "b.ts": `export const c = () => ({ event_type: "sale_completed", schema_version: 2 });`,
      }).versions,
    ).toEqual(["cash_session_closed v1", "sale_completed v2"]);
  });

  it("reports a builder whose version is not one known number", () => {
    expect(
      versionsIn({
        "draft.ts": `export const draft = (version: number) => ({ event_type: "sale_completed", schema_version: version });`,
      }),
    ).toEqual({ versions: [], unreadable: ["draft.ts:1"] });
  });

  it("reports a builder whose version could be one of several numbers", () => {
    expect(
      versionsIn({
        "draft.ts": `declare const late: boolean;
export const draft = () => ({ event_type: "sale_completed", schema_version: late ? 1 : 2 });`,
      }),
    ).toEqual({ versions: [], unreadable: ["draft.ts:2"] });
  });

  it("reports a builder whose type is not one known text or is written elsewhere", () => {
    expect(
      versionsIn({
        "drafts.ts": `export const typed = (type: string) => ({ event_type: type, schema_version: 1 });
const header = { event_type: "sale_completed" };
export const spread = () => ({ ...header, schema_version: 2 });`,
      }),
    ).toEqual({ versions: [], unreadable: ["drafts.ts:1", "drafts.ts:3"] });
  });

  it("reports a version assigned to an event after it was built", () => {
    expect(
      versionsIn({
        "bump.ts": `export function bump(event: { event_type: string; schema_version: number }) {
  event.schema_version = 2;
}`,
      }),
    ).toEqual({ versions: [], unreadable: ["bump.ts:2"] });
  });

  it("ignores a schema_version that holds no number, such as a wire schema's field", () => {
    expect(
      versionsIn({
        "schema.ts": `const int = () => ({ positive: () => ({}) });
export const shape = { event_type: int(), schema_version: int().positive() };`,
      }),
    ).toEqual({ versions: [], unreadable: [] });
  });

  it("ignores code outside the given source folder", () => {
    expect(
      eventVersionsBuiltBy(
        programOf({ "open.ts": `export const o = { event_type: "x", schema_version: 1 };` }),
        "/elsewhere",
      ),
    ).toEqual({ versions: [], unreadable: [] });
  });
});
