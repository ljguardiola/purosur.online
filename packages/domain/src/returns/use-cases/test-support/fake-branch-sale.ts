import type { LocalReturnOfSale } from "../../model/uncounted-returns.js";
import type {
  BranchSaleLookup,
  BranchSaleLookupAnswer,
  KeptBranchSale,
  OwnReturnsOfSale,
  RetainedBranchSales,
} from "../return-ports.js";
import type { TicketReference } from "../../model/ticket-reference.js";

export class FakeBranchSaleLookup implements BranchSaleLookup {
  readonly asked: TicketReference[] = [];
  private readonly answer: BranchSaleLookupAnswer;

  constructor(answer: BranchSaleLookupAnswer) {
    this.answer = answer;
  }

  async saleForReturn(ticket: TicketReference): Promise<BranchSaleLookupAnswer> {
    this.asked.push(ticket);
    return structuredClone(this.answer);
  }
}

export class FakeOwnReturns implements OwnReturnsOfSale {
  private readonly returns: Record<string, LocalReturnOfSale[]>;

  constructor(returns: Record<string, LocalReturnOfSale[]> = {}) {
    this.returns = returns;
  }

  returnsOfSale(saleId: string): LocalReturnOfSale[] {
    return structuredClone(this.returns[saleId] ?? []);
  }
}

export class FakeRetainedBranchSales implements RetainedBranchSales {
  readonly kept: KeptBranchSale[] = [];

  keep(sale: KeptBranchSale): void {
    this.kept.push(structuredClone(sale));
  }
}
