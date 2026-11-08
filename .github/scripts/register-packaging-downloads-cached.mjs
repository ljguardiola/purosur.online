import { readFileSync } from "node:fs";
import { win32 } from "node:path";
import { isMap, isSeq, LineCounter, parseDocument } from "yaml";

const CACHE_DIR_VARIABLE = "ELECTRON_BUILDER_CACHE";
const ENV_REFERENCE = new RegExp(`^\\$\\{\\{\\s*env\\.${CACHE_DIR_VARIABLE}\\s*\\}\\}$`);
const ABSOLUTE_RUNNER_DIRECTORY =
  /^\$\{\{\s*(github\.workspace|runner\.temp|runner\.tool_cache)\s*\}\}/;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(command, name) {
  return new RegExp(`(?<![\\w:-])${escapeRegExp(name)}(?![\\w:-])`).test(command);
}

export function packagingScriptNames({ scripts = {} }) {
  const packaging = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, command] of Object.entries(scripts)) {
      if (packaging.has(name)) continue;
      if (["electron-builder", ...packaging].some((target) => mentions(command, target))) {
        packaging.add(name);
        grew = true;
      }
    }
  }
  return [...packaging];
}

function cacheDirectoryIn(...envs) {
  const nearest = envs.find((env) => isMap(env) && env.has(CACHE_DIR_VARIABLE));
  const value = nearest?.get(CACHE_DIR_VARIABLE);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function isAbsoluteOnRunner(directory) {
  return ABSOLUTE_RUNNER_DIRECTORY.test(directory) || win32.parse(directory).root !== "";
}

function usesCache(step, actions) {
  const uses = step.get("uses");
  return typeof uses === "string" && actions.some((action) => uses.startsWith(`${action}@`));
}

function cachesDirectory(step, directory, outerEnvs) {
  const path = step.getIn(["with", "path"]);
  if (typeof path !== "string") return false;
  const stepDirectory = cacheDirectoryIn(step.get("env", true), ...outerEnvs);
  return path
    .split("\n")
    .map((line) => line.trim())
    .some((line) => (ENV_REFERENCE.test(line) ? stepDirectory === directory : line === directory));
}

function violationsOf(doc, lineCounter, packagingScripts) {
  const jobs = doc.get("jobs", true);
  if (!isMap(jobs)) return [];

  const violations = [];
  for (const { key, value: job } of jobs.items) {
    const steps = isMap(job) ? job.get("steps", true) : undefined;
    if (!isSeq(steps)) continue;
    const stepList = steps.items.filter(isMap);
    stepList.forEach((step, index) => {
      const run = step.get("run");
      if (typeof run !== "string") return;
      if (!["electron-builder", ...packagingScripts].some((name) => mentions(run, name))) return;

      const report = (message) =>
        violations.push({
          line: lineCounter.linePos(step.range[0]).line,
          message: `${key} job ${message}`,
        });
      const outerEnvs = [job.get("env", true), doc.get("env", true)];
      const directory = cacheDirectoryIn(step.get("env", true), ...outerEnvs);
      if (directory === undefined) {
        report(
          `packages the register without ${CACHE_DIR_VARIABLE}, so electron-builder downloads its tools into a directory no step restores`,
        );
        return;
      }
      if (!isAbsoluteOnRunner(directory)) {
        report(
          `packages the register with ${CACHE_DIR_VARIABLE} set to ${directory}, which is not absolute, so electron-builder ignores it and downloads its tools into a directory no step restores`,
        );
        return;
      }
      const before = stepList.slice(0, index);
      const after = stepList.slice(index + 1);
      const restores = before.some(
        (other) =>
          usesCache(other, ["actions/cache", "actions/cache/restore"]) &&
          cachesDirectory(other, directory, outerEnvs),
      );
      if (!restores) {
        report(
          `packages the register before any step restores ${directory}, so a gateway time-out of electron-builder's downloads fails it`,
        );
      }
      const saves =
        before.some(
          (other) =>
            usesCache(other, ["actions/cache"]) && cachesDirectory(other, directory, outerEnvs),
        ) ||
        after.some(
          (other) =>
            usesCache(other, ["actions/cache/save"]) &&
            cachesDirectory(other, directory, outerEnvs),
        );
      if (!saves) {
        report(
          `never saves electron-builder's cache ${directory} after packaging, so no later run can restore it`,
        );
      }
    });
  }
  return violations;
}

export function findPackagingCacheViolations(source, packagingScripts) {
  const lineCounter = new LineCounter();
  return violationsOf(parseDocument(source, { lineCounter }), lineCounter, packagingScripts);
}

export function checkFiles(
  paths,
  packagingScripts,
  readFile = (path) => readFileSync(path, "utf8"),
) {
  return paths.flatMap((path) => {
    const lineCounter = new LineCounter();
    const doc = parseDocument(readFile(path), { lineCounter });
    if (doc.errors.length > 0) {
      const [error] = doc.errors;
      return [
        { path, line: error.linePos[0].line, message: `does not parse as YAML: ${error.message}` },
      ];
    }
    return violationsOf(doc, lineCounter, packagingScripts).map((violation) => ({
      path,
      ...violation,
    }));
  });
}
