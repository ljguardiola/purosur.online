import { fortnightContaining } from "../../fiscal/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import { pullAudienceOf } from "../model/pull-audience.js";
import { PULL_PAGE_READ_LIMIT, pullPageOf } from "../model/pull-page.js";
import type { PulledChange, PullPage, PullPorts } from "./sync-ports.js";

export interface PullChangesInput {
  deviceId: string;
  since: number;
}

export async function pullChanges<TChange extends PulledChange>(
  { changeLog, clock }: PullPorts<TChange>,
  input: PullChangesInput,
): Promise<PullPage<TChange>> {
  return changeLog.transaction(async (tx) => {
    const now = clock.now();
    await tx.recordObservedPull(input.deviceId, input.since, now);
    const currentFortnight = fortnightContaining(argentinaCalendarDay(now));
    if (!(await tx.holdsOfflineAuthorizationCodeFor(currentFortnight))) {
      await tx.requestMissingOfflineAuthorizationCode();
    }
    const audience = pullAudienceOf(await tx.pullingRegister(input.deviceId));
    const changes = await tx.changesAfter(audience, input.since, PULL_PAGE_READ_LIMIT);
    return pullPageOf(input.since, changes);
  });
}
