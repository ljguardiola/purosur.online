import type { SaleUnit } from "../../catalog/index.js";
import type {
  AuthorizedFacturaC,
  DeferredSaleDocumentBlock,
  DeferredSaleReference,
  FacturaCFiscalBlock,
} from "../../fiscal/index.js";
import { deferredSaleDocumentBlock, facturaCFiscalBlock } from "../../fiscal/index.js";
import type { DiscountBenefit } from "../../pricing/index.js";
import type { CompletedSalePayment } from "./completed-sale.js";
import type { ManualAdjustmentValue } from "./manual-adjustment.js";
import type { LinePromotion } from "./sale.js";
import { type SaleDiscountValue, saleDiscountAmount } from "./sale-discount.js";

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
  manualAdjustment: ManualAdjustmentValue | null;
  discountAmount: number;
  lineTotal: number;
}

interface ReceiptSourcePayment {
  method: PaymentMethod;
  amount: number;
  tendered: number | null;
}

type ReceiptSourceFiscalDocument =
  | { kind: "none" }
  | { kind: "awaiting" }
  | { kind: "deferred"; deferred: DeferredSaleReference }
  | { kind: "authorized"; authorized: AuthorizedFacturaC };

export interface ReceiptSource {
  header: ReceiptHeader;
  occurredAt: Date;
  servedByFirstName: string;
  operationNumber: number;
  total: number;
  saleDiscount: SaleDiscountValue | null;
  lines: ReceiptSourceLine[];
  payments: ReceiptSourcePayment[];
  fiscal: ReceiptSourceFiscalDocument;
}

interface ReceiptContentLine {
  productName: string;
  saleUnit: SaleUnit;
  quantity: number;
  listUnitPrice: number;
  chargedUnitPrice: number;
  manualAdjustment: ManualAdjustmentValue | null;
  promotion: DiscountBenefit | null;
  discountAmount: number;
  lineTotal: number;
}

type ReceiptSaleDiscount =
  | { kind: "PERCENT"; percent: number; amount: number }
  | { kind: "AMOUNT"; amount: number };

export interface ReceiptContent {
  header: ReceiptHeader;
  operation: { occurredAt: Date; servedByFirstName: string; operationNumber: number };
  lines: ReceiptContentLine[];
  totals: {
    subtotal: number;
    saleDiscount: ReceiptSaleDiscount | null;
    total: number;
    payments: { method: PaymentMethod; amount: number }[];
    change: number;
  };
  fiscal: FacturaCFiscalBlock | DeferredSaleDocumentBlock | null;
}

function receiptSaleDiscount(
  subtotal: number,
  discount: SaleDiscountValue | null,
): ReceiptSaleDiscount | null {
  if (discount === null) {
    return null;
  }
  const amount = saleDiscountAmount(subtotal, discount);
  return discount.kind === "PERCENT"
    ? { kind: "PERCENT", percent: discount.percent, amount }
    : { kind: "AMOUNT", amount };
}

export function receiptContent(source: ReceiptSource): ReceiptContent {
  const lines = source.lines.map(
    ({ promotions, promotionId, ...line }): ReceiptContentLine => ({
      ...line,
      chargedUnitPrice:
        line.manualAdjustment?.kind === "PRICE"
          ? line.manualAdjustment.unitPrice
          : line.listUnitPrice,
      promotion: promotions.find(({ id }) => id === promotionId)?.benefit ?? null,
    }),
  );
  const subtotal = lines.reduce((sum, { lineTotal }) => sum + lineTotal, 0);
  return {
    header: source.header,
    operation: {
      occurredAt: source.occurredAt,
      servedByFirstName: source.servedByFirstName,
      operationNumber: source.operationNumber,
    },
    lines,
    totals: {
      subtotal,
      saleDiscount: receiptSaleDiscount(subtotal, source.saleDiscount),
      total: source.total,
      payments: source.payments.map(({ method, amount, tendered }) => ({
        method,
        amount: method === "CASH" && tendered !== null ? tendered : amount,
      })),
      change: source.payments.reduce(
        (sum, { method, amount, tendered }) =>
          method === "CASH" && tendered !== null ? sum + tendered - amount : sum,
        0,
      ),
    },
    fiscal: fiscalBlock(source.fiscal),
  };
}

function fiscalBlock(fiscal: ReceiptSourceFiscalDocument): ReceiptContent["fiscal"] {
  switch (fiscal.kind) {
    case "authorized":
      return facturaCFiscalBlock(fiscal.authorized);
    case "deferred":
      return deferredSaleDocumentBlock(fiscal.deferred);
    case "none":
    case "awaiting":
      return null;
  }
}
