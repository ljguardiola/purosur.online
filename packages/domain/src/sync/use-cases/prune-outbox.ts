import { outboxPruneCutoff } from "../model/outbox-retention.js";
import type { PruneOutboxPorts } from "./sync-ports.js";

export type PruneOutboxOutcome = { kind: "pruned"; removed: number };

export async function pruneOutbox({
  outbox,
  clock,
}: PruneOutboxPorts): Promise<PruneOutboxOutcome> {
  const removed = await outbox.forgetAcknowledgedBefore(outboxPruneCutoff(clock.now()));
  return { kind: "pruned", removed };
}
