import {
  type BranchOfflinePointOfSaleBody,
  branchOfflinePointOfSaleListSchema,
  offlinePointOfSaleRetirementSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import {
  errorCodeOf,
  readCloudList,
  sendJson,
  type WriteFailure,
  writeFailureOf,
} from "./fiscal-api-request";

export type OfflinePointOfSale = {
  pointOfSaleNumber: number;
  registerId: string;
  registerName: string;
  assigned: boolean;
  retiredAt: string | null;
};

export type FetchOfflinePointsOfSaleOutcome = CloudReadOutcome<OfflinePointOfSale[]>;

export type RetireOfflinePointOfSaleOutcome =
  | { kind: "retired"; value: { pointOfSaleNumber: number; retiredAt: string } }
  | { kind: "not_found" }
  | { kind: "assigned" }
  | { kind: "already_retired" }
  | WriteFailure;

function offlinePointOfSaleFromWire(row: BranchOfflinePointOfSaleBody): OfflinePointOfSale {
  return {
    pointOfSaleNumber: row.point_of_sale_number,
    registerId: row.register_id,
    registerName: row.register_name,
    assigned: row.assigned,
    retiredAt: row.retired_at,
  };
}

export function fetchOfflinePointsOfSale(): Promise<FetchOfflinePointsOfSaleOutcome> {
  return readCloudList("/api/registers/offline-points-of-sale", (body) =>
    branchOfflinePointOfSaleListSchema.safeParse(body).data?.map(offlinePointOfSaleFromWire),
  );
}

export async function retireOfflinePointOfSale(
  pointOfSaleNumber: number,
): Promise<RetireOfflinePointOfSaleOutcome> {
  const response = await sendJson(
    "POST",
    `/api/registers/offline-points-of-sale/${pointOfSaleNumber}/retirement`,
    {},
  );
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = offlinePointOfSaleRetirementSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success
      ? {
          kind: "retired",
          value: {
            pointOfSaleNumber: parsed.data.point_of_sale_number,
            retiredAt: parsed.data.retired_at,
          },
        }
      : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await errorCodeOf(response);
    return code === "assigned" || code === "already_retired" ? { kind: code } : { kind: "failed" };
  }
  return writeFailureOf(response);
}
