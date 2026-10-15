import { isPointOfSaleNumber } from "@purosur/domain";
import {
  diagnoseNumberingConflict,
  reconcileNumberingConflict,
  type TaxAuthorityLastAuthorizedLookup,
  type TaxAuthorityVoucherLookup,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackgroundJobs } from "../platform/background-jobs.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzleNumberingConflictLanes } from "./drizzle-numbering-conflict-lanes.js";
import { DrizzleUnclearOutcomeRequests } from "./drizzle-unclear-outcome-lanes.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import type { EnqueueNumberingReconciliation } from "./enqueue-numbering-conflict.js";
import { UNCLEAR_OUTCOME_PRIORITY } from "./unclear-outcome-task.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER = "diagnose-numbering-conflict";
export const RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER = "reconcile-numbering-conflict";

export const NUMBERING_CONFLICT_PRIORITY = UNCLEAR_OUTCOME_PRIORITY;

export function numberingDiagnosisJobKey(fiscalDocumentId: string): string {
  return `${DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER}:${fiscalDocumentId}`;
}

export function numberingReconciliationJobKey(pointOfSale: number): string {
  return `${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}:${pointOfSale}`;
}

export interface NumberingConflictInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  vouchers: TaxAuthorityVoucherLookup;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  certificateFingerprint: string;
  db: PgDatabase<TQueryResult>;
  connections: DedicatedConnections<TQueryResult>;
  enqueueNumberingReconciliation: EnqueueNumberingReconciliation;
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

function pointOfSaleOf(payload: unknown): number {
  const pointOfSale =
    typeof payload === "object" && payload !== null
      ? (payload as { pointOfSale?: unknown }).pointOfSale
      : undefined;
  if (typeof pointOfSale !== "number" || !isPointOfSaleNumber(pointOfSale)) {
    throw new Error("the job names no point of sale");
  }
  return pointOfSale;
}

// A run that has to wait for the tax authority, or for a document still being decided, fails so
// graphile-worker runs it again with its own backoff; startup asks again once its attempts are used up.
export function numberingConflictJobs<TQueryResult extends PgQueryResultHKT>({
  now,
  vouchers,
  taxAuthority,
  certificateFingerprint,
  db,
  connections,
  enqueueNumberingReconciliation,
}: NumberingConflictInput<TQueryResult>): BackgroundJobs {
  const clock = { now };
  const ports = {
    lanes: new DrizzleNumberingConflictLanes(connections, enqueueNumberingReconciliation, now),
    clock,
    tokens: new DrizzleWsaaTokenSource(db, clock, WSFE_SERVICE, certificateFingerprint),
    taxAuthority,
  };
  return {
    taskList: {
      [DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER]: async (payload) => {
        const fiscalDocumentId = fiscalDocumentIdOf(payload);
        const outcome = await diagnoseNumberingConflict(
          { ...ports, requests: new DrizzleUnclearOutcomeRequests(db), vouchers },
          { fiscalDocumentId },
        );
        if (outcome.kind === "retry") {
          throw new Error(
            `the numbering conflict of fiscal document ${fiscalDocumentId} was not diagnosed: the tax authority gave no answer`,
          );
        }
      },
      [RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER]: async (payload) => {
        const pointOfSale = pointOfSaleOf(payload);
        const outcome = await reconcileNumberingConflict(ports, { pointOfSale });
        if (outcome.kind === "retry" || outcome.kind === "waiting") {
          throw new Error(
            `the numbering of point of sale ${pointOfSale} was not reconciled: ${outcome.kind}`,
          );
        }
      },
    },
    crontab: [],
  };
}
