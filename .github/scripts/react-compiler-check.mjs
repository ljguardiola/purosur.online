import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { transformAsync } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";

const REACT_ROOTS = ["apps/backoffice/src", "apps/pos/src/renderer", "packages/ui/src"];

// These are the only logger event kinds that mean a function was not compiled: CompileError is a
// bailout the compiler hit while lowering a component or hook, and PipelineError is a crash in the
// compiler itself. CompileSkip only fires for an explicit opt-out directive, and CompileDiagnostic
// and CompileSuccess do not mean the function was left unmemoized.
const UNCOMPILED_EVENT_KINDS = new Set(["CompileError", "PipelineError"]);

function reasonOf(event) {
  return event.detail?.reason ?? event.detail?.options?.reason ?? event.data ?? event.kind;
}

function lineOf(event) {
  return event.fnLoc?.start?.line ?? event.detail?.loc?.start?.line;
}

async function violationsOf({ path, source }) {
  const events = [];
  await transformAsync(source, {
    filename: path,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [
        reactCompiler,
        {
          logger: {
            logEvent(_filename, event) {
              events.push(event);
            },
          },
        },
      ],
    ],
  });

  return events
    .filter((event) => UNCOMPILED_EVENT_KINDS.has(event.kind))
    .map((event) => ({ path, line: lineOf(event), reason: reasonOf(event) }));
}

export async function checkFiles(files) {
  const violations = await Promise.all(files.map(violationsOf));
  return violations.flat();
}

export function describeViolation({ path, line, reason }) {
  return `${path}:${line}: ${reason}`;
}

export function findTrackedFiles(cwd = process.cwd()) {
  return execFileSync("git", ["ls-files", "-z", ...REACT_ROOTS], { cwd, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "" && /\.tsx?$/.test(path) && existsSync(join(cwd, path)))
    .sort();
}

export async function runCli({
  cwd = process.cwd(),
  findFiles = findTrackedFiles,
  readFile = (path) => readFileSync(path, "utf8"),
  logError = console.error,
} = {}) {
  const paths = findFiles(cwd);
  const files = paths.map((path) => ({ path, source: readFile(join(cwd, path)) }));
  const violations = await checkFiles(files);

  if (violations.length === 0) return 0;

  for (const violation of violations) logError(describeViolation(violation));
  logError(
    `react-compiler-check: the React Compiler could not compile ${violations.length} function(s).`,
  );
  return 1;
}

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
