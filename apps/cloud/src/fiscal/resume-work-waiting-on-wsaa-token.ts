import type { SQL } from "drizzle-orm";
import { enqueueOfflineAuthorizationCodeAcquisition } from "./graphile-offline-authorization-code-queue.js";
import { enqueueMissingTaxAuthorityCounts } from "./graphile-tax-authority-count-queue.js";

export async function resumeWorkWaitingOnWsaaToken(transaction: {
  execute(query: SQL): PromiseLike<unknown>;
}): Promise<void> {
  await enqueueMissingTaxAuthorityCounts(transaction);
  await enqueueOfflineAuthorizationCodeAcquisition(transaction);
}
