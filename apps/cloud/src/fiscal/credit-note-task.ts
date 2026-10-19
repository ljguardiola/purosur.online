import {
  issueCreditNote,
  type TaxAuthorityCreditNoteInvoicing,
  type TaxAuthorityLastAuthorizedLookup,
  type TaxAuthorityVoucherLookup,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackgroundJobs } from "../platform/background-jobs.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzleCreditNoteLanes, DrizzleCreditNoteRequests } from "./drizzle-credit-notes.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import { UNCLEAR_OUTCOME_PRIORITY } from "./unclear-outcome-task.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const CREDIT_NOTE_TASK_IDENTIFIER = "issue-credit-note";

export const CREDIT_NOTE_PRIORITY = UNCLEAR_OUTCOME_PRIORITY;

export function creditNoteJobKey(creditNoteId: string): string {
  return `${CREDIT_NOTE_TASK_IDENTIFIER}:${creditNoteId}`;
}

export interface CreditNoteInput<TQueryResult extends PgQueryResultHKT> {
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

export function creditNoteJobs<TQueryResult extends PgQueryResultHKT>({
  now,
  vouchers,
  taxAuthority,
  creditNotes,
  certificateFingerprint,
  db,
  connections,
}: CreditNoteInput<TQueryResult>): BackgroundJobs {
  const clock = { now };
  const ports = {
    requests: new DrizzleCreditNoteRequests(db),
    lanes: new DrizzleCreditNoteLanes(connections),
    clock,
    tokens: new DrizzleWsaaTokenSource(db, clock, WSFE_SERVICE, certificateFingerprint),
    vouchers,
    taxAuthority,
    creditNotes,
  };
  return {
    taskList: {
      [CREDIT_NOTE_TASK_IDENTIFIER]: async (payload, helpers) => {
        const creditNoteId = creditNoteIdOf(payload);
        const outcome = await issueCreditNote(ports, { creditNoteId });
        if (outcome.kind === "retry") {
          await helpers.addJob(
            CREDIT_NOTE_TASK_IDENTIFIER,
            { creditNoteId },
            {
              jobKey: creditNoteJobKey(creditNoteId),
              jobKeyMode: "replace",
              priority: CREDIT_NOTE_PRIORITY,
              runAt: outcome.askAgainAt,
            },
          );
        }
      },
    },
    crontab: [],
  };
}
