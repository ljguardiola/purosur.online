export const INITIAL_COUNT_COST_FILTERS = ["known", "incomplete"] as const;

export type InitialCountCostFilter = (typeof INITIAL_COUNT_COST_FILTERS)[number];

export function initialCountOffered({
  branchFirstSessionOpened,
  ownSessionEverOpened,
}: {
  branchFirstSessionOpened: boolean;
  ownSessionEverOpened: boolean;
}): boolean {
  return !branchFirstSessionOpened && !ownSessionEverOpened;
}

export function initialCountCostIncomplete(filter: InitialCountCostFilter): boolean {
  return filter === "incomplete";
}

export function initialCountLotTakesCost({
  withdrawn,
  remaining,
}: {
  withdrawn: boolean;
  remaining: number;
}): boolean {
  return !withdrawn || remaining > 0;
}
