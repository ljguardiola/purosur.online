import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const configPaths = [
  "tsconfig.json",
  "apps/cloud/tsconfig.json",
  "packages/contracts/tsconfig.json",
];

function parseConfig(configPath) {
  const parsed = ts.getParsedCommandLineOfConfigFile(join(repositoryRoot, configPath), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  assert.ok(parsed, `${configPath} could not be parsed`);
  return parsed.options;
}

function diagnosticCodes(configPath, source) {
  const options = parseConfig(configPath);
  const fixturePath = join(repositoryRoot, dirname(configPath), "src", "type-checker-fixture.ts");
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile;
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    fileName === fixturePath
      ? ts.createSourceFile(fileName, source, languageVersion)
      : getSourceFile(fileName, languageVersion, ...rest);
  const fileExists = host.fileExists;
  host.fileExists = (fileName) => fileName === fixturePath || fileExists(fileName);
  const readFile = host.readFile;
  host.readFile = (fileName) => (fileName === fixturePath ? source : readFile(fileName));

  const program = ts.createProgram([fixturePath], options, host);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code);
}

const rejectedCode = [
  {
    description: "syntax that is not erasable type annotations",
    source: "export enum Color {\n  Red,\n}\n",
    code: 1294,
  },
  {
    description: "a switch case that falls through to the next",
    source: [
      "export function level(value: number): number {",
      "  let result = 0;",
      "  switch (value) {",
      "    case 1:",
      "      result = 1;",
      "    case 2:",
      "      result = 2;",
      "      break;",
      "  }",
      "  return result;",
      "}",
      "",
    ].join("\n"),
    code: 7029,
  },
  {
    description: "a function that does not return on every path",
    source: [
      "export function sign(value: number) {",
      "  if (value > 0) {",
      "    return 1;",
      "  }",
      "}",
      "",
    ].join("\n"),
    code: 7030,
  },
];

for (const configPath of configPaths) {
  test(`${configPath} accepts code that uses none of the rejected constructs`, () => {
    const source = [
      "export function describe(record: Record<string, number>, key: string): string {",
      "  switch (key) {",
      '    case "a":',
      '      return String(record["a"]);',
      "    default:",
      '      return "none";',
      "  }",
      "}",
      "",
    ].join("\n");

    assert.deepEqual(diagnosticCodes(configPath, source), []);
  });

  for (const { description, source, code } of rejectedCode) {
    test(`${configPath} rejects ${description}`, () => {
      assert.deepEqual(diagnosticCodes(configPath, source), [code]);
    });
  }
}
