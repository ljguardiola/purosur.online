import type { CoreRefusedMessage } from "@purosur/contracts";
import type { StartedLocalDatabase } from "./local-database-startup";

export function refuseNewerDatabase(
  started: StartedLocalDatabase | undefined,
  deps: { post: (message: CoreRefusedMessage) => void; log: (line: string) => void },
): boolean {
  if (started?.kind !== "newer_than_version") {
    return false;
  }
  deps.log("core: refusing a local database migrated by a newer version");
  deps.post({ type: "core-refused", reason: "newer_database" });
  return true;
}
