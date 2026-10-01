import {
  type FiscalAddressBody,
  type FiscalAddressCreationBody,
  type FiscalAddressEditBody,
  fiscalAddressListSchema,
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

export type FiscalAddress = {
  id: string;
  name: string;
  streetAddress: string;
  version: number;
};

export type FetchFiscalAddressesOutcome = CloudReadOutcome<FiscalAddress[]>;

export type CreateFiscalAddressOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | WriteFailure;

export type EditFiscalAddressOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | WriteFailure;

function fiscalAddressFromWire(row: FiscalAddressBody): FiscalAddress {
  return { id: row.id, name: row.name, streetAddress: row.street_address, version: row.version };
}

export function fetchFiscalAddresses(): Promise<FetchFiscalAddressesOutcome> {
  return readCloudList("/api/fiscal-addresses", (body) =>
    fiscalAddressListSchema.safeParse(body).data?.map(fiscalAddressFromWire),
  );
}

async function validationFailure(
  response: Response,
): Promise<{ kind: "validation_failed"; field: string } | { kind: "failed" }> {
  const field = await readValidationFailedField(response);
  return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
}

export async function createFiscalAddress(
  body: FiscalAddressCreationBody,
): Promise<CreateFiscalAddressOutcome> {
  const response = await sendJson("POST", "/api/fiscal-addresses", body);
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    return validationFailure(response);
  }
  if (response.status === 409) {
    return { kind: "name_taken" };
  }
  return writeFailureOf(response);
}

export async function editFiscalAddress(
  id: string,
  body: FiscalAddressEditBody,
): Promise<EditFiscalAddressOutcome> {
  const response = await sendJson("PUT", `/api/fiscal-addresses/${id}`, body);
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    return validationFailure(response);
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return (await errorCodeOf(response)) === "fiscal_address_name_taken"
      ? { kind: "name_taken" }
      : { kind: "stale_version" };
  }
  return writeFailureOf(response);
}
