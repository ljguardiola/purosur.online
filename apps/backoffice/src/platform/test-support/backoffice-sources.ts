import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

function pathsUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`;
    return entry.isDirectory() ? pathsUnder(path) : [path];
  });
}

function isSource(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.includes("/test-support/");
}

export function backofficeSources(): { path: string; text: string }[] {
  return pathsUnder(SRC)
    .filter(isSource)
    .map((absolute) => ({
      path: absolute.slice(SRC.length + 1),
      text: readFileSync(absolute, "utf8"),
    }));
}
