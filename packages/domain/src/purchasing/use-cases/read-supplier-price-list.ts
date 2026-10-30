import { argentinaCalendarDay, isCalendarDay, type ZoneRulesSource } from "../../shared/index.js";
import { sameSupplierItemKey, supplierItemKey } from "../model/supplier-item.js";
import {
  isPriceListRowPrice,
  isSourcePage,
  maySupplierPriceListBeReadAgain,
  type SupplierPriceListContentKind,
  type SupplierPriceListReadFailure,
  storeCatalogListTerms,
} from "../model/supplier-price-list.js";
import { planReread } from "../model/supplier-price-list-reread.js";
import { type AiCallCollector, collectAiCalls } from "./ai-call-recording.js";
import type {
  ExtractedPriceListRow,
  PriceListExtraction,
  PriceListExtractor,
  PriceListSource,
} from "./price-list-extractor.js";
import type { StoreCatalogs } from "./store-catalogs.js";
import type { SupplierPriceListFiles } from "./supplier-price-list-files.js";
import type {
  LockedSupplierPriceList,
  ProposedPriceListRow,
  SupplierPriceListStore,
  SupplierPriceListStoreTransaction,
} from "./supplier-price-list-store.js";

export interface ReadSupplierPriceListPorts {
  store: SupplierPriceListStore;
  files: SupplierPriceListFiles;
  extractor: PriceListExtractor;
  storeCatalogs: StoreCatalogs;
  zoneRules: ZoneRulesSource;
}

export interface ReadSupplierPriceListInput {
  listId: string;
  now: () => Date;
  finalAttempt: boolean;
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
    barcode: row.barcode?.trim() || null,
    link: null,
  };
}

async function withRememberedLinks(
  tx: SupplierPriceListStoreTransaction,
  supplierId: string,
  rows: ProposedPriceListRow[],
): Promise<ProposedPriceListRow[]> {
  const remembered = await tx.supplierItems(supplierId, rows.map(supplierItemKey));
  return rows.map((row) => {
    const key = supplierItemKey(row);
    const item = remembered.find((other) => sameSupplierItemKey(other.key, key));
    return { ...row, link: item?.link ?? null };
  });
}

async function extractedOrUnavailable(
  extractor: PriceListExtractor,
  source: PriceListSource,
  aiCalls: AiCallCollector,
): Promise<PriceListExtraction> {
  try {
    return await extractor.extract(source, aiCalls.onCall);
  } catch {
    return { kind: "unavailable" };
  }
}

type ReadingSource = PriceListSource | { kind: "store_catalog"; catalog: Uint8Array };

function readingSource(
  contentKind: SupplierPriceListContentKind,
  bytes: Uint8Array,
): ReadingSource {
  switch (contentKind) {
    case "HTML":
      return { kind: "web_page", html: bytes };
    case "STORE_CATALOG":
      return { kind: "store_catalog", catalog: bytes };
    case "PDF":
      return { kind: "pdf", bytes };
  }
}

async function storeCatalogExtraction(
  storeCatalogs: StoreCatalogs,
  catalog: Uint8Array,
  readOn: string,
): Promise<PriceListExtraction> {
  const reading = await storeCatalogs.rows(catalog);
  return reading.kind === "read"
    ? { kind: "extracted", ...storeCatalogListTerms(readOn), rows: reading.rows }
    : reading;
}

type Stop = { kind: "stop"; outcome: ReadSupplierPriceListOutcome };

// The job only writes this list's state and rows: it has no port to reach anything else.
export async function readSupplierPriceList(
  ports: ReadSupplierPriceListPorts,
  input: ReadSupplierPriceListInput,
): Promise<ReadSupplierPriceListOutcome> {
  const aiCalls = collectAiCalls(input.now, ports.zoneRules);
  try {
    return await readOnce(ports, input, aiCalls);
  } catch (error) {
    if (input.finalAttempt || aiCalls.hasAttempts()) {
      await settleFailedReading(ports.store, input, aiCalls);
    }
    throw error;
  }
}

