export interface DatedPrice {
  id: string;
  validFrom: Date;
}

export function newestPrice<TPrice extends DatedPrice>(
  candidates: readonly TPrice[],
): TPrice | undefined {
  let newest: TPrice | undefined;
  for (const candidate of candidates) {
    if (!newest || isNewer(candidate, newest)) {
      newest = candidate;
    }
  }
  return newest;
}

export function priceInEffectAt<TPrice extends DatedPrice>(
  candidates: readonly TPrice[],
  moment: Date,
): TPrice | undefined {
  return newestPrice(
    candidates.filter((candidate) => candidate.validFrom.getTime() <= moment.getTime()),
  );
}

function isNewer(candidate: DatedPrice, than: DatedPrice): boolean {
  const difference = candidate.validFrom.getTime() - than.validFrom.getTime();
  return difference === 0 ? candidate.id > than.id : difference > 0;
}
