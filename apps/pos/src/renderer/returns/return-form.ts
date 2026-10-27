import type { ReturnDraftLineBody } from "@purosur/contracts";
import { completeReturnMessageSchema } from "@purosur/contracts";
import {
  formatAmountInput,
  formatWeightInput,
  parseAmountCents,
  parseWeightThousandths,
} from "@purosur/ui";
import type { PaymentForReturn, SaleForReturn, SaleLineForReturn } from "./return-sale";
import type { ReturnDispositionValue, ReturnReasonValue } from "./return-text";

export const returnRequestSchema = completeReturnMessageSchema.pick({ lines: true, refunds: true });

export type ReturnDraftLine = {
  quantity: string;
  reason: ReturnReasonValue | null;
  disposition: ReturnDispositionValue | null;
};

export type ReturnDraft = Readonly<Record<string, ReturnDraftLine>>;

export type ReturnFormValues = {
  lines: ReturnDraft;
  refunds: Readonly<Record<string, string>>;
};

export const EMPTY_RETURN_DRAFT: ReturnDraft = {};

export const EMPTY_RETURN_FORM: ReturnFormValues = { lines: EMPTY_RETURN_DRAFT, refunds: {} };

export const RETURN_FIELDS = { lines: null, refunds: "refunds" } as const;

export const INVALID_REFUND_MESSAGE = "Ingresá un importe válido, por ejemplo 1.500,00.";

function quantityTextOf({
  sale_unit: saleUnit,
  returnable_quantity: returnable,
}: SaleLineForReturn) {
  return saleUnit === "KG" ? formatWeightInput(returnable) : String(returnable);
}

export function checkLine(draft: ReturnDraft, line: SaleLineForReturn): ReturnDraft {
  return {
    ...draft,
    [line.id]: { quantity: quantityTextOf(line), reason: null, disposition: null },
  };
}

export function uncheckLine(draft: ReturnDraft, lineId: string): ReturnDraft {
  return Object.fromEntries(Object.entries(draft).filter(([id]) => id !== lineId));
}

export function changeLine(
  draft: ReturnDraft,
  lineId: string,
  change: Partial<ReturnDraftLine>,
): ReturnDraft {
  const line = draft[lineId];
  return line === undefined ? draft : { ...draft, [lineId]: { ...line, ...change } };
}

function quantityOf(line: SaleLineForReturn, typed: string): number {
  if (line.must_be_returned_whole) {
    return line.returnable_quantity;
  }
  if (line.sale_unit === "KG") {
    return parseWeightThousandths(typed) ?? 0;
  }
  return /^\d+$/.test(typed.trim()) ? Number(typed) : 0;
}

export function draftLinesFor(sale: SaleForReturn, draft: ReturnDraft): ReturnDraftLineBody[] {
  return sale.lines.flatMap((line) => {
    const drafted = draft[line.id];
    return drafted === undefined
      ? []
      : [
          {
            sale_line_id: line.id,
            quantity: quantityOf(line, drafted.quantity),
            reason: drafted.reason,
            disposition: drafted.disposition,
          },
        ];
  });
}

export type PaymentRefundText = { payment: PaymentForReturn; text: string };

export function refundTextsFor(
  payments: readonly PaymentForReturn[],
  refundableTotal: number,
  edits: Readonly<Record<string, string>>,
): PaymentRefundText[] {
  const firstEligible = payments.find(({ eligible }) => eligible);
  return payments.map((payment) => {
    const edited = edits[payment.payment_id];
    if (edited !== undefined) {
      return { payment, text: edited };
    }
    return {
      payment,
      text:
        payment === firstEligible && refundableTotal > 0 ? formatAmountInput(refundableTotal) : "",
    };
  });
}

export function isRefundTextInvalid(text: string): boolean {
  return text.trim() !== "" && parseAmountCents(text) === undefined;
}

export function refundsOf(texts: readonly PaymentRefundText[]) {
  return texts.flatMap(({ payment, text }) => {
    if (text.trim() === "") {
      return [];
    }
    const amount = parseAmountCents(text) ?? Number.NaN;
    return amount === 0 ? [] : [{ payment_id: payment.payment_id, amount }];
  });
}

export function returnRequestFrom(
  sale: SaleForReturn,
  refundableTotal: number,
  { lines, refunds }: ReturnFormValues,
): { lines: ReturnDraftLineBody[]; refunds: { payment_id: string; amount: number }[] } {
  return {
    lines: draftLinesFor(sale, lines),
    refunds: refundsOf(refundTextsFor(sale.payments, refundableTotal, refunds)),
  };
}
