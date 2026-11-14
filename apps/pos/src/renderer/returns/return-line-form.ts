import type { ReturnDraftLineBody } from "@purosur/contracts";
import type { ReturnDraftLine } from "./return-form";
import { draftLineBodyOf, returnRequestSchema } from "./return-form";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import type {
  ReturnDispositionValue,
  ReturnReasonValue,
  ReturnResolutionValue,
} from "./return-text";

export const returnLineRequestSchema = returnRequestSchema.shape.lines.element;

export type ReturnLineFormValues = {
  quantity: string;
  reason: ReturnReasonValue;
  disposition: ReturnDispositionValue;
  resolution: ReturnResolutionValue | null;
};

export const RETURN_LINE_FIELDS = {
  sale_line_id: null,
  quantity: null,
  reason: null,
  disposition: null,
  resolution: null,
} as const;

export function resolutionForReason(
  sale: SaleForReturn,
  reason: ReturnReasonValue,
  resolution: ReturnResolutionValue | null,
): ReturnResolutionValue | null {
  const offered = sale.offered_resolutions[reason];
  return resolution !== null && offered.includes(resolution) ? resolution : (offered[0] ?? null);
}

export function returnLineFormValuesOf(
  sale: SaleForReturn,
  draft: ReturnDraftLine,
): ReturnLineFormValues {
  const reason = draft.reason ?? "change_of_mind";
  return {
    quantity: draft.quantity,
    reason,
    disposition: draft.disposition ?? "restock",
    resolution: resolutionForReason(sale, reason, draft.resolution),
  };
}

export function returnLineRequestFrom(
  line: SaleLineForReturn,
  values: ReturnLineFormValues,
): ReturnDraftLineBody {
  return draftLineBodyOf(line, values);
}
