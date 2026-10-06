import { globSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { pathToFileURL } from "node:url";

const LOG_PREFIX = "mutation-shard";

export function filesToMutate({ root, patterns }) {
  const selected = new Set();
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      for (const file of selected) {
        if (matchesGlob(file, pattern.slice(1))) {
          selected.delete(file);
        }
      }
    } else {
      for (const file of globSync(pattern, { cwd: root })) {
        selected.add(file.replaceAll("\\", "/"));
      }
    }
  }
  return [...selected].sort();
}

export function shardOfFiles(files, { index, total }) {
  if (total > files.length) {
    throw new Error(
      `${total} shards for ${files.length} files would leave a shard testing nothing`,
    );
  }
  return files.filter((_, position) => position % total === index);
}

function parseShard(env) {
  const [index, total] = [env.MUTATION_SHARD_INDEX, env.MUTATION_SHARD_TOTAL].map((value) =>
    /^\d+$/.test(value ?? "") ? Number(value) : Number.NaN,
  );
  return index < total ? { index, total } : undefined;
}

export async function runCli({
  cwd = process.cwd(),
  env = process.env,
  log = console.log,
  logError = console.error,
} = {}) {
  const shard = parseShard(env);
  if (!shard) {
    logError(
      `${LOG_PREFIX}: MUTATION_SHARD_INDEX and MUTATION_SHARD_TOTAL must name one of the shards, from 0 to the number of shards minus one`,
    );
    return 1;
  }
  const { default: config } = await import(pathToFileURL(join(cwd, "stryker.config.mjs")).href);
  try {
    log(shardOfFiles(filesToMutate({ root: cwd, patterns: config.mutate }), shard).join(","));
    return 0;
  } catch (error) {
    logError(`${LOG_PREFIX}: ${error.message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await runCli());
}
