import type { SaleUnit } from "../../catalog/index.js";
import type { DiscountBenefit } from "../../pricing/index.js";
import type { CompletedSalePayment } from "./completed-sale.js";
import type { LinePromotion } from "./sale.js";

type PaymentMethod = CompletedSalePayment["method"];

interface ReceiptHeader {
  address: string;
  whatsappNumber: string;
  instagramHandle: string;
}

interface ReceiptSourceLine {
  productName: string;
  saleUnit: SaleUnit;
  quantity: number;
  listUnitPrice: number;
  promotions: LinePromotion[];
  promotionId: string | null;
  discountAmount: number;
  lineTotal: number;
}

interface ReceiptSourcePayment {
  method: PaymentMethod;
  amount: number;
  tendered: number | null;
}

export interface ReceiptSource {
  header: ReceiptHeader;
  occurredAt: Date;
  servedByFirstName: string;
  operationNumber: number;
  total: number;
  lines: ReceiptSourceLine[];
  payments: ReceiptSourcePayment[];
}

interface ReceiptContentLine {
  productName: string;
  saleUnit: SaleUnit;
  quantity: number;
  listUnitPrice: number;
  promotion: DiscountBenefit | null;
  discountAmount: number;
  lineTotal: number;
}

export interface ReceiptContent {
  header: ReceiptHeader;
  operation: { occurredAt: Date; servedByFirstName: string; operationNumber: number };
  lines: ReceiptContentLine[];
  totals: {
    subtotal: number;
    total: number;
    payments: { method: PaymentMethod; amount: number }[];
    change: number;
  };
}

export function receiptContent(source: ReceiptSource): ReceiptContent {
  const lines = source.lines.map(
    ({ promotions, promotionId, ...line }): ReceiptContentLine => ({
      ...line,
      promotion: promotions.find(({ id }) => id === promotionId)?.benefit ?? null,
    }),
  );
  return {
    header: source.header,
    operation: {
      occurredAt: source.occurredAt,
      servedByFirstName: source.servedByFirstName,
      operationNumber: source.operationNumber,
    },
    lines,
    totals: {
      subtotal: lines.reduce((sum, { lineTotal }) => sum + lineTotal, 0),
      total: source.total,
      payments: source.payments.map(({ method, amount }) => ({ method, amount })),
      change: source.payments.reduce(
        (sum, { method, amount, tendered }) =>
          method === "CASH" && tendered !== null ? sum + tendered - amount : sum,
        0,
      ),
    },
  };
}
