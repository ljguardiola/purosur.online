import type { FiscalOnlineSignalEvidence } from "../../../fiscal/index.js";
import { type SaleFiscalFacts, saleStandingOf } from "../../model/sale-history.js";
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
  readonly filters: { scope: "open_session" | "register"; filter: SalesHistoryFilter }[] = [];
  private readonly sales: FakeHistorySale[];
  private readonly evidence: FiscalOnlineSignalEvidence;

  constructor(
    sales: FakeHistorySale[] = [],
    evidence: FiscalOnlineSignalEvidence = {
      lastHealthCheckOkAt: null,
      tokenValid: false,
      arcaReachable: false,
    },
  ) {
    this.sales = sales;
    this.evidence = evidence;
  }

  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence {
    return this.evidence;
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