async function recordReadingCalls(
  tx: SupplierPriceListStoreTransaction,
  list: LockedSupplierPriceList,
  aiCalls: AiCallCollector,
): Promise<void> {
  const records = aiCalls.records({
    purpose: "READING",
    listId: list.id,
    rowId: null,
    actorId: list.actorId,
  });
  if (records.length > 0) {
    await tx.recordAiCalls(records);
  }
}

function settleFailedReading(
  store: SupplierPriceListStore,
  { listId, finalAttempt }: ReadSupplierPriceListInput,
  aiCalls: AiCallCollector,
): Promise<void> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockList(listId);
    if (locked.kind === "not_found") {
      return;
    }
    await recordReadingCalls(tx, locked.list, aiCalls);
    if (!finalAttempt) {
      return;
    }
    const { state, sentAt, reread } = locked.list;
    if (state === "READING") {
      await tx.recordReadFailure(listId, sentAt === null ? "reading_unavailable" : "interrupted");
    } else if (reread !== null) {
      await tx.recordRereadFailure(
        reread.id,
        reread.sentAt === null ? "reading_unavailable" : "interrupted",
      );
    }
  });
}

// What is being read: the list itself the first time, a reread of it afterwards.
type Reading = { kind: "first" } | { kind: "reread"; id: string };

type Claim = Stop | { kind: "go"; reading: Reading; contentKind: SupplierPriceListContentKind };

function claimReading(
  tx: SupplierPriceListStoreTransaction,
  list: LockedSupplierPriceList,
): Promise<Claim> {
  if (list.state === "READING") {
    return claimFirstReading(tx, list);
  }
  return claimReread(tx, list);
}

async function claimFirstReading(
  tx: SupplierPriceListStoreTransaction,
  list: LockedSupplierPriceList,
): Promise<Claim> {
  if (list.sentAt !== null) {
    await tx.recordReadFailure(list.id, "interrupted");
    return { kind: "stop", outcome: { kind: "interrupted" } };
  }
  return { kind: "go", reading: { kind: "first" }, contentKind: list.contentKind };
}

async function claimReread(
  tx: SupplierPriceListStoreTransaction,
  { state, reread }: LockedSupplierPriceList,
): Promise<Claim> {
  if (reread === null) {
    return { kind: "stop", outcome: { kind: "already_read" } };
  }
  if (!maySupplierPriceListBeReadAgain(state)) {
    await tx.recordRereadFailure(reread.id, "interrupted");
    return { kind: "stop", outcome: { kind: "already_read" } };
  }
  if (reread.sentAt !== null) {
    await tx.recordRereadFailure(reread.id, "interrupted");
    return { kind: "stop", outcome: { kind: "interrupted" } };
  }
  return {
    kind: "go",
    reading: { kind: "reread", id: reread.id },
    contentKind: reread.contentKind,
  };
}

function isUnsent(list: LockedSupplierPriceList, reading: Reading): boolean {
  return reading.kind === "first"
    ? list.state === "READING" && list.sentAt === null
    : list.reread?.id === reading.id && list.reread.sentAt === null;
}

function isOpen(list: LockedSupplierPriceList, reading: Reading): boolean {
  return reading.kind === "first" ? list.state === "READING" : list.reread?.id === reading.id;
}

function recordFailure(
  tx: SupplierPriceListStoreTransaction,
  listId: string,
  reading: Reading,
  reason: SupplierPriceListReadFailure,
): Promise<void> {
  return reading.kind === "first"
    ? tx.recordReadFailure(listId, reason)
    : tx.recordRereadFailure(reading.id, reason);
}

function markSent(
  tx: SupplierPriceListStoreTransaction,
  listId: string,
  reading: Reading,
  sentAt: Date,
  sentOn: string,
): Promise<void> {
  return reading.kind === "first"
    ? tx.markSent(listId, sentAt, sentOn)
    : tx.markRereadSent(reading.id, sentAt, sentOn);
}

