// Proves two or more app.asar files carry identical app code by comparing their sha256 hashes.
// Used both to compare the production and staging installers built from the same out/, and to
// compare two independent builds of one commit (see package-pos.yml's independent-build job).

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * @param {string[]} paths
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validatePathCount(paths) {
  if (paths.length < 2) {
    return { ok: false, reason: `at least two app.asar paths are required, got ${paths.length}` };
  }
  return { ok: true };
}

/**
 * Streams the file instead of reading it whole, since app.asar can be sizable.
 *
 * @param {string} filePath
 * @returns {Promise<{ ok: true, hash: string } | { ok: false, reason: string }>}
 */
export async function hashAsarFile(filePath) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ok: false, reason: `${filePath} does not exist` };
    }
    throw error;
  }
  if (fileStat.size === 0) {
    return { ok: false, reason: `${filePath} is empty` };
  }

  const hash = await new Promise((resolve, reject) => {
    const hasher = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hasher.update(chunk));
    stream.on("end", () => resolve(hasher.digest("hex")));
  });
  return { ok: true, hash };
}

/**
 * @param {Array<{ path: string, hash: string }>} entries
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function compareHashes(entries) {
  const [first, ...rest] = entries;
  const mismatch = rest.find((entry) => entry.hash !== first.hash);
  if (mismatch) {
    return {
      ok: false,
      reason: `app.asar differs: ${first.path} (${first.hash}) vs ${mismatch.path} (${mismatch.hash})`,
    };
  }
  return { ok: true };
}

async function runCli() {
  const paths = process.argv.slice(2);

  const countCheck = validatePathCount(paths);
  if (!countCheck.ok) {
    console.error(`::error::${countCheck.reason}`);
    process.exit(1);
    return;
  }

  const entries = [];
  for (const filePath of paths) {
    const result = await hashAsarFile(filePath);
    if (!result.ok) {
      console.error(`::error::${result.reason}`);
      process.exit(1);
      return;
    }
    console.log(`${filePath}  ${result.hash}`);
    entries.push({ path: filePath, hash: result.hash });
  }

  const comparison = compareHashes(entries);
  if (!comparison.ok) {
    console.error(`::error::${comparison.reason}`);
    process.exit(1);
    return;
  }

  console.log(`same-app-code: all ${entries.length} app.asar files match`);
}

// fileURLToPath rather than a URL().pathname comparison, so this also matches process.argv[1] on
// Windows runners (a URL pathname keeps forward slashes and a leading slash before the drive
// letter; a Windows argv path does not).
const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
