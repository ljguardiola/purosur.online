import { argentinaCalendarDay, type ZoneRules, type ZoneRulesSource } from "../../shared/index.js";
import { dailyExtractionCapReached } from "../model/supplier-price-list.js";
import type { SupplierPriceListWebPageRefusal } from "../model/supplier-price-list-web-page.js";
import type { SupplierPriceListFiles } from "./supplier-price-list-files.js";
import type {
  SupplierPriceListStore,
  SupplierPriceListStoreTransaction,
} from "./supplier-price-list-store.js";
import type { SupplierPriceListWebPages } from "./supplier-price-list-web-pages.js";

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

export type WebPageTarget<TStop> =
  | { kind: "target"; supplierId: string; url: string }
  | { kind: "stop"; outcome: TStop };

async function admissionRefusal(
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

type Admitted<TStop> =
  | { kind: "stop"; outcome: LoadWebPageOutcome | TStop }
  | { kind: "admitted"; supplierId: string; url: string };

export async function loadWebPage<TStop>(
  { store, files, webPages, zoneRules }: LoadWebPagePorts,
  request: LoadWebPageRequest,
  resolveTarget: (tx: SupplierPriceListStoreTransaction) => Promise<WebPageTarget<TStop>>,
): Promise<LoadWebPageOutcome | TStop> {
  const admitted = await store.transaction<Admitted<TStop>>(async (tx) => {
    const { cap } = await tx.lockBranchExtractionQuota(request.locationId);
    const target = await resolveTarget(tx);
    if (target.kind === "stop") {
      return target;
    }
    const refusal = await admissionRefusal(
      tx,
      target.supplierId,
      cap,
      request,
      zoneRules.zoneRules(),
    );
    return refusal === null
      ? { kind: "admitted", supplierId: target.supplierId, url: target.url }
      : { kind: "stop", outcome: refusal };
  });
  if (admitted.kind === "stop") {
    return admitted.outcome;
  }

  const page = await webPages.read(admitted.url);
  if (page.kind === "refused") {
    return { kind: "page_refused", reason: page.reason };
  }

  return store.transaction<LoadWebPageOutcome>(async (tx) => {
    const { cap } = await tx.lockBranchExtractionQuota(request.locationId);
    const refusal = await admissionRefusal(
      tx,
      admitted.supplierId,
      cap,
      request,
      zoneRules.zoneRules(),
    );
    if (refusal !== null) {
      return refusal;
    }

    const { id } = await tx.insertList({
      supplierId: admitted.supplierId,
      locationId: request.locationId,
      sourceKind: "WEB_PAGE",
      sourceUrl: admitted.url,
      contentKind: page.contentKind,
      byteSize: page.bytes.byteLength,
      uploadedAt: request.now,
      actorId: request.actorId,
    });
    await files.store(id, page.bytes, page.contentKind);
    await tx.enqueueReading(id);

    return { kind: "loaded", listId: id };
  });
}
