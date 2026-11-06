import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { parsedConfigOf } from "./typescript-config.mjs";

const TYPE_CHECK_SCRIPT = "verify:static:types";
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/;
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

export function findUncheckedTypeScriptFiles(
  cwd,
  { tsconfigs = scriptTsconfigs(cwd), trackedFiles = listTrackedFiles(cwd) } = {},
) {
  const root = resolve(cwd);
  const pathOf = (fileName) => relative(root, fileName).split(sep).join("/");
  const sharing = sharedSourceFiles();
  const checked = new Set();
  for (const tsconfig of tsconfigs) {
    const config = parsedConfigOf(join(root, tsconfig));
    const program = ts.createProgram({
      rootNames: config.fileNames,
      options: config.options,
      host: sharing(ts.createCompilerHost(config.options)),
    });
    for (const sourceFile of program.getSourceFiles()) checked.add(pathOf(sourceFile.fileName));
  }
  return trackedFiles
    .filter((path) => TYPESCRIPT_FILE.test(path) && !checked.has(path))
    .sort((a, b) => a.localeCompare(b, "en"));
}
