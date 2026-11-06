import type { ReturnDraftLineBody } from "@purosur/contracts";
import { completeReturnMessageSchema } from "@purosur/contracts";
import {
  formatAmountInput,
  formatWeightInput,
  parseAmountCents,
  parseWeightThousandths,
} from "@purosur/ui";
import { ownEntry } from "./own-entry";
import type { PaymentForReturn, SaleForReturn, SaleLineForReturn } from "./return-sale";
import type {
  ReturnDispositionValue,
  ReturnReasonValue,
  ReturnResolutionValue,
} from "./return-text";

export const returnRequestSchema = completeReturnMessageSchema.pick({ lines: true, refunds: true });

export type ReturnDraftLine = {
  quantity: string;
  reason: ReturnReasonValue | null;
  disposition: ReturnDispositionValue | null;
  resolution: ReturnResolutionValue | null;
};

export type ReturnDraft = Readonly<Record<string, ReturnDraftLine>>;

export type ReturnFormValues = {
  lines: ReturnDraft;
  refunds: Readonly<Record<string, string>>;
};

export const RETURNED_WEIGHT_DECIMALS = 3;

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
    [line.id]: {
      quantity: quantityTextOf(line),
      reason: null,
      disposition: null,
      resolution: null,
    },
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
  const line = ownEntry(draft, lineId);
  if (line === undefined) {
    return draft;
  }
  const reasonChanged = change.reason !== undefined && change.reason !== line.reason;
  return {
    ...draft,
    [lineId]: { ...line, ...(reasonChanged ? { resolution: null } : {}), ...change },
  };
}

export function goesBackWhole(line: SaleLineForReturn, reason: ReturnReasonValue | null): boolean {
  return reason !== null && line.whole_only_reasons.includes(reason);
}

function quantityOf(line: SaleLineForReturn, drafted: ReturnDraftLine): number {
  const typed = drafted.quantity;
  if (goesBackWhole(line, drafted.reason)) {
    return line.returnable_quantity;
  }
  if (line.sale_unit === "KG") {
    return parseWeightThousandths(typed) ?? 0;
  }
  return /^\d+$/.test(typed.trim()) ? Number(typed) : 0;
}

export function draftLinesFor(sale: SaleForReturn, draft: ReturnDraft): ReturnDraftLineBody[] {
  return sale.lines.flatMap((line) => {
    const drafted = ownEntry(draft, line.id);
    return drafted === undefined
      ? []
      : [
          {
            sale_line_id: line.id,
            quantity: quantityOf(line, drafted),
            reason: drafted.reason,
            disposition: drafted.disposition,
            resolution: drafted.resolution,
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
    const edited = ownEntry(edits, payment.payment_id);
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
