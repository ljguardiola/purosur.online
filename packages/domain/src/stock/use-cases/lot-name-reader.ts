import type { LotNameFacts } from "../model/lot-name.js";

export interface LotNameReader {
  // Every lot of each product in the branch, withdrawn initial-count lots included and withdrawn
  // purchased lots left out: a lot's number depends on the other lots of its product and branch,
  // not only on those a screen lists, while a withdrawn purchased lot no longer belongs to them.
  lotNameFacts(locationId: string, productIds: readonly string[]): Promise<LotNameFacts[]>;
}
