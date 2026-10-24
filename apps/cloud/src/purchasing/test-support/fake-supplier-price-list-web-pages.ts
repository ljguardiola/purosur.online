import type {
  SupplierPriceListWebPageRead,
  SupplierPriceListWebPages,
} from "@purosur/domain/purchasing/use-cases";

export class FakeSupplierPriceListWebPages implements SupplierPriceListWebPages {
  readonly urls: string[] = [];
  answer: SupplierPriceListWebPageRead = {
    kind: "read",
    contentKind: "HTML",
    bytes: new TextEncoder().encode(
      "<html><body><table><tr><td>Yerba</td></tr></table></body></html>",
    ),
  };

  async read(url: string): Promise<SupplierPriceListWebPageRead> {
    this.urls.push(url);
    return this.answer;
  }
}
