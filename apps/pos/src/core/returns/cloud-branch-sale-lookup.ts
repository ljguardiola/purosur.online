import {
  type BranchSaleForReturnAnswer,
  type BranchSaleForReturnQuery,
  branchSaleForReturnAnswerSchema,
} from "@purosur/contracts";
import type { SaleDiscount, TicketReference } from "@purosur/domain";
import type {
  BranchSaleFacts,
  BranchSaleLookup,
  BranchSaleLookupAnswer,
} from "@purosur/domain/returns/use-cases";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";

export const BRANCH_SALE_LOOKUP_TIMEOUT_MS = 8_000;

const SALE_PATH = "/api/devices/current/returns/sale";

export interface CloudBranchSaleLookupDeps {
  timeoutMs: number;
  readDeviceToken: () => Promise<string | undefined>;
  get: (
    path: string,
    headers: Record<string, string>,
    options: CloudCallOptions,
  ) => Promise<CloudResponse>;
}

const UNREACHABLE: BranchSaleLookupAnswer = { kind: "unreachable" };

function queryOf(ticket: TicketReference): BranchSaleForReturnQuery {
  return ticket.kind === "invoice"
    ? { point_of_sale: String(ticket.pointOfSale), number: String(ticket.number) }
    : { deferred_id: ticket.id, short_code: ticket.shortCode };
}

function discountOf({ sale_discount: discount }: BranchSaleForReturnAnswer["sale"]) {
  if (discount === null) {
    return null;
  }
  const common = { reason: discount.reason, authorizedBy: discount.authorized_by };
  return discount.kind === "PERCENT"
    ? ({ kind: "PERCENT", percent: discount.percent, ...common } satisfies SaleDiscount)
    : ({ kind: "AMOUNT", amount: discount.amount, ...common } satisfies SaleDiscount);
}

function factsOf(answer: BranchSaleForReturnAnswer): BranchSaleFacts {
  const { sale } = answer;
  return {
    sale: {
      sale: {
        id: sale.id,
        registerId: sale.register_id,
        deviceId: sale.device_id,
        sessionId: sale.session_id,
        actorId: sale.actor_id,
        state: sale.state,
        saleDiscount: discountOf(sale),
        lines: sale.lines.map((line) => ({
          id: line.id,
          productId: line.product_id,
          productName: line.product_name,
          saleUnit: line.sale_unit,
          quantity: line.quantity,
          promotionId: line.promotion_id,
          lineTotal: line.line_total,
        })),
      },
      occurredAt: new Date(answer.occurred_at),
      invoice:
        answer.invoice === null
          ? null
          : { pointOfSale: answer.invoice.point_of_sale, number: answer.invoice.number },
      payments: answer.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        provider: payment.provider,
        amount: payment.amount,
        state: payment.state,
        refundedAmount: payment.refunded_amount,
      })),
      returned: answer.returned.map((line) => ({
        saleLineId: line.sale_line_id,
        quantity: line.quantity,
        refundedAmount: line.refunded_amount,
      })),
    },
    invoiceStanding: {
      fiscalDocuments: answer.invoice_standing.fiscal_documents.map((document) => ({
        origin: document.origin,
        state: document.state,
        pointOfSale: document.point_of_sale,
        number: document.number,
        buyerTaxStatusCode: document.buyer_tax_status_code,
      })),
      deferralPending: answer.invoice_standing.deferral_pending,
    },
    goodConditionReturnDays: answer.good_condition_return_days,
    countedReturnIds: answer.counted_return_ids,
  };
}

function answerOf(response: CloudResponse): BranchSaleLookupAnswer {
  if (response.kind === "error") {
    return response.error.code === "not_found" ? { kind: "not_found" } : UNREACHABLE;
  }
  if (response.kind === "unreachable") {
    return UNREACHABLE;
  }
  const answer = branchSaleForReturnAnswerSchema.safeParse(response.body);
  return answer.success ? { kind: "found", ...factsOf(answer.data) } : UNREACHABLE;
}

export class CloudBranchSaleLookup implements BranchSaleLookup {
  private readonly deps: CloudBranchSaleLookupDeps;

  constructor(deps: CloudBranchSaleLookupDeps) {
    this.deps = deps;
  }

  async saleForReturn(ticket: TicketReference): Promise<BranchSaleLookupAnswer> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return UNREACHABLE;
    }
    const query = new URLSearchParams(queryOf(ticket));
    const response = await this.deps.get(
      `${SALE_PATH}?${query.toString()}`,
      { authorization: `Bearer ${deviceToken}` },
      { timeoutMs: this.deps.timeoutMs, singleAttempt: true },
    );
    return answerOf(response);
  }
}
