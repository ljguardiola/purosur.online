import type { ZoneRules } from "../../shared/index.js";
import { maySupplierPriceListBeReadAgain } from "../model/supplier-price-list.js";
import {
  admissionRefusal,
  type LoadWebPageOutcome,
  type LoadWebPagePorts,
  type LoadWebPageRequest,
  startWebPageList,
  type WebPageRead,
} from "./load-web-page.js";
import type { SupplierPriceListStoreTransaction } from "./supplier-price-list-store.js";

export type RefreshSupplierPriceListWebPagePorts = LoadWebPagePorts;

export interface RefreshSupplierPriceListWebPageInput {
  listId: string;
  locationId: string;
  actorId: string;
  now: Date;
}

export type RefreshSupplierPriceListWebPageOutcome =
  | LoadWebPageOutcome
  | { kind: "not_found" }
  | { kind: "not_a_web_page" }
  | { kind: "already_reading" }
  | { kind: "reread_started"; listId: string };

type Admission =
  | { kind: "stop"; outcome: RefreshSupplierPriceListWebPageOutcome }
  | { kind: "admitted"; mode: "reread" | "new_list"; supplierId: string; url: string };

async function admission(
  tx: SupplierPriceListStoreTransaction,
  listId: string,
  request: LoadWebPageRequest,
  rules: ZoneRules,
): Promise<Admission> {
  const { cap } = await tx.lockBranchExtractionQuota(request.locationId);
  const found = await tx.findListSource(listId);
  if (found.kind === "not_found") {
    return { kind: "stop", outcome: { kind: "not_found" } };
  }
  if (found.source.kind !== "WEB_PAGE") {
    return { kind: "stop", outcome: { kind: "not_a_web_page" } };
  }
  const locked = await tx.lockList(listId);
  if (locked.kind === "not_found") {
    return { kind: "stop", outcome: { kind: "not_found" } };
  }
  const { state, reread } = locked.list;
  if (state === "READING" || reread !== null) {
    return { kind: "stop", outcome: { kind: "already_reading" } };
  }
  const refusal = await admissionRefusal(tx, found.supplierId, cap, request, rules);
  return refusal === null
    ? {
        kind: "admitted",
        mode: maySupplierPriceListBeReadAgain(state) ? "reread" : "new_list",
        supplierId: found.supplierId,
        url: found.source.url,
      }
    : { kind: "stop", outcome: refusal };
}

export async function refreshSupplierPriceListWebPage(
  { store, files, webPages, zoneRules }: RefreshSupplierPriceListWebPagePorts,
  { listId, ...request }: RefreshSupplierPriceListWebPageInput,
): Promise<RefreshSupplierPriceListWebPageOutcome> {
  const admitted = await store.transaction((tx) =>
    admission(tx, listId, request, zoneRules.zoneRules()),
  );
  if (admitted.kind === "stop") {
    return admitted.outcome;
  }

  const page = await webPages.read(admitted.url);
  if (page.kind === "refused") {
    return { kind: "page_refused", reason: page.reason };
  }

  return store.transaction<RefreshSupplierPriceListWebPageOutcome>(async (tx) => {
    const again = await admission(tx, listId, request, zoneRules.zoneRules());
    if (again.kind === "stop") {
      return again.outcome;
    }
    if (again.mode === "new_list") {
      return startWebPageList(tx, files, request, again, page);
    }
    return startReread(tx, files, listId, request, page);
  });
}

async function startReread(
  tx: SupplierPriceListStoreTransaction,
  files: RefreshSupplierPriceListWebPagePorts["files"],
  listId: string,
  { locationId, actorId, now }: LoadWebPageRequest,
  page: WebPageRead,
): Promise<{ kind: "reread_started"; listId: string }> {
  const { id } = await tx.startReread({
    listId,
    locationId,
    contentKind: page.contentKind,
    byteSize: page.bytes.byteLength,
    requestedAt: now,
    actorId,
  });
  await files.store(id, page.bytes, page.contentKind);
  await tx.enqueueReading(listId);

  return { kind: "reread_started", listId };
}
