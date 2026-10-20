import {
  fortnightContaining,
  isPointOfSaleNumber,
  type ListedOwedPresentation,
} from "@purosur/domain";
import type { TaxAuthorityRejection } from "@purosur/domain/fiscal/use-cases";

const OWED_PRESENTATIONS_OBSERVATION_CODE = 15_014;
const ENTRY = /(?<![\d;])(\d{4})(\d{2});([12]);(\d+)(?!\d)/g;
const SECOND_HALF_FIRST_DAY = "16";
const FIRST_HALF_FIRST_DAY = "01";

function entriesOf(message: string): ListedOwedPresentation[] {
  return [...message.matchAll(ENTRY)].flatMap(([, year, month, order, pointOfSale]) => {
    if (Number(month) < 1 || Number(month) > 12 || !isPointOfSaleNumber(Number(pointOfSale))) {
      return [];
    }
    const day = order === "2" ? SECOND_HALF_FIRST_DAY : FIRST_HALF_FIRST_DAY;
    return [
      {
        pointOfSaleNumber: Number(pointOfSale),
        fortnight: fortnightContaining(`${year}-${month}-${day}`),
      },
    ];
  });
}

export function owedPresentationsOf(
  observations: readonly TaxAuthorityRejection[],
): ListedOwedPresentation[] {
  const listed: ListedOwedPresentation[] = [];
  for (const { code, message } of observations) {
    if (code !== OWED_PRESENTATIONS_OBSERVATION_CODE) {
      continue;
    }
    for (const entry of entriesOf(message)) {
      const known = listed.some(
        (other) =>
          other.pointOfSaleNumber === entry.pointOfSaleNumber &&
          other.fortnight.start === entry.fortnight.start,
      );
      if (!known) {
        listed.push(entry);
      }
    }
  }
  return listed;
}
