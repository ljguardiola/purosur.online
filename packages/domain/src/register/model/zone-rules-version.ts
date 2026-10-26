export type ZoneRulesVersionReport =
  | { zone_rules_version?: undefined }
  | { zone_rules_version: string | null };

export function runsCloudZoneRulesVersion(
  registerVersion: string | null,
  cloudVersion: string,
): boolean {
  return registerVersion === cloudVersion;
}
