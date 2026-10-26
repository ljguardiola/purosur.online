export function runsCloudZoneRulesVersion(
  registerVersion: string | null,
  cloudVersion: string,
): boolean {
  return registerVersion === cloudVersion;
}
