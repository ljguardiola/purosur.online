import type { DeferredSaleFacts } from "../../model/deferred-sale-lookup.js";
import type {
  DeferredSaleInvoicing,
  DeferredSaleInvoicingOutcome,
  DeferredSaleLine,
  DeferredSaleLookup,
  DeferredSaleSearch,
} from "../deferred-sale-lookup-ports.js";

export function deferredSaleFacts(overrides: Partial<DeferredSaleFacts> = {}): DeferredSaleFacts {
  return {
    deferredSaleId: "deferred-1",
    saleId: "sale-1",
    occurredAt: new Date("2026-10-07T15:00:00.000Z"),
    total: 6_750,
    shortCode: "7KQ4M2P9",
    cancelled: false,
    saleVoided: false,
    invoice: { kind: "pending" },
    originalPrintAttempted: false,
    lastIssuedOn: null,
    ...overrides,
  };
}

export function deferredSaleLine(overrides: Partial<DeferredSaleLine> = {}): DeferredSaleLine {
  return {
    productName: "Yerba mate orgánica 1 kg",
    saleUnit: "UNIT",
    quantity: 1,
    listUnitPrice: 695_000,
    lineTotal: 695_000,
    ...overrides,
  };
}

export class FakeDeferredSaleLookup implements DeferredSaleLookup {
  readonly searches: DeferredSaleSearch[] = [];
  private sales: DeferredSaleFacts[];
  private readonly lines: Readonly<Record<string, DeferredSaleLine[]>>;

  constructor(
    sales: DeferredSaleFacts[] = [deferredSaleFacts()],
    lines: Readonly<Record<string, DeferredSaleLine[]>> = {},
  ) {
    this.sales = sales;
    this.lines = lines;
  }

  linesOf(saleId: string): DeferredSaleLine[] {
    return this.lines[saleId] ?? [];
  }

  find(search: DeferredSaleSearch): DeferredSaleFacts | null {
    this.searches.push(search);
    return this.sales.find((sale) => matches(sale, search)) ?? null;
  }

  invoice(saleId: string, pointOfSale: number, number: number): void {
    this.sales = this.sales.map((sale) =>
      sale.saleId === saleId ? { ...sale, invoice: { kind: "issued", pointOfSale, number } } : sale,
    );
  }

  void(saleId: string): void {
    this.sales = this.sales.map((sale) =>
      sale.saleId === saleId ? { ...sale, saleVoided: true } : sale,
    );
  }
}

function matches(sale: DeferredSaleFacts, search: DeferredSaleSearch): boolean {
  switch (search.kind) {
    case "short_code":
      return sale.shortCode === search.shortCode;
    case "reference":
      return sale.deferredSaleId === search.id && sale.shortCode === search.shortCode;
    case "sale":
      return sale.saleId === search.saleId;
  }
}

export class FakeDeferredSaleInvoicing implements DeferredSaleInvoicing {
  readonly invoicedUpTo: string[] = [];
  private readonly answer: DeferredSaleInvoicingOutcome;
  private readonly onInvoice: (saleId: string) => void;

  constructor(
    answer: DeferredSaleInvoicingOutcome,
    onInvoice: (saleId: string) => void = () => {},
  ) {
    this.answer = answer;
    this.onInvoice = onInvoice;
  }

  async invoiceUpTo(saleId: string): Promise<DeferredSaleInvoicingOutcome> {
    this.invoicedUpTo.push(saleId);
    this.onInvoice(saleId);
    return this.answer;
  }
}
