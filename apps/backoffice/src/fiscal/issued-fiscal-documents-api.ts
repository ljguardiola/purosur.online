import {
  type IssuedFiscalDocumentsBody,
  type IssuedFiscalDocumentsQuery,
  issuedFiscalDocumentsSchema,
  type ReportRegisterListBody,
  reportRegisterListSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
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
