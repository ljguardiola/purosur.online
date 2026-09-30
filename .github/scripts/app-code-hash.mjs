import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

export function validatePathCount(paths) {
  if (paths.length < 2) {
    return { ok: false, reason: `at least two app.asar paths are required, got ${paths.length}` };
  }
  return { ok: true };
}

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

export function compareHashes(entries) {
  const [first, ...rest] = entries;
  const mismatch = rest.find((entry) => entry.hash !== first.hash);
  if (mismatch) {
    return {
      ok: false,
      reason: `app.asar differs: ${first.path} (${first.hash}) vs ${mismatch.path} (${mismatch.hash})`,
      first: first.path,
      mismatch: mismatch.path,
    };
  }
  return { ok: true };
}

// An asar archive opens with two Chromium pickles: the first holds the second's size, the second
// the header's JSON string. File offsets count from where the second pickle ends.
function readAsarFiles(archive) {
  const headerLength = archive.readUInt32LE(12);
  const header = JSON.parse(archive.subarray(16, 16 + headerLength).toString("utf8"));
  const contentStart = 8 + archive.readUInt32LE(4);
  const files = new Map();
  const walk = (directory, prefix) => {
    for (const [name, entry] of Object.entries(directory.files)) {
      const path = `${prefix}${name}`;
      if (entry.files) {
        walk(entry, `${path}/`);
        continue;
      }
      const { offset, ...recorded } = entry;
      const packed = offset !== undefined && !entry.unpacked;
      const start = contentStart + Number(offset);
      const contentHash = packed
        ? createHash("sha256")
            .update(archive.subarray(start, start + entry.size))
            .digest("hex")
        : undefined;
      files.set(path, JSON.stringify({ ...recorded, contentHash }));
    }
  };
  walk(header, "");
  return files;
}

async function readAsarFilesAt(filePath) {
  try {
    return readAsarFiles(await readFile(filePath));
  } catch {
    return undefined;
  }
}

export async function differingFiles(firstPath, secondPath) {
  const first = await readAsarFilesAt(firstPath);
  if (!first) {
    return { ok: false, reason: `${firstPath} is not a readable asar archive` };
  }
  const second = await readAsarFilesAt(secondPath);
  if (!second) {
    return { ok: false, reason: `${secondPath} is not a readable asar archive` };
  }
  const paths = new Set([...first.keys(), ...second.keys()]);
  const files = [...paths].filter((path) => first.get(path) !== second.get(path)).sort();
  return { ok: true, files };
}
