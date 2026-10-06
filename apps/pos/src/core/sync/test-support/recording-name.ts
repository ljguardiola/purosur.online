const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function recordingNameFrom(
  requested: string | undefined,
  existingFiles: readonly string[],
): string {
  if (requested === undefined || requested === "") {
    throw new Error("Set REGISTER_PUSH_RECORDING to the name of the recording");
  }
  if (!KEBAB_CASE.test(requested)) {
    throw new Error(`The recording name "${requested}" is not kebab-case`);
  }
  if (existingFiles.includes(`${requested}.json`)) {
    throw new Error(
      `A recording named "${requested}" already exists; recordings are never overwritten`,
    );
  }
  return requested;
}
