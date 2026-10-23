import type {
  SupplierPriceListWebPageRead,
  SupplierPriceListWebPages,
} from "../supplier-price-list-web-pages.js";

export class FakeSupplierPriceListWebPages implements SupplierPriceListWebPages {
  readonly urls: string[] = [];
  answer: SupplierPriceListWebPageRead | Error = {
    kind: "read",
    contentKind: "HTML",
    bytes: new Uint8Array([60, 104, 49, 62]),
  };
  onRead: () => Promise<void> = async () => undefined;

  async read(url: string): Promise<SupplierPriceListWebPageRead> {
    this.urls.push(url);
    await this.onRead();
    if (this.answer instanceof Error) {
      throw this.answer;
    }
    return this.answer;
  }
}
