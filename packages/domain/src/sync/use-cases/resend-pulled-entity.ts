import { pullAudienceOfEntity } from "../model/pull-audience.js";
import { PULL_PAGE_READ_LIMIT, pullPageOf } from "../model/pull-page.js";
import type { PulledChange, PulledEntity, PullPage, ResendPorts } from "./sync-ports.js";

export interface ResendPulledEntityInput {
  deviceId: string;
  since: number;
  entity: PulledEntity;
}

export function resendPulledEntity<TChange extends PulledChange>(
  { changeLog }: ResendPorts<TChange>,
  { deviceId, since, entity }: ResendPulledEntityInput,
): Promise<PullPage<TChange>> {
  return changeLog.transaction(async (tx) => {
    const audience = pullAudienceOfEntity(await tx.pullingRegister(deviceId), entity);
    const changes = await tx.changesAfter(audience, since, PULL_PAGE_READ_LIMIT);
    return pullPageOf(since, changes);
  });
}
