import {
  issueOrphanCreditNote,
  type TaxAuthorityCreditNoteInvoicing,
  type TaxAuthorityLastAuthorizedLookup,
  type TaxAuthorityVoucherLookup,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackgroundJobs } from "../platform/background-jobs.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import {
  DrizzleOrphanCreditNoteLanes,
  DrizzleOrphanCreditNoteRequests,
} from "./drizzle-orphan-credit-notes.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import { UNCLEAR_OUTCOME_PRIORITY } from "./unclear-outcome-task.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER = "issue-orphan-credit-note";

export const ORPHAN_CREDIT_NOTE_PRIORITY = UNCLEAR_OUTCOME_PRIORITY;

export function orphanCreditNoteJobKey(creditNoteId: string): string {
  return `${ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER}:${creditNoteId}`;
}

export interface OrphanCreditNoteInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  vouchers: TaxAuthorityVoucherLookup;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  creditNotes: TaxAuthorityCreditNoteInvoicing;
  certificateFingerprint: string;
  db: PgDatabase<TQueryResult>;
  connections: DedicatedConnections<TQueryResult>;
}

function creditNoteIdOf(payload: unknown): string {
  const creditNoteId =
    typeof payload === "object" && payload !== null
      ? (payload as { creditNoteId?: unknown }).creditNoteId
      : undefined;
  if (typeof creditNoteId !== "string" || creditNoteId === "") {
    throw new Error("the job names no credit note");
  }
  return creditNoteId;
}

export function orphanCreditNoteJobs<TQueryResult extends PgQueryResultHKT>({
  now,
  vouchers,
  taxAuthority,
  creditNotes,
  certificateFingerprint,
  db,
  connections,
}: OrphanCreditNoteInput<TQueryResult>): BackgroundJobs {
  const clock = { now };
  const ports = {
    requests: new DrizzleOrphanCreditNoteRequests(db),
    lanes: new DrizzleOrphanCreditNoteLanes(connections),
    clock,
    tokens: new DrizzleWsaaTokenSource(db, clock, WSFE_SERVICE, certificateFingerprint),
    vouchers,
    taxAuthority,
    creditNotes,
  };
  return {
    taskList: {
      [ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER]: async (payload, helpers) => {
        const creditNoteId = creditNoteIdOf(payload);
        const outcome = await issueOrphanCreditNote(ports, { creditNoteId });
        if (outcome.kind === "retry") {
          await helpers.addJob(
            ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER,
            { creditNoteId },
            {
              jobKey: orphanCreditNoteJobKey(creditNoteId),
              jobKeyMode: "replace",
              priority: ORPHAN_CREDIT_NOTE_PRIORITY,
              runAt: outcome.askAgainAt,
            },
          );
        }
      },
    },
    crontab: [],
  };
}
