import type { SyncResult } from "./sync-schedule";

export interface SyncCycleDeps {
  checkInstallation: () => Promise<SyncResult>;
  push: () => Promise<SyncResult>;
  prune: () => Promise<void>;
  pull: () => Promise<SyncResult>;
  onCheckFailure: (error: unknown) => void;
  onPushFailure: (error: unknown) => void;
  onPruneFailure: (error: unknown) => void;
}

async function caught(
  step: () => Promise<SyncResult>,
  onFailure: (error: unknown) => void,
): Promise<SyncResult> {
  try {
    return await step();
  } catch (error) {
    onFailure(error);
    return { kind: "failed" };
  }
}

export async function runSyncCycle(deps: SyncCycleDeps): Promise<SyncResult> {
  const checked = await caught(deps.checkInstallation, deps.onCheckFailure);
  const pushed = await caught(deps.push, deps.onPushFailure);
  await deps.prune().catch(deps.onPruneFailure);
  const results = [checked, pushed, await deps.pull()];
  if (results.every((result) => result.kind === "succeeded")) {
    return { kind: "succeeded" };
  }
  const waits = results.flatMap((result) =>
    result.kind === "failed" && result.retryAfterMs !== undefined ? [result.retryAfterMs] : [],
  );
  return waits.length === 0
    ? { kind: "failed" }
    : { kind: "failed", retryAfterMs: Math.max(...waits) };
}
