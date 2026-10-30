import { argentinaCalendarDay, type ZoneRules, type ZoneRulesSource } from "../../shared/index.js";
import { dailyExtractionCapReached } from "../model/supplier-price-list.js";
import type { SupplierPriceListWebPageRefusal } from "../model/supplier-price-list-web-page.js";
import type { SupplierPriceListFiles } from "./supplier-price-list-files.js";
import type {
  SupplierPriceListStore,
  SupplierPriceListStoreTransaction,
} from "./supplier-price-list-store.js";
import type {
  SupplierPriceListWebPageRead,
  SupplierPriceListWebPages,
} from "./supplier-price-list-web-pages.js";

export interface LoadWebPagePorts {
  store: SupplierPriceListStore;
  files: SupplierPriceListFiles;
  webPages: SupplierPriceListWebPages;
  zoneRules: ZoneRulesSource;
}

export interface LoadWebPageRequest {
  locationId: string;
  actorId: string;
  now: Date;
}

export type LoadWebPageOutcome =
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | { kind: "daily_cap_reached"; cap: number }
  | { kind: "page_refused"; reason: SupplierPriceListWebPageRefusal }
  | { kind: "loaded"; listId: string };

export type WebPageRead = Extract<SupplierPriceListWebPageRead, { kind: "read" }>;

export async function admissionRefusal(
  tx: SupplierPriceListStoreTransaction,
  supplierId: string,
  cap: number,
  { locationId, now }: LoadWebPageRequest,
  rules: ZoneRules,
): Promise<LoadWebPageOutcome | null> {
  const supplier = await tx.findSupplier(supplierId);
  if (supplier.kind === "not_found") {
    return { kind: "supplier_not_found" };
  }
  if (!supplier.supplier.active) {
    return { kind: "supplier_inactive" };
  }

  const counted = await tx.extractionsCountedOn(locationId, argentinaCalendarDay(now, rules));
  return dailyExtractionCapReached(counted, cap) ? { kind: "daily_cap_reached", cap } : null;
}

export async function startWebPageList(
  tx: SupplierPriceListStoreTransaction,
  files: SupplierPriceListFiles,
  request: LoadWebPageRequest,
  target: { supplierId: string; url: string },
  page: WebPageRead,
): Promise<{ kind: "loaded"; listId: string }> {
  const { id } = await tx.insertList({
    supplierId: target.supplierId,
    locationId: request.locationId,
    sourceKind: "WEB_PAGE",
    sourceUrl: target.url,
    contentKind: page.contentKind,
    byteSize: page.bytes.byteLength,
    uploadedAt: request.now,
    actorId: request.actorId,
  });
  await files.store(id, page.bytes, page.contentKind);
  await tx.enqueueReading(id);

  return { kind: "loaded", listId: id };
}

export async function loadWebPage(
  { store, files, webPages, zoneRules }: LoadWebPagePorts,
  request: LoadWebPageRequest,
  target: { supplierId: string; url: string },
): Promise<LoadWebPageOutcome> {
  const refusedBefore = await store.transaction(async (tx) => {
    const { cap } = await tx.lockBranchExtractionQuota(request.locationId);
    return admissionRefusal(tx, target.supplierId, cap, request, zoneRules.zoneRules());
  });
  if (refusedBefore !== null) {
    return refusedBefore;
  }

  const page = await webPages.read(target.url);
  if (page.kind === "refused") {
    return { kind: "page_refused", reason: page.reason };
  }

  return store.transaction<LoadWebPageOutcome>(async (tx) => {
    const { cap } = await tx.lockBranchExtractionQuota(request.locationId);
    const refusal = await admissionRefusal(
      tx,
      target.supplierId,
      cap,
      request,
      zoneRules.zoneRules(),
    );
    return refusal ?? startWebPageList(tx, files, request, target, page);
  });
}
