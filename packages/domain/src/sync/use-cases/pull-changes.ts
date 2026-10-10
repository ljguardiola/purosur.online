import { fortnightContaining } from "../../fiscal/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import { pullAudienceOf } from "../model/pull-audience.js";
import { PULL_PAGE_READ_LIMIT, pullPageOf } from "../model/pull-page.js";
import type {
  OfflineAuthorizationCodeRequests,
  PulledChange,
  PullPage,
  PullPorts,
} from "./sync-ports.js";

export interface PullChangesInput {
  deviceId: string;
  since: number;
}

async function requestMissingOfflineAuthorizationCode(
  offlineAuthorizationCodes: OfflineAuthorizationCodeRequests,
  deviceId: string,
  now: Date,
): Promise<void> {
  if (!(await offlineAuthorizationCodes.installedRegisterHasOfflinePointOfSale(deviceId))) {
    return;
  }
  const currentFortnight = fortnightContaining(argentinaCalendarDay(now));
  if (await offlineAuthorizationCodes.holdsOfflineAuthorizationCodeFor(currentFortnight)) {
    return;
  }
  await offlineAuthorizationCodes.requestOfflineAuthorizationCode();
}

export async function pullChanges<TChange extends PulledChange>(
  { changeLog, offlineAuthorizationCodes, clock }: PullPorts<TChange>,
  input: PullChangesInput,
): Promise<PullPage<TChange>> {
  const now = clock.now();
  await requestMissingOfflineAuthorizationCode(offlineAuthorizationCodes, input.deviceId, now);
  return changeLog.transaction(async (tx) => {
    await tx.recordObservedPull(input.deviceId, input.since, now);
    const audience = pullAudienceOf(await tx.pullingRegister(input.deviceId));
    const changes = await tx.changesAfter(audience, input.since, PULL_PAGE_READ_LIMIT);
    return pullPageOf(input.since, changes);
  });
}
