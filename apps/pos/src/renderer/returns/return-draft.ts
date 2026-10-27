import type { ReturnDraftLineBody } from "@purosur/contracts";
import { formatWeightInput, parseWeightThousandths } from "@purosur/ui";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import type { ReturnDispositionValue, ReturnReasonValue } from "./return-text";

export type ReturnDraftLine = {
  quantity: string;
  reason: ReturnReasonValue | null;
  disposition: ReturnDispositionValue | null;
};

export type ReturnDraft = Readonly<Record<string, ReturnDraftLine>>;

export const EMPTY_RETURN_DRAFT: ReturnDraft = {};

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
