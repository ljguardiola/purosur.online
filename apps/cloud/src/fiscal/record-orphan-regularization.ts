import { externalBillingObservation, type JsonValue } from "@purosur/domain";
import type {
  ExternalInvoicingRegularization,
  FiscalTask,
  OrphanRegularization,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { fiscalTasks, orphanCreditNotes, registerPointsOfSale } from "../platform/db/schema.js";
import type { EnqueueOrphanCreditNote } from "./enqueue-orphan-credit-note.js";

async function registerHoldingPointOfSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  pointOfSale: number,
): Promise<string> {
  const [holder] = await tx
    .select({ registerId: registerPointsOfSale.registerId })
    .from(registerPointsOfSale)
    .where(eq(registerPointsOfSale.pointOfSaleNumber, pointOfSale));
  if (holder === undefined) {
    throw new Error(`no register holds point of sale ${pointOfSale}`);
  }
  return holder.registerId;
}

function reasonOf(task: FiscalTask): JsonValue {
  return task.kind === "external_invoicing"
    ? { ...task.voucher }
    : { rejections: task.rejections.map((rejection) => ({ ...rejection })) };
}

export async function insertFiscalTask<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  task: FiscalTask,
  registerId: string,
): Promise<void> {
  await tx
    .insert(fiscalTasks)
    .values({
      id: crypto.randomUUID(),
      kind: task.kind,
      registerId,
      pointOfSale: task.pointOfSale,
      documentType: task.documentType,
      number: task.number,
      creditNoteId: task.kind === "credit_note_rejected" ? task.creditNoteId : null,
      reason: reasonOf(task),
      state: task.state,
      createdAt: task.createdAt,
    })
    .onConflictDoNothing();
}

export async function recordExternalInvoicing<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { externalBilling, task }: ExternalInvoicingRegularization,
): Promise<void> {
  const observation = externalBillingObservation(externalBilling);
  if (observation.holds) {
    await openAlert(tx, observation.alert, { now: () => task.createdAt });
  }
  await insertFiscalTask(tx, task, await registerHoldingPointOfSale(tx, task.pointOfSale));
}

export async function recordOrphanRegularization<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  regularization: OrphanRegularization,
  { at, enqueueOrphanCreditNote }: { at: Date; enqueueOrphanCreditNote: EnqueueOrphanCreditNote },
): Promise<void> {
  if (regularization.kind === "external_invoicing") {
    await recordExternalInvoicing(tx, regularization);
    return;
  }
  const registerId = await registerHoldingPointOfSale(tx, regularization.pointOfSale);
  const { creditNoteId, saleId, pointOfSale, associatedVoucher, keptVoucher } = regularization;
  const inserted = await tx
    .insert(orphanCreditNotes)
    .values({
      id: creditNoteId,
      registerId,
      saleId,
      pointOfSale,
      associatedVoucherType: associatedVoucher.voucherType,
      associatedNumber: associatedVoucher.number,
      keptVoucherType: keptVoucher.voucherType,
      keptPointOfSale: keptVoucher.pointOfSale,
      keptNumber: keptVoucher.number,
      total: regularization.total,
      receiverTaxStatusCode: regularization.receiverTaxStatusCode,
      createdAt: at,
    })
    .onConflictDoNothing({
      target: [
        orphanCreditNotes.pointOfSale,
        orphanCreditNotes.associatedVoucherType,
        orphanCreditNotes.associatedNumber,
      ],
    })
    .returning({ id: orphanCreditNotes.id });
  if (inserted.length > 0) {
    await enqueueOrphanCreditNote(tx, creditNoteId);
  }
}
