import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { parsedConfigOf } from "./typescript-config.mjs";

const TYPE_CHECK_SCRIPT = "verify:static:types";
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TSC_STEP = /^tsc --noEmit(?: -p (\S+))?$/;

export function typeCheckedTsconfigs(script) {
  return script.split("&&").map((rawStep) => {
    const step = rawStep.trim();
    const match = TSC_STEP.exec(step);
    if (match === null) throw new Error(`the type check runs a step that is not tsc: ${step}`);
    const project = match[1];
    if (project === undefined) return "tsconfig.json";
    return project.endsWith(".json") ? project : posix.join(project, "tsconfig.json");
  });
}

function scriptTsconfigs(cwd) {
  const { scripts } = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  return typeCheckedTsconfigs(scripts[TYPE_CHECK_SCRIPT]);
}

function listTrackedFiles(cwd) {
  return execFileSync("git", ["ls-files", "-z"], { cwd, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "");
}

function sharedSourceFiles() {
  const parsed = new Map();
  return (host) => {
    const read = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, ...rest) => {
      const key = `${fileName}\0${JSON.stringify(languageVersion)}`;
      if (!parsed.has(key)) parsed.set(key, read(fileName, languageVersion, ...rest));
      return parsed.get(key);
    };
    return host;
  };
}

function describeDiagnostic(diagnostic, pathOf) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  const { file, start } = diagnostic;
  if (file === undefined || start === undefined) return message;
  const { line, character } = file.getLineAndCharacterOfPosition(start);
  return `${pathOf(file.fileName)}(${line + 1},${character + 1}): ${message}`;
}

export function findTypeCheckGaps(
  cwd,
  { tsconfigs = scriptTsconfigs(cwd), trackedFiles = listTrackedFiles(cwd) } = {},
) {
  const root = resolve(cwd);
  const pathOf = (fileName) => relative(root, fileName).split(sep).join("/");
  const trackedDeclarations = new Set(trackedFiles.filter((path) => DECLARATION_FILE.test(path)));
  const sharing = sharedSourceFiles();
  const checked = new Set();
  const declarationErrors = new Set();
  for (const tsconfig of tsconfigs) {
    const config = parsedConfigOf(join(root, tsconfig));
    const options = { ...config.options, skipLibCheck: false };
    const program = ts.createProgram({
      rootNames: config.fileNames,
      options,
      host: sharing(ts.createCompilerHost(options)),
    });
    for (const sourceFile of program.getSourceFiles()) {
      const path = pathOf(sourceFile.fileName);
      checked.add(path);
      if (!trackedDeclarations.has(path)) continue;
      for (const diagnostic of [
        ...program.getSyntacticDiagnostics(sourceFile),
        ...program.getSemanticDiagnostics(sourceFile),
      ]) {
        declarationErrors.add(describeDiagnostic(diagnostic, pathOf));
      }
    }
  }
  const byPath = (a, b) => a.localeCompare(b, "en");
  return {
    unchecked: trackedFiles
      .filter((path) => TYPESCRIPT_FILE.test(path) && !checked.has(path))
      .sort(byPath),
    declarationErrors: [...declarationErrors].sort(byPath),
  };
}