async function recordAnswer(
  tx: SupplierPriceListStoreTransaction,
  list: LockedSupplierPriceList,
  reading: Reading,
  listDate: string | null,
  pricesIncludeVat: boolean | null,
  rows: ProposedPriceListRow[],
): Promise<number> {
  const linked = await withRememberedLinks(tx, list.supplierId, rows);
  if (reading.kind === "first") {
    await tx.recordExtraction(list.id, listDate, pricesIncludeVat, linked);
    return linked.length;
  }
  const plan = planReread(await tx.listRows(list.id), await tx.removedItems(list.id), linked);
  await tx.recordReread(list.id, reading.id, listDate, pricesIncludeVat, plan);
  return plan.rows.length;
}

async function readOnce(
  { store, files, extractor, storeCatalogs, zoneRules }: ReadSupplierPriceListPorts,
  { listId, now }: ReadSupplierPriceListInput,
  aiCalls: AiCallCollector,
): Promise<ReadSupplierPriceListOutcome> {
  const claim = await store.transaction<Claim>(async (tx) => {
    const locked = await tx.lockList(listId);
    return locked.kind === "not_found"
      ? { kind: "stop", outcome: { kind: "not_found" } }
      : claimReading(tx, locked.list);
  });
  if (claim.kind === "stop") {
    return claim.outcome;
  }
  const { reading, contentKind } = claim;

  const file = await files.read(reading.kind === "first" ? listId : reading.id, contentKind);

  const sent = await store.transaction<
    Stop | { kind: "sent"; source: ReadingSource; sentOn: string }
  >(async (tx) => {
    const locked = await tx.lockList(listId);
    if (locked.kind === "not_found" || !isUnsent(locked.list, reading)) {
      return { kind: "stop", outcome: { kind: "already_read" } };
    }
    if (file === null) {
      await recordFailure(tx, listId, reading, "reading_unavailable");
      return { kind: "stop", outcome: { kind: "failed", reason: "reading_unavailable" } };
    }
    const sentAt = now();
    const sentOn = argentinaCalendarDay(sentAt, zoneRules.zoneRules());
    await markSent(tx, listId, reading, sentAt, sentOn);
    return { kind: "sent", source: readingSource(contentKind, file), sentOn };
  });
  if (sent.kind === "stop") {
    return sent.outcome;
  }

  const extraction =
    sent.source.kind === "store_catalog"
      ? await storeCatalogExtraction(storeCatalogs, sent.source.catalog, sent.sentOn)
      : await extractedOrUnavailable(extractor, sent.source, aiCalls);

  return store.transaction<ReadSupplierPriceListOutcome>(async (tx) => {
    const locked = await tx.lockList(listId);
    if (locked.kind === "not_found") {
      return { kind: "already_read" };
    }
    await recordReadingCalls(tx, locked.list, aiCalls);
    if (!isOpen(locked.list, reading)) {
      return { kind: "already_read" };
    }
    if (reading.kind === "reread" && !maySupplierPriceListBeReadAgain(locked.list.state)) {
      await tx.recordRereadFailure(reading.id, "interrupted");
      return { kind: "interrupted" };
    }
    if (extraction.kind === "unreadable") {
      await recordFailure(tx, listId, reading, "unreadable_document");
      return { kind: "failed", reason: "unreadable_document" };
    }
    if (extraction.kind === "unavailable") {
      await recordFailure(tx, listId, reading, "reading_unavailable");
      return { kind: "failed", reason: "reading_unavailable" };
    }
    if (extraction.rows.length === 0) {
      await recordFailure(tx, listId, reading, "no_items_found");
      return { kind: "failed", reason: "no_items_found" };
    }
    const listDate =
      extraction.listDate !== null && isCalendarDay(extraction.listDate)
        ? extraction.listDate
        : null;
    const rowCount = await recordAnswer(
      tx,
      locked.list,
      reading,
      listDate,
      extraction.pricesIncludeVat,
      extraction.rows.map(proposedRow),
    );
    return { kind: "extracted", rowCount };
  });
}
