import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { createEngine } from "@secretlint/node";

const CONFIG_FILE_NAME = ".secretlintrc.json";
const SECRET_CARRIER_NAME_RE = /^(\.env(\..*)?|.*\.(env|key|pem|crt|csr|p12|pfx))$/;
const EXAMPLE_ENV_NAME_RE = /^(\.env|.*\.env)\.example$/;

function isSecretCarrier(path) {
  const name = basename(path);
  return SECRET_CARRIER_NAME_RE.test(name) && !EXAMPLE_ENV_NAME_RE.test(name);
}

function secretCarrierViolationsOf(paths) {
  return paths.filter(isSecretCarrier).map((path) => ({
    path,
    line: 1,
    message: `a ${basename(path)} file holds secrets and never lives in the repository`,
  }));
}

export function findTrackedFiles(cwd = process.cwd()) {
  return execFileSync("git", ["ls-files", "-z"], { cwd, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "")
    .filter((path) => existsSync(join(cwd, path)))
    .sort();
}

export async function checkFiles(
  paths,
  { cwd = process.cwd(), configFilePath = join(cwd, CONFIG_FILE_NAME) } = {},
) {
  if (paths.length === 0) return [];

  const engine = await createEngine({
    cwd,
    formatter: "json",
    configFilePath,
    maskSecrets: true,
  });

  const { output } = await engine.executeOnFiles({
    filePathList: paths.map((path) => join(cwd, path)),
  });

  const contentViolations = JSON.parse(output).flatMap((result) =>
    result.messages.map((message) => ({
      path: relative(cwd, result.filePath),
      line: message.loc.start.line,
      message: message.message,
    })),
  );

  return [...secretCarrierViolationsOf(paths), ...contentViolations];
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
