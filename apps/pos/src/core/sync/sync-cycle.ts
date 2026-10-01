import type { SyncResult } from "./sync-schedule";

export interface SyncCycleDeps {
  push: () => Promise<SyncResult>;
  pull: () => Promise<SyncResult>;
  onPushFailure: (error: unknown) => void;
}

async function pushed(deps: SyncCycleDeps): Promise<SyncResult> {
  try {
    return await deps.push();
  } catch (error) {
    deps.onPushFailure(error);
    return { kind: "failed" };
  }
}

export async function runSyncCycle(deps: SyncCycleDeps): Promise<SyncResult> {
  const pushResult = await pushed(deps);
  const pullResult = await deps.pull();
  if (pushResult.kind === "succeeded" && pullResult.kind === "succeeded") {
    return pullResult;
  }
  const waits = [pushResult, pullResult].flatMap((result) =>
    result.kind === "failed" && result.retryAfterMs !== undefined ? [result.retryAfterMs] : [],
  );
  return waits.length === 0
    ? { kind: "failed" }
    : { kind: "failed", retryAfterMs: Math.max(...waits) };
}
