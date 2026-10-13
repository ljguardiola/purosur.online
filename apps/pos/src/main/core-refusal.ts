import type { CoreRefusedMessage } from "@purosur/contracts";

export function isCoreRefusedMessage(message: unknown): message is CoreRefusedMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "core-refused" &&
    "reason" in message &&
    message.reason === "newer_database"
  );
}

export function reportCoreRefusal(deps: {
  log: (line: string) => void;
  captureMessage: (message: string, level: "fatal") => void;
}): void {
  const line = "core process: refused a local database migrated by a newer version";
  deps.log(line);
  deps.captureMessage(line, "fatal");
}
