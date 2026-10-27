export type ZoneRulesVersionReport =
  | { zone_rules_version?: undefined }
  | { zone_rules_version: string | null };

export interface ZoneRulesPublication {
  version: string;
  publicationNumber: number;
}

export function runsCloudZoneRulesVersion(
  registerVersion: string | null,
  cloudVersion: string,
): boolean {
  return registerVersion === cloudVersion;
}

export function currentZoneRulesPublication<TPublication extends ZoneRulesPublication>(
  publications: readonly TPublication[],
): TPublication | undefined {
  const lastNumber = Math.max(...publications.map(({ publicationNumber }) => publicationNumber));
  return publications.find(({ publicationNumber }) => publicationNumber === lastNumber);
}

export function nextZoneRulesPublicationNumber(
  publications: readonly ZoneRulesPublication[],
): number {
  return (currentZoneRulesPublication(publications)?.publicationNumber ?? 0) + 1;
}
