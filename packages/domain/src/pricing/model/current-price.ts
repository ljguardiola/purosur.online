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
  const starts = candidate.validFrom.getTime();
  const thanStarts = than.validFrom.getTime();
  return starts > thanStarts || (starts === thanStarts && candidate.id > than.id);
}
