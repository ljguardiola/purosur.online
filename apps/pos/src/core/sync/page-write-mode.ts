export type PageWriteMode = "pull" | "redelivery";

// A pull skips a version the register already holds; a redelivery rewrites it, since the cloud
// serves every row as it is now and a column added after the register first received it is still empty.
export function versionAccepted(mode: PageWriteMode): ">" | ">=" {
  return mode === "pull" ? ">" : ">=";
}
