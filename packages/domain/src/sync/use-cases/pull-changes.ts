import { PULL_PAGE_READ_LIMIT, pullPageOf } from "../model/pull-page.js";
import type { PulledChange, PullPage, PullPorts } from "./sync-ports.js";

export interface PullChangesInput {
  deviceId: string;
  locationId: string;
  since: number;
}

export async function pullChanges<TChange extends PulledChange>(
  { changeLog, clock }: PullPorts<TChange>,
  input: PullChangesInput,
): Promise<PullPage<TChange>> {
  return changeLog.transaction(async (tx) => {
    await tx.recordObservedPull(input.deviceId, input.since, clock.now());
    const changes = await tx.changesAfter(input.locationId, input.since, PULL_PAGE_READ_LIMIT);
    return pullPageOf(input.since, changes);
  });
}
