import type { ZoneRulesSource } from "../../shared/index.js";
import { type LotName, lotNames } from "../model/lot-name.js";
import type { LotNameReader } from "./lot-name-reader.js";

export async function nameLotsOfProducts(
  { lotNames: reader, zoneRules }: { lotNames: LotNameReader; zoneRules: ZoneRulesSource },
  locationId: string,
  productIds: readonly string[],
): Promise<Map<string, LotName>> {
  return lotNames(await reader.lotNameFacts(locationId, productIds), zoneRules.zoneRules());
}

export function nameOf(names: ReadonlyMap<string, LotName>, lotId: string): LotName {
  const name = names.get(lotId);
  if (name === undefined) {
    throw new Error(`no name facts for lot ${lotId}`);
  }
  return name;
}
