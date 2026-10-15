import { execFile } from "node:child_process";
import { access, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { findInstaller } from "./publish-pos-update.mjs";

const LOG_PREFIX = "installer-app-code";
const APP_ARCHIVE = ["$PLUGINSDIR", "app-64.7z"];
const APP_CODE = ["resources", "app.asar"];

async function extractWith7z(archive, outputDir) {
  await promisify(execFile)("7z", ["x", "-y", `-o${outputDir}`, archive], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function requireExtracted(path, description) {
  try {
    await access(path);
  } catch {
    throw new Error(`${LOG_PREFIX}: ${description}`);
  }
  return path;
}

export async function extractAppCode({ installerDir, outputDir, extract = extractWith7z }) {
  const installer = await findInstaller(installerDir);
  const installerContents = join(outputDir, "installer");
  await extract(installer, installerContents);
  const appArchive = await requireExtracted(
    join(installerContents, ...APP_ARCHIVE),
    `${installer} holds no ${APP_ARCHIVE.join("/")}`,
  );
  const appContents = join(outputDir, "app");
  await extract(appArchive, appContents);
  return requireExtracted(
    join(appContents, ...APP_CODE),
    `the app archive of ${installer} holds no ${APP_CODE.join("/")}`,
  );
}

export async function runCli({
  env = process.env,
  extract = extractWith7z,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const missing = ["INSTALLER_DIR", "OUTPUT_DIR", "GITHUB_OUTPUT"].filter((name) => !env[name]);
  if (missing.length > 0) {
    logError(`${LOG_PREFIX}: ${missing.join(", ")} required`);
    return 1;
  }
  try {
    const appAsar = await extractAppCode({
      installerDir: env.INSTALLER_DIR,
      outputDir: env.OUTPUT_DIR,
      extract,
    });
    log(`${LOG_PREFIX}: extracted ${appAsar}`);
    await appendOutput(env.GITHUB_OUTPUT, `app_asar=${appAsar}\n`);
    return 0;
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  }
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
