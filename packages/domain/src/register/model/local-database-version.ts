export type LocalDatabaseVersion = "known" | "newer_than_version";

export function localDatabaseVersionOf({
  applied,
  known,
}: {
  applied: readonly string[];
  known: readonly string[];
}): LocalDatabaseVersion {
  const knownNames = new Set(known);
  return applied.every((name) => knownNames.has(name)) ? "known" : "newer_than_version";
}
