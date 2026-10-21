import {
  type FortnightPresentationBody,
  fortnightPresentationListSchema,
  type RejectedDocumentRemedyBody,
  rejectedDocumentRemedyResponseSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";
import {
  errorCodeOf,
  readCloudList,
  sendJson,
  type WriteFailure,
  writeFailureOf,
} from "./fiscal-api-request";

export type RejectedDocument = {
  number: number;
  unprocessed: number;
  documentId: string;
  issuedOn: string;
  total: number;
  buyerDocumentType: number;
  buyerDocumentNumber: number;
  buyerTaxStatusCode: number;
  rejections: { code: number; message: string }[];
  remedy: "awaiting_remedy" | "awaiting_resend";
};

export type CorrectionRefusal =
  | "nothing_changed"
  | "date_outside_fortnight"
  | "date_out_of_order"
  | "invalid_total"
  | "invalid_buyer_identification";

export type RemedyRejectedDocumentOutcome =
  | {
      kind: "ok";
      value: {
        recordedAt: string;
        changes: { field: string; before: string | number; after: string | number }[];
      };
    }
  | { kind: "validation_failed"; field: string }
  | { kind: "not_found" }
  | { kind: "not_rejected" }
  | { kind: "already_remedied" }
  | { kind: "correction_refused"; refusal: CorrectionRefusal }
  | WriteFailure;

const CORRECTION_REFUSALS: readonly CorrectionRefusal[] = [
  "nothing_changed",
  "date_outside_fortnight",
  "date_out_of_order",
  "invalid_total",
  "invalid_buyer_identification",
];

function isCorrectionRefusal(value: unknown): value is CorrectionRefusal {
  return CORRECTION_REFUSALS.some((refusal) => refusal === value);
}

export type FortnightPresentation = {
  registerId: string;
  pointOfSaleNumber: number;
  fortnight: { start: string; end: string };
  deadline: string;
  documentType: FortnightPresentationBody["document_type"];
  documentCount: number;
  rejectedDocument: RejectedDocument | null;
  movement: FortnightPresentationBody["movement"];
  refusal: FortnightPresentationBody["refusal"];
  state: FortnightPresentationBody["state"];
};

export type FetchFortnightPresentationsOutcome = CloudReadOutcome<FortnightPresentation[]>;

function rejectedDocumentFromWire(
  row: NonNullable<FortnightPresentationBody["rejected_document"]>,
): RejectedDocument {
  return {
    number: row.number,
    unprocessed: row.unprocessed,
    documentId: row.document_id,
    issuedOn: row.issued_on,
    total: row.total,
    buyerDocumentType: row.buyer_document_type,
    buyerDocumentNumber: row.buyer_document_number,
    buyerTaxStatusCode: row.buyer_tax_status_code,
    rejections: row.rejections,
    remedy: row.remedy,
  };
}

function fortnightPresentationFromWire(row: FortnightPresentationBody): FortnightPresentation {
  return {
    registerId: row.register_id,
    pointOfSaleNumber: row.point_of_sale_number,
    fortnight: { start: row.fortnight_start, end: row.fortnight_end },
    deadline: row.deadline,
    documentType: row.document_type,
    documentCount: row.document_count,
    rejectedDocument: row.rejected_document && rejectedDocumentFromWire(row.rejected_document),
    movement: row.movement,
    refusal: row.refusal,
    state: row.state,
  };
}

export function fetchFortnightPresentations(): Promise<FetchFortnightPresentationsOutcome> {
  return readCloudList("/api/registers/fortnight-presentations", (body) =>
    fortnightPresentationListSchema.safeParse(body).data?.map(fortnightPresentationFromWire),
  );
}

export async function remedyRejectedDocument(
  body: RejectedDocumentRemedyBody,
): Promise<RemedyRejectedDocumentOutcome> {
  const response = await sendJson(
    "POST",
    "/api/registers/fortnight-presentations/rejected-document-remedies",
    body,
  );
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = rejectedDocumentRemedyResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success
      ? {
          kind: "ok",
          value: { recordedAt: parsed.data.recorded_at, changes: parsed.data.changes },
        }
      : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await errorCodeOf(response);
    return code === "not_rejected" || code === "already_remedied"
      ? { kind: code }
      : { kind: "failed" };
  }
  if (response.status === 422) {
    return correctionRefusalOf(response);
  }
  return writeFailureOf(response);
}

async function correctionRefusalOf(response: Response): Promise<RemedyRejectedDocumentOutcome> {
  const body = (await response.json().catch(() => undefined)) as
    | { code?: unknown; refusal?: unknown }
    | undefined;
  const refusal = body?.refusal;
  return body?.code === "correction_refused" && isCorrectionRefusal(refusal)
    ? { kind: "correction_refused", refusal }
    : { kind: "failed" };
}
