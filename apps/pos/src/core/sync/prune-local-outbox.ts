import {
  type OutboxPruning,
  type PruneOutboxOutcome,
  pruneOutbox,
} from "@purosur/domain/sync/use-cases";

export interface PruneLocalOutboxDeps {
  outbox: OutboxPruning | undefined;
  now: () => Date;
}

export type PruneAttempt = { kind: "no_local_database" } | PruneOutboxOutcome;

export async function pruneLocalOutbox({
  outbox,
  now,
}: PruneLocalOutboxDeps): Promise<PruneAttempt> {
  if (outbox === undefined) {
    return { kind: "no_local_database" };
  }
  return pruneOutbox({ outbox, clock: { now } });
}
