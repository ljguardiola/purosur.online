import {
  type OfflinePointOfSaleConfigurationBody,
  type PointOfSaleConfigurationBody,
  type RegisterPointOfSaleOverviewBody,
  registerPointOfSaleOverviewListSchema,
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

export type RegisterPointOfSale = {
  registerId: string;
  registerName: string;
  pointOfSaleNumber: number | null;
  fiscalAddressId: string | null;
  version: number;
  offlinePointOfSaleNumber: number | null;
  offlineVersion: number;
};

export type FetchRegisterPointsOfSaleOutcome = CloudReadOutcome<RegisterPointOfSale[]>;

export type ConfigureRegisterPointOfSaleOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "point_of_sale_taken" }
  | { kind: "stale_version" }
  | { kind: "real_time_point_of_sale_missing" }
  | { kind: "not_found" }
  | WriteFailure;

function registerPointOfSaleFromWire(row: RegisterPointOfSaleOverviewBody): RegisterPointOfSale {
  return {
    registerId: row.register_id,
    registerName: row.register_name,
    pointOfSaleNumber: row.point_of_sale_number,
    fiscalAddressId: row.fiscal_address_id,
    version: row.version,
    offlinePointOfSaleNumber: row.offline_point_of_sale_number,
    offlineVersion: row.offline_version,
  };
}

export function fetchRegisterPointsOfSale(): Promise<FetchRegisterPointsOfSaleOutcome> {
  return readCloudList("/api/registers/points-of-sale", (body) =>
    registerPointOfSaleOverviewListSchema.safeParse(body).data?.map(registerPointOfSaleFromWire),
  );
}

async function putPointOfSale(
  path: string,
  body: unknown,
): Promise<ConfigureRegisterPointOfSaleOutcome> {
  const response = await sendJson("PUT", path, body);
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
    return code === "point_of_sale_taken" || code === "real_time_point_of_sale_missing"
      ? { kind: code }
      : { kind: "stale_version" };
  }
  return writeFailureOf(response);
}

export function configureRegisterPointOfSale(
  registerId: string,
  body: PointOfSaleConfigurationBody,
): Promise<ConfigureRegisterPointOfSaleOutcome> {
  return putPointOfSale(`/api/registers/${registerId}/point-of-sale`, body);
}

export function configureRegisterOfflinePointOfSale(
  registerId: string,
  body: OfflinePointOfSaleConfigurationBody,
): Promise<ConfigureRegisterPointOfSaleOutcome> {
  return putPointOfSale(`/api/registers/${registerId}/offline-point-of-sale`, body);
}
