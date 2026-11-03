import { argentinaCalendarDay } from "../../shared/argentina-calendar.js";
import type { ZoneRules } from "../../shared/zone-rules.js";

export type LotNameOrigin = "purchase" | "initial_count" | "assembly_batch" | "technical";

export type LotNameOriginFacts =
  | { kind: "purchase"; purchasedOn: string }
  | { kind: "initial_count"; countedAt: Date }
  | { kind: "assembly_batch"; assembledAt: Date }
  | { kind: "technical"; openedAt: Date };

export interface LotNameFacts {
  lotId: string;
  productId: string;
  locationId: string;
  // The order in which each lot took its name: a lot re-dated into another day takes a later one.
  nameOrder: number;
  origin: LotNameOriginFacts;
}

export interface LotName {
  origin: LotNameOrigin;
  day: string;
  number: number | null;
}

function dayOf(origin: LotNameOriginFacts, rules: ZoneRules): string {
  switch (origin.kind) {
    case "purchase":
      return origin.purchasedOn;
    case "initial_count":
      return argentinaCalendarDay(origin.countedAt, rules);
    case "assembly_batch":
      return argentinaCalendarDay(origin.assembledAt, rules);
    case "technical":
      return argentinaCalendarDay(origin.openedAt, rules);
  }
}

function isNumbered(lotsSharingTheName: number): boolean {
  return lotsSharingTheName > 1;
}

// Names every lot given; a lot's number depends on the other lots of its product and branch, so
// the lots given include all of them for each product and branch named.
export function lotNames(lots: readonly LotNameFacts[], rules: ZoneRules): Map<string, LotName> {
  const groups = new Map<string, { lotId: string; nameOrder: number; name: LotName }[]>();
  for (const lot of lots) {
    const name: LotName = { origin: lot.origin.kind, day: dayOf(lot.origin, rules), number: null };
    const key = JSON.stringify([lot.productId, lot.locationId, name.origin, name.day]);
    const group = groups.get(key) ?? [];
    group.push({ lotId: lot.lotId, nameOrder: lot.nameOrder, name });
    groups.set(key, group);
  }
  const names = new Map<string, LotName>();
  for (const group of groups.values()) {
    const numbered = isNumbered(group.length);
    group
      .sort((a, b) => a.nameOrder - b.nameOrder)
      .forEach(({ lotId, name }, index) => {
        names.set(lotId, { ...name, number: numbered ? index + 1 : null });
      });
  }
  return names;
}
