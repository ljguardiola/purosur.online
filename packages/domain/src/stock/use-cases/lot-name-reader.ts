import type { LotNameFacts } from "../model/lot-name.js";

export interface LotNameReader {
  // Every lot of each product in the branch, withdrawn ones included: a lot's number depends on
  // the other lots of its product and branch, not only on those a screen lists.
  lotNameFacts(locationId: string, productIds: readonly string[]): Promise<LotNameFacts[]>;
}
