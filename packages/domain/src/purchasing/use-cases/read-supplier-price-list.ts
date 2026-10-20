import { argentinaCalendarDay, isCalendarDay } from "../../shared/index.js";
import {
  isPriceListRowPrice,
  isSourcePage,
  type SupplierPriceListReadFailure,
} from "../model/supplier-price-list.js";
import type {
  ExtractedPriceListRow,
  PriceListExtraction,
  PriceListExtractor,
} from "./price-list-extractor.js";
import type { SupplierPriceListFiles } from "./supplier-price-list-files.js";
import type {
  ProposedPriceListRow,
  SupplierPriceListStore,
  SupplierPriceListStoreTransaction,
} from "./supplier-price-list-store.js";

export interface ReadSupplierPriceListPorts {
  store: SupplierPriceListStore;
  files: SupplierPriceListFiles;
  extractor: PriceListExtractor;
}

export interface ReadSupplierPriceListInput {
  listId: string;
  now: () => Date;
}

export type ReadSupplierPriceListOutcome =
  | { kind: "not_found" }
  | { kind: "already_read" }
  | { kind: "interrupted" }
  | { kind: "failed"; reason: SupplierPriceListReadFailure }
  | { kind: "extracted"; rowCount: number };

function proposedRow(row: ExtractedPriceListRow): ProposedPriceListRow {
  return {
    description: row.description,
    code: row.code,
    presentation: row.presentation,
    priceCents:
      row.priceCents !== null && isPriceListRowPrice(row.priceCents) ? row.priceCents : null,
    page: row.page !== null && isSourcePage(row.page) ? row.page : null,
  };
}

async function extractedOrUnavailable(
  extractor: PriceListExtractor,
  bytes: Uint8Array,
): Promise<PriceListExtraction> {
  try {
    return await extractor.extract({ kind: "pdf", bytes });
  } catch {
    return { kind: "unavailable" };
  }
}

type Stop = { kind: "stop"; outcome: ReadSupplierPriceListOutcome };

// The job only writes this list's state and rows: it has no port to reach anything else.
export async function readSupplierPriceList(
  { store, files, extractor }: ReadSupplierPriceListPorts,
  { listId, now }: ReadSupplierPriceListInput,
): Promise<ReadSupplierPriceListOutcome> {
  const claim = await store.transaction<Stop | { kind: "go" }>(async (tx) => {
    const locked = await tx.lockList(listId);
    if (locked.kind === "not_found") {
      return { kind: "stop", outcome: { kind: "not_found" } };
    }
    if (locked.list.state !== "READING") {
      return { kind: "stop", outcome: { kind: "already_read" } };
    }
    if (locked.list.sentAt !== null) {
      await tx.recordReadFailure(listId, "interrupted");
      return { kind: "stop", outcome: { kind: "interrupted" } };
    }
    return { kind: "go" };
  });
  if (claim.kind === "stop") {
    return claim.outcome;
  }

  const bytes = await files.read(listId);

  const sent = await store.transaction<Stop | { kind: "sent"; bytes: Uint8Array }>(async (tx) => {
    if (!(await isUnsentReading(tx, listId))) {
      return { kind: "stop", outcome: { kind: "already_read" } };
    }
    if (bytes === null) {
      await tx.recordReadFailure(listId, "reading_unavailable");
      return { kind: "stop", outcome: { kind: "failed", reason: "reading_unavailable" } };
    }
    const sentAt = now();
    await tx.markSent(listId, sentAt, argentinaCalendarDay(sentAt));
    return { kind: "sent", bytes };
  });
  if (sent.kind === "stop") {
    return sent.outcome;
  }

  const extraction = await extractedOrUnavailable(extractor, sent.bytes);

  return store.transaction<ReadSupplierPriceListOutcome>(async (tx) => {
    const locked = await tx.lockList(listId);
    if (locked.kind === "not_found" || locked.list.state !== "READING") {
      return { kind: "already_read" };
    }
    if (extraction.kind === "unreadable") {
      await tx.recordReadFailure(listId, "unreadable_document");
      return { kind: "failed", reason: "unreadable_document" };
    }
    if (extraction.kind === "unavailable") {
      await tx.recordReadFailure(listId, "reading_unavailable");
      return { kind: "failed", reason: "reading_unavailable" };
    }
    if (extraction.rows.length === 0) {
      await tx.recordReadFailure(listId, "no_items_found");
      return { kind: "failed", reason: "no_items_found" };
    }
    const listDate =
      extraction.listDate !== null && isCalendarDay(extraction.listDate)
        ? extraction.listDate
        : null;
    await tx.recordExtraction(listId, listDate, extraction.rows.map(proposedRow));
    return { kind: "extracted", rowCount: extraction.rows.length };
  });
}

async function isUnsentReading(
  tx: SupplierPriceListStoreTransaction,
  listId: string,
): Promise<boolean> {
  const locked = await tx.lockList(listId);
  return locked.kind === "locked" && locked.list.state === "READING" && locked.list.sentAt === null;
}
