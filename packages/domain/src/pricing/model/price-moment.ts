// Callers' clocks can disagree, so this keeps a later commit recorded as later than an earlier one.
export function momentAfter(now: Date, committed: readonly (Date | undefined)[]): Date {
  let moment = now.getTime();
  for (const date of committed) {
    if (date && date.getTime() >= moment) {
      moment = date.getTime() + 1;
    }
  }
  return new Date(moment);
}
