import type { SyncResult } from "./sync-schedule";

export interface SyncCycleDeps {
  checkInstallation: () => Promise<SyncResult>;
  push: () => Promise<SyncResult>;
  pull: () => Promise<SyncResult>;
  onCheckFailure: (error: unknown) => void;
  onPushFailure: (error: unknown) => void;
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
  const results = [
    await caught(deps.checkInstallation, deps.onCheckFailure),
    await caught(deps.push, deps.onPushFailure),
    await deps.pull(),
  ];
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
