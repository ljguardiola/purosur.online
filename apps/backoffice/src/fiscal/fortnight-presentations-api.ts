import {
  type FortnightPresentationBody,
  fortnightPresentationListSchema,
  type RejectedDocumentRemedyBody,
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

type RejectedDocumentBody = NonNullable<FortnightPresentationBody["rejected_document"]>;

export type RejectedDocument = {
  number: number;
  unprocessed: number;
  issuedOn: string;
  total: number;
  buyer: RejectedDocumentBody["buyer"];
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
  | { kind: "ok" }
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

function rejectedDocumentFromWire(row: RejectedDocumentBody): RejectedDocument {
  return {
    number: row.number,
    unprocessed: row.unprocessed,
    issuedOn: row.issued_on,
    total: row.total,
    buyer: row.buyer,
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
    return { kind: "ok" };
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
