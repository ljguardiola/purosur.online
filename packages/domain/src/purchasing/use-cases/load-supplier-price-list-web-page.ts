import { type LoadWebPageOutcome, type LoadWebPagePorts, loadWebPage } from "./load-web-page.js";

export type LoadSupplierPriceListWebPagePorts = LoadWebPagePorts;

export interface LoadSupplierPriceListWebPageInput {
  supplierId: string;
  locationId: string;
  url: string;
  actorId: string;
  now: Date;
}

export type LoadSupplierPriceListWebPageOutcome = LoadWebPageOutcome;

export function loadSupplierPriceListWebPage(
  ports: LoadSupplierPriceListWebPagePorts,
  { supplierId, url, ...request }: LoadSupplierPriceListWebPageInput,
): Promise<LoadSupplierPriceListWebPageOutcome> {
  return loadWebPage(ports, request, async () => ({ kind: "target", supplierId, url }));
}
