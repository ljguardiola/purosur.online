import { readdirSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "../launch-app";

const PACKAGED_FOLDER = join(APP_DIR, "release", "staging", "win-unpacked");
export const RESOURCES_FOLDER = join(PACKAGED_FOLDER, "resources");

export function packagedExecutable(): string {
  const executables = readdirSync(PACKAGED_FOLDER).filter((name) => name.endsWith(".exe"));
  if (executables.length !== 1 || executables[0] === undefined) {
    throw new Error(
      `${PACKAGED_FOLDER} must hold exactly one executable, run pack:staging first; found ${executables.length}`,
    );
  }
  return join(PACKAGED_FOLDER, executables[0]);
}

// A packaged register reads its channel from resources/channel.json and keeps its data in the
// staging channel's folder under the user's application data, which a developer's machine may hold
// for real; only a CI runner, whose home is empty, is safe to start it on.
export function requireCiRunner(): void {
  if (process.env["CI"] !== "true") {
    throw new Error(
      "the packaged register keeps its data in the staging channel's folder; run it on a CI runner only",
    );
  }
}
