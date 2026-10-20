import { normalizeQrExternalPosId } from "../model/qr-external-pos-id.js";
import {
  QrPointOfSaleAlreadyAssigned,
  type QrPointOfSaleAssignment,
  type QrPointOfSaleAssignmentStore,
} from "./qr-point-of-sale-assignment-store.js";

export interface AssignQrPointOfSaleInput {
  locationId: string;
  registerId: string;
  externalPosId: string | null;
  version: number;
  actorId: string;
}

export type AssignQrPointOfSaleOutcome =
  | { kind: "invalid_external_pos_id" }
  | { kind: "register_not_found" }
  | { kind: "stale_version" }
  | { kind: "qr_point_of_sale_taken" }
  | { kind: "unchanged"; assignment: QrPointOfSaleAssignment }
  | { kind: "assigned"; assignment: QrPointOfSaleAssignment };

export async function assignQrPointOfSale(
  store: QrPointOfSaleAssignmentStore,
  input: AssignQrPointOfSaleInput,
): Promise<AssignQrPointOfSaleOutcome> {
  const externalPosId =
    input.externalPosId === null ? null : normalizeQrExternalPosId(input.externalPosId);
  if (input.externalPosId !== null && externalPosId === null) {
    return { kind: "invalid_external_pos_id" };
  }

  try {
    return await store.transaction<AssignQrPointOfSaleOutcome>(async (tx) => {
      const register = await tx.lockBranchRegister(input.locationId, input.registerId);
      if (register.kind === "not_found") {
        return { kind: "register_not_found" };
      }

      const current = await tx.lockRegisterQrPointOfSale(input.registerId);
      if (current.version !== input.version) {
        return { kind: "stale_version" };
      }
      if (current.externalPosId === externalPosId) {
        return { kind: "unchanged", assignment: current };
      }

      if (externalPosId !== null) {
        const holder = await tx.lockQrPointOfSaleHolder(externalPosId);
        if (holder !== undefined) {
          return { kind: "qr_point_of_sale_taken" };
        }
      }

      const assignment = { externalPosId, version: current.version + 1 };
      await tx.recordQrPointOfSaleAssignment({
        registerId: input.registerId,
        ...assignment,
        actorId: input.actorId,
      });
      return { kind: "assigned", assignment };
    });
  } catch (error) {
    if (!(error instanceof QrPointOfSaleAlreadyAssigned)) {
      throw error;
    }
    return { kind: "qr_point_of_sale_taken" };
  }
}
