import {
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
};

export type FetchRegisterPointsOfSaleOutcome = CloudReadOutcome<RegisterPointOfSale[]>;

export type ConfigureRegisterPointOfSaleOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "point_of_sale_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | WriteFailure;

function registerPointOfSaleFromWire(row: RegisterPointOfSaleOverviewBody): RegisterPointOfSale {
  return {
    registerId: row.register_id,
    registerName: row.register_name,
    pointOfSaleNumber: row.point_of_sale_number,
    fiscalAddressId: row.fiscal_address_id,
    version: row.version,
  };
}

export function fetchRegisterPointsOfSale(): Promise<FetchRegisterPointsOfSaleOutcome> {
  return readCloudList("/api/registers/points-of-sale", (body) =>
    registerPointOfSaleOverviewListSchema.safeParse(body).data?.map(registerPointOfSaleFromWire),
  );
}

export async function configureRegisterPointOfSale(
  registerId: string,
  body: PointOfSaleConfigurationBody,
): Promise<ConfigureRegisterPointOfSaleOutcome> {
  const response = await sendJson("PUT", `/api/registers/${registerId}/point-of-sale`, body);
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
    return (await errorCodeOf(response)) === "point_of_sale_taken"
      ? { kind: "point_of_sale_taken" }
      : { kind: "stale_version" };
  }
  return writeFailureOf(response);
}
