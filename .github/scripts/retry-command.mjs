import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

export const RETRY_DELAYS_SECONDS = [30, 60, 120, 240];

const USAGE = "usage: retry-command.mjs --title <step> --failure <message> -- <command> [args...]";
const OPTIONS = new Set(["--title", "--failure"]);

function parseArguments(argv) {
  const separator = argv.indexOf("--");
  if (separator === -1 || separator === argv.length - 1) return null;
  const options = argv.slice(0, separator);
  if (options.length % 2 !== 0) return null;

  const values = new Map();
  for (let i = 0; i < options.length; i += 2) {
    const [name, value] = [options[i], options[i + 1]];
    if (!OPTIONS.has(name) || values.has(name) || value === "") return null;
    values.set(name, value);
  }
  if (values.size !== OPTIONS.size) return null;

  const [command, ...args] = argv.slice(separator + 1);
  return { title: values.get("--title"), failure: values.get("--failure"), command, args };
}

function escapeData(text) {
  return text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeProperty(text) {
  return escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

export function runInheritingOutput(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => {
      console.error(`${command} could not be started: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function runCli({
  argv = process.argv.slice(2),
  run = runInheritingOutput,
  sleep = (seconds) => wait(seconds * 1000),
  log = console.log,
} = {}) {
  const parsed = parseArguments(argv);
  if (parsed === null) {
    log(USAGE);
    return 1;
  }

  const { title, failure, command, args } = parsed;
  const attempts = RETRY_DELAYS_SECONDS.length + 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if ((await run(command, args)) === 0) return 0;
    if (attempt < attempts) {
      const delay = RETRY_DELAYS_SECONDS[attempt - 1];
      log(`${title} failed (attempt ${attempt}/${attempts}); trying again in ${delay} s`);
      await sleep(delay);
    }
  }
  log(`::error title=${escapeProperty(title)}::${escapeData(failure)} after ${attempts} attempts`);
  return 1;
}

if (import.meta.main) {
  runCli().then((exitCode) => process.exit(exitCode));
}
