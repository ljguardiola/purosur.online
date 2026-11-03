import type { LotNameFacts } from "../../model/lot-name.js";

export class FakeLotNameReader {
  readonly reads: { locationId: string; productIds: string[] }[] = [];
  private readonly facts: LotNameFacts[];

  constructor(facts: LotNameFacts[]) {
    this.facts = facts;
  }

  async lotNameFacts(locationId: string, productIds: readonly string[]): Promise<LotNameFacts[]> {
    this.reads.push({ locationId, productIds: [...productIds] });
    return this.facts
      .filter((lot) => lot.locationId === locationId && productIds.includes(lot.productId))
      .map((lot) => ({ ...lot, origin: { ...lot.origin } }));
  }
}

export function purchaseLotFacts(
  lotId: string,
  productId: string,
  nameOrder: number,
  purchasedOn: string,
  locationId = "location-1",
): LotNameFacts {
  return {
    lotId,
    productId,
    locationId,
    nameOrder,
    givenNumber: null,
    origin: { kind: "purchase", purchasedOn },
  };
}

export function initialCountLotFacts(
  lotId: string,
  productId: string,
  nameOrder: number,
  countedAt: Date,
  locationId = "location-1",
): LotNameFacts {
  return {
    lotId,
    productId,
    locationId,
    nameOrder,
    givenNumber: null,
    origin: { kind: "initial_count", countedAt },
  };
}

export function technicalLotFacts(
  lotId: string,
  productId: string,
  nameOrder: number,
  openedAt: Date,
  locationId = "location-1",
): LotNameFacts {
  return {
    lotId,
    productId,
    locationId,
    nameOrder,
    givenNumber: null,
    origin: { kind: "technical", openedAt },
  };
}

export function assemblyBatchLotFacts(
  lotId: string,
  productId: string,
  nameOrder: number,
  assembledAt: Date,
  locationId = "location-1",
): LotNameFacts {
  return {
    lotId,
    productId,
    locationId,
    nameOrder,
    givenNumber: null,
    origin: { kind: "assembly_batch", assembledAt },
  };
}
