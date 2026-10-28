import {
  type IssuedFiscalDocumentDetailBody,
  type IssuedFiscalDocumentsBody,
  type IssuedFiscalDocumentsQuery,
  issuedFiscalDocumentDetailSchema,
  issuedFiscalDocumentsSchema,
  type ReportRegisterListBody,
  reportRegisterListSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchIssuedFiscalDocuments(
  query: IssuedFiscalDocumentsQuery,
): Promise<CloudReadOutcome<IssuedFiscalDocumentsBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id", "kind", "number", "page"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  const path = "/api/fiscal/documents";
  return readCloudJson(search ? `${path}?${search}` : path, issuedFiscalDocumentsSchema);
}

export function fetchFiscalRegisters(): Promise<CloudReadOutcome<ReportRegisterListBody>> {
  return readCloudJson("/api/fiscal/registers", reportRegisterListSchema);
}

export type FetchIssuedFiscalDocumentOutcome =
  | CloudReadOutcome<IssuedFiscalDocumentDetailBody>
  | { kind: "not_found" };

export async function fetchIssuedFiscalDocument(voucher: {
  voucher_type: number;
  point_of_sale: number;
  number: number;
}): Promise<FetchIssuedFiscalDocumentOutcome> {
  const path = `/api/fiscal/documents/${voucher.voucher_type}/${voucher.point_of_sale}/${voucher.number}`;
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = issuedFiscalDocumentDetailSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}
