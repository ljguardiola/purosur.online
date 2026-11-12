import {
  type SaleDocumentNumber,
  type SaleFiscalFacts,
  saleStandingOf,
} from "../../model/sale-history.js";
import type {
  RegisterSalesHistory,
  SaleHistoryRecord,
  SalesHistoryEntry,
  SalesHistoryFilter,
  SalesHistoryPage,
} from "../register-sales-history.js";

export interface FakeHistorySale {
  entry: SalesHistoryEntry;
  inOpenSession: boolean;
  record?: SaleHistoryRecord;
}

export class FakeRegisterSalesHistory implements RegisterSalesHistory {
  readonly documentSearches: {
    scope: "open_session" | "register";
    document: SaleDocumentNumber;
  }[] = [];
  readonly filters: { scope: "open_session" | "register"; filter: SalesHistoryFilter }[] = [];
  private readonly sales: FakeHistorySale[];

  constructor(sales: FakeHistorySale[] = []) {
    this.sales = sales;
  }

  salesOfOpenSession(filter: SalesHistoryFilter): SalesHistoryPage {
    this.filters.push({ scope: "open_session", filter });
    return this.pageOf(
      this.sales.filter(({ inOpenSession }) => inOpenSession),
      filter,
    );
  }

  salesOfRegister(filter: SalesHistoryFilter): SalesHistoryPage {
    this.filters.push({ scope: "register", filter });
    return this.pageOf(this.sales, filter);
  }

  salesOfOpenSessionWithDocument(document: SaleDocumentNumber): SalesHistoryEntry[] {
    this.documentSearches.push({ scope: "open_session", document });
    return this.candidatesOf(
      this.sales.filter(({ inOpenSession }) => inOpenSession),
      document,
    );
  }

  salesOfRegisterWithDocument(document: SaleDocumentNumber): SalesHistoryEntry[] {
    this.documentSearches.push({ scope: "register", document });
    return this.candidatesOf(this.sales, document);
  }

  saleOfRegister(saleId: string): SaleHistoryRecord | undefined {
    return this.sales.find(({ entry }) => entry.saleId === saleId)?.record;
  }

  fiscalFactsOfSale(saleId: string): SaleFiscalFacts {
    return (
      this.sales.find(({ entry }) => entry.saleId === saleId)?.entry.fiscal ?? {
        deferred: false,
        fiscalDocument: null,
      }
    );
  }

  private candidatesOf(sales: FakeHistorySale[], { number }: SaleDocumentNumber) {
    return sales
      .filter(({ entry }) => entry.fiscal.fiscalDocument?.number === number)
      .map(({ entry }) => entry);
  }

  private pageOf(sales: FakeHistorySale[], { standing, offset, limit }: SalesHistoryFilter) {
    const matching = sales.filter(
      ({ entry }) =>
        standing === undefined ||
        saleStandingOf({ ...entry.fiscal, voided: entry.voided }) === standing,
    );
    return {
      entries: matching.slice(offset, offset + limit).map(({ entry }) => entry),
      total: matching.length,
    };
  }
}
