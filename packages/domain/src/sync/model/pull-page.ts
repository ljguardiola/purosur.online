export const FIRST_PULL_CURSOR = 0;

export const PULL_PAGE_MAX_CHANGES = 500;

export const PULL_PAGE_READ_LIMIT = PULL_PAGE_MAX_CHANGES + 1;

export interface PulledChange {
  changeSeq: number;
}

export interface PullPage<TChange extends PulledChange> {
  changes: TChange[];
  cursor: number;
  hasMore: boolean;
}

export function isPullCursor(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function pullPageOf<TChange extends PulledChange>(
  since: number,
  changesAfterSince: readonly TChange[],
): PullPage<TChange> {
  const changes = changesAfterSince.slice(0, PULL_PAGE_MAX_CHANGES);
  return {
    changes,
    cursor: changes.at(-1)?.changeSeq ?? since,
    hasMore: changesAfterSince.length > PULL_PAGE_MAX_CHANGES,
  };
}

export function isPageAfter<TChange extends PulledChange>(
  since: number,
  page: PullPage<TChange>,
): boolean {
  if (page.changes.length > PULL_PAGE_MAX_CHANGES) {
    return false;
  }
  let previous = since;
  for (const change of page.changes) {
    if (change.changeSeq <= previous) {
      return false;
    }
    previous = change.changeSeq;
  }
  return page.cursor === previous && (page.changes.length > 0 || !page.hasMore);
}
