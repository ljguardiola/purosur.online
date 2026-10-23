import { type LoadWebPageOutcome, type LoadWebPagePorts, loadWebPage } from "./load-web-page.js";

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
  | { kind: "not_a_web_page" };

export function refreshSupplierPriceListWebPage(
  ports: RefreshSupplierPriceListWebPagePorts,
  { listId, ...request }: RefreshSupplierPriceListWebPageInput,
): Promise<RefreshSupplierPriceListWebPageOutcome> {
  return loadWebPage<RefreshSupplierPriceListWebPageOutcome>(ports, request, async (tx) => {
    const found = await tx.findListSource(listId);
    if (found.kind === "not_found") {
      return { kind: "stop", outcome: { kind: "not_found" } };
    }
    if (found.source.kind !== "WEB_PAGE") {
      return { kind: "stop", outcome: { kind: "not_a_web_page" } };
    }
    return { kind: "target", supplierId: found.supplierId, url: found.source.url };
  });
}
