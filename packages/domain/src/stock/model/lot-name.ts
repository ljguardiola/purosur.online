import { argentinaCalendarDay, type ZoneRules } from "../../shared/index.js";

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
  // The number the lot was given once its group changed; a lot that has not been given one reads
  // the number its place in the group gives it.
  givenNumber: number | null;
  origin: LotNameOriginFacts;
}

export interface PurchasedLotNaming {
  lotId: string;
  productId: string;
  purchasedOn: string;
  nameOrder: number;
  givenNumber: number | null;
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

interface GroupMember {
  lotId: string;
  nameOrder: number;
  givenNumber: number | null;
}

function groupNumbers(members: readonly GroupMember[]): Map<string, number | null> {
  const numbers = new Map<string, number | null>();
  if (members.length === 1) {
    for (const { lotId, givenNumber } of members) {
      numbers.set(lotId, givenNumber);
    }
    return numbers;
  }
  let next = Math.max(0, ...members.map(({ givenNumber }) => givenNumber ?? 0));
  for (const { lotId, givenNumber } of [...members].sort((a, b) => a.nameOrder - b.nameOrder)) {
    if (givenNumber === null) {
      next += 1;
    }
    numbers.set(lotId, givenNumber ?? next);
  }
  return numbers;
}

function groupsOf<T>(items: readonly T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

// Names every lot given; a lot's number depends on the other lots of its product and branch, so
// the lots given include all of them for each product and branch named.
export function lotNames(lots: readonly LotNameFacts[], rules: ZoneRules): Map<string, LotName> {
  const named = lots.map((lot) => ({ ...lot, day: dayOf(lot.origin, rules) }));
  const names = new Map<string, LotName>();
  for (const group of groupsOf(named, (lot) =>
    JSON.stringify([lot.productId, lot.locationId, lot.origin.kind, lot.day]),
  )) {
    const numbers = groupNumbers(group);
    for (const lot of group) {
      names.set(lot.lotId, {
        origin: lot.origin.kind,
        day: lot.day,
        number: numbers.get(lot.lotId) ?? null,
      });
    }
  }
  return names;
}

// The numbers the lots of one branch keep when the lots leaving take another purchase day, so
// every lot staying in a group a lot leaves reads the same number as before.
export function numbersKeptByLotsStaying(
  lots: readonly PurchasedLotNaming[],
  leavingLotIds: readonly string[],
): Map<string, number> {
  const kept = new Map<string, number>();
  for (const group of groupsOf(lots, (lot) => JSON.stringify([lot.productId, lot.purchasedOn]))) {
    if (!group.some((lot) => leavingLotIds.includes(lot.lotId))) {
      continue;
    }
    for (const [lotId, number] of groupNumbers(group)) {
      if (number !== null && !leavingLotIds.includes(lotId)) {
        kept.set(lotId, number);
      }
    }
  }
  return kept;
}
