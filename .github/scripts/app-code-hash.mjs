import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

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
