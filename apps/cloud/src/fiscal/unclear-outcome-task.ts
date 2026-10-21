import { randomUUID } from "node:crypto";
import {
  decideUnclearRealTimeOutcome,
  type TaxAuthorityLastAuthorizedLookup,
  type TaxAuthorityVoucherLookup,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackgroundJobs } from "../platform/background-jobs.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import {
  DrizzleUnclearOutcomeLanes,
  DrizzleUnclearOutcomeRequests,
} from "./drizzle-unclear-outcome-lanes.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import type { EnqueueCreditNote } from "./enqueue-credit-note.js";
import type { EnqueueUnclearOutcome } from "./enqueue-unclear-outcome.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const UNCLEAR_OUTCOME_TASK_IDENTIFIER = "decide-unclear-real-time-outcome";

// graphile-worker runs the lowest number first; every other job of the cloud runs at -10 or later.
export const UNCLEAR_OUTCOME_PRIORITY = -20;

export function unclearOutcomeJobKey(fiscalDocumentId: string): string {
  return `${UNCLEAR_OUTCOME_TASK_IDENTIFIER}:${fiscalDocumentId}`;
}

export interface UnclearOutcomeInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  vouchers: TaxAuthorityVoucherLookup;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  certificateFingerprint: string;
  db: PgDatabase<TQueryResult>;
  connections: DedicatedConnections<TQueryResult>;
  enqueueUnclearOutcome: EnqueueUnclearOutcome;
  enqueueCreditNote: EnqueueCreditNote;
}

function fiscalDocumentIdOf(payload: unknown): string {
  const fiscalDocumentId =
    typeof payload === "object" && payload !== null
      ? (payload as { fiscalDocumentId?: unknown }).fiscalDocumentId
      : undefined;
  if (typeof fiscalDocumentId !== "string" || fiscalDocumentId === "") {
    throw new Error("the job names no fiscal document");
  }
  return fiscalDocumentId;
}

export function unclearOutcomeJobs<TQueryResult extends PgQueryResultHKT>({
  now,
  vouchers,
  taxAuthority,
  certificateFingerprint,
  db,
  connections,
  enqueueUnclearOutcome,
  enqueueCreditNote,
}: UnclearOutcomeInput<TQueryResult>): BackgroundJobs {
  const clock = { now };
  const ports = {
    requests: new DrizzleUnclearOutcomeRequests(db),
    lanes: new DrizzleUnclearOutcomeLanes(connections, enqueueUnclearOutcome, enqueueCreditNote),
    clock,
    ids: { next: () => randomUUID() },
    tokens: new DrizzleWsaaTokenSource(db, clock, WSFE_SERVICE, certificateFingerprint),
    vouchers,
    taxAuthority,
  };
  return {
    taskList: {
      [UNCLEAR_OUTCOME_TASK_IDENTIFIER]: async (payload, helpers) => {
        const fiscalDocumentId = fiscalDocumentIdOf(payload);
        const outcome = await decideUnclearRealTimeOutcome(ports, { fiscalDocumentId });
        if (outcome.kind === "pending") {
          await helpers.addJob(
            UNCLEAR_OUTCOME_TASK_IDENTIFIER,
            { fiscalDocumentId },
            {
              jobKey: unclearOutcomeJobKey(fiscalDocumentId),
              jobKeyMode: "replace",
              priority: UNCLEAR_OUTCOME_PRIORITY,
              runAt: outcome.askAgainAt,
            },
          );
        }
      },
    },
    crontab: [],
  };
}
