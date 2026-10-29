import { pullAudienceOfEntity } from "../model/pull-audience.js";
import { PULL_PAGE_READ_LIMIT, pullPageOf } from "../model/pull-page.js";
import { readerVersionOf } from "../model/pull-readers.js";
import type { PulledChange, PulledEntity, PullPage, ResendPorts } from "./sync-ports.js";

export interface ResendPulledEntityInput {
  deviceId: string;
  since: number;
  entity: PulledEntity;
  declaredVersion?: string | undefined;
}

export function resendPulledEntity<TChange extends PulledChange>(
  { changeLog }: ResendPorts<TChange>,
  { deviceId, since, entity, declaredVersion }: ResendPulledEntityInput,
): Promise<PullPage<TChange>> {
  return changeLog.transaction(async (tx) => {
    const register = await tx.pullingRegister(deviceId);
    const audience = pullAudienceOfEntity(
      register,
      entity,
      readerVersionOf(declaredVersion, register.recordedAppVersion),
    );
    const changes = await tx.changesAfter(audience, since, PULL_PAGE_READ_LIMIT);
    return pullPageOf(since, changes);
  });
}
