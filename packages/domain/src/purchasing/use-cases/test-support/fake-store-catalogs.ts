import type { StoreCatalogReading, StoreCatalogs } from "../store-catalogs.js";

export class FakeStoreCatalogs implements StoreCatalogs {
  readonly received: Uint8Array[] = [];
  answer: StoreCatalogReading = { kind: "read", rows: [] };

  async rows(catalog: Uint8Array): Promise<StoreCatalogReading> {
    this.received.push(catalog);
    return this.answer;
  }
}
