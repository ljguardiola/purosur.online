import { readFileSync } from "node:fs";

interface AsarDirectory {
  files: Record<string, AsarEntry>;
}

interface AsarEntry {
  files?: Record<string, AsarEntry>;
  offset?: string;
  size?: number;
}

// An asar archive opens with two Chromium pickles: the first holds the second's size, the second
// the header's JSON string. File offsets count from where the second pickle ends.
export function readAsarFile(archivePath: string, filePath: string): Buffer {
  const archive = readFileSync(archivePath);
  const headerLength = archive.readUInt32LE(12);
  const header: AsarDirectory = JSON.parse(
    archive.subarray(16, 16 + headerLength).toString("utf8"),
  );
  const contentStart = 8 + archive.readUInt32LE(4);
  let entry: AsarEntry = header;
  for (const name of filePath.split("/")) {
    const next = entry.files?.[name];
    if (next === undefined) {
      throw new Error(`${archivePath} holds no ${filePath}`);
    }
    entry = next;
  }
  if (entry.offset === undefined || entry.size === undefined) {
    throw new Error(`${filePath} in ${archivePath} is not a packed file`);
  }
  const start = contentStart + Number(entry.offset);
  return archive.subarray(start, start + entry.size);
}
