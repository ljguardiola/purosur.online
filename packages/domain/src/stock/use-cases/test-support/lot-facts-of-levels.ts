import type { LotNameFacts } from "../../model/lot-name.js";
import type { StockLevel } from "../stock-reader.js";

const COUNTED_AT = new Date("2026-10-27T15:00:00.000Z");

export function lotFactsOfLevels(
  levels: readonly StockLevel[],
  locationId: string,
): LotNameFacts[] {
  return levels.flatMap((level) =>
    level.lots.map((lot, index) => ({
      lotId: lot.id,
      productId: level.id,
      locationId,
      nameOrder: index + 1,
      givenNumber: null,
      origin: lot.purchase
        ? { kind: "purchase" as const, purchasedOn: lot.purchase.purchasedOn }
        : lot.assemblyBatch
          ? { kind: "assembly_batch" as const, assembledAt: lot.assemblyBatch.assembledAt }
          : lot.initialCount
            ? { kind: "initial_count" as const, countedAt: COUNTED_AT }
            : { kind: "technical" as const, openedAt: COUNTED_AT },
    })),
  );
}
