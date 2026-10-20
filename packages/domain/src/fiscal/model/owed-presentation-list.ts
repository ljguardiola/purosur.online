import { type Fortnight, isSameFortnight } from "./offline-authorization-code.js";

export interface ListedOwedPresentation {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
}

export type WithOwedPresentations<TAnswer> = TAnswer & {
  owedPresentations?: ListedOwedPresentation[];
};

export function owedPresentationsToRecord(
  answer: WithOwedPresentations<object>,
): ListedOwedPresentation[] | undefined {
  return answer.owedPresentations?.length ? answer.owedPresentations : undefined;
}

export function splitOwedPresentations(
  list: ListedOwedPresentation[],
  ownedPointsOfSale: readonly number[],
): { owned: ListedOwedPresentation[]; owedElsewhere: ListedOwedPresentation[] } {
  const isOwned = ({ pointOfSaleNumber }: ListedOwedPresentation) =>
    ownedPointsOfSale.includes(pointOfSaleNumber);
  return {
    owned: list.filter(isOwned),
    owedElsewhere: list.filter((entry) => !isOwned(entry)),
  };
}

export function listsOwedPresentation(
  list: ListedOwedPresentation[],
  { pointOfSaleNumber, fortnight }: ListedOwedPresentation,
): boolean {
  return list.some(
    (entry) =>
      entry.pointOfSaleNumber === pointOfSaleNumber && isSameFortnight(entry.fortnight, fortnight),
  );
}
