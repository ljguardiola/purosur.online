import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

async function jsonFilesUnder(dir) {
  const found = [];
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      found.push(...(await jsonFilesUnder(path)));
    } else if (dirent.name.endsWith(".json")) {
      found.push(path);
    }
  }
  return found;
}

function isDurationsObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((ms) => typeof ms === "number" && Number.isFinite(ms))
  );
}

function refusedUnlessDurations(value, source) {
  if (!isDurationsObject(value)) {
    throw new Error(`test-durations: ${source} is not an object of file keys to milliseconds`);
  }
  return value;
}

export function encodeDurations(durations) {
  return gzipSync(JSON.stringify(durations)).toString("base64");
}

export function decodeDurations(payload) {
  if (!payload) return {};
  const json = gunzipSync(Buffer.from(payload, "base64")).toString("utf8");
  return refusedUnlessDurations(JSON.parse(json), "the durations payload");
}

export async function readDurations(dir) {
  if (dir === undefined) return {};
  let files;
  try {
    files = await jsonFilesUnder(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
  const merged = {};
  for (const file of files.sort()) {
    Object.assign(merged, refusedUnlessDurations(JSON.parse(await readFile(file, "utf8")), file));
  }
  return merged;
}
