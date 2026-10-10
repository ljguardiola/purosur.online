import { mayRegisterClaimPointOfSale } from "../model/point-of-sale.js";
import type {
  RegisterOfflinePointOfSale,
  RegisterOfflinePointOfSaleStore,
} from "./register-offline-point-of-sale-store.js";
import { PointOfSaleClaimConflict } from "./register-point-of-sale-store.js";

export interface ConfigureRegisterOfflinePointOfSaleInput {
  locationId: string;
  registerId: string;
  pointOfSaleNumber: number;
  version: number;
  actorId: string;
}

export type ConfigureRegisterOfflinePointOfSaleOutcome =
  | { kind: "register_not_found" }
  | { kind: "real_time_point_of_sale_missing" }
  | { kind: "stale_version" }
  | { kind: "point_of_sale_taken" }
  | { kind: "unchanged"; setup: RegisterOfflinePointOfSale }
  | { kind: "configured"; setup: RegisterOfflinePointOfSale };

export async function configureRegisterOfflinePointOfSale(
  store: RegisterOfflinePointOfSaleStore,
  input: ConfigureRegisterOfflinePointOfSaleInput,
): Promise<ConfigureRegisterOfflinePointOfSaleOutcome> {
  try {
    return await store.transaction<ConfigureRegisterOfflinePointOfSaleOutcome>(async (tx) => {
      const register = await tx.lockBranchRegister(input.locationId, input.registerId);
      if (register.kind === "not_found") {
        return { kind: "register_not_found" };
      }

      const realTime = await tx.lockRegisterPointOfSale(input.registerId);
      if (realTime.pointOfSaleNumber === null) {
        return { kind: "real_time_point_of_sale_missing" };
      }

      const current = await tx.lockRegisterOfflinePointOfSale(input.registerId);
      if (current.version !== input.version) {
        return { kind: "stale_version" };
      }
      if (current.pointOfSaleNumber === input.pointOfSaleNumber) {
        return { kind: "unchanged", setup: current };
      }

      const holder = await tx.lockPointOfSaleClaim(input.pointOfSaleNumber);
      if (!mayRegisterClaimPointOfSale(holder, input.registerId, "offline")) {
        return { kind: "point_of_sale_taken" };
      }
      if (holder === undefined) {
        await tx.claimPointOfSale({
          pointOfSaleNumber: input.pointOfSaleNumber,
          registerId: input.registerId,
          mechanism: "offline",
          actorId: input.actorId,
        });
      }

      const setup = { pointOfSaleNumber: input.pointOfSaleNumber, version: current.version + 1 };
      await tx.recordRegisterOfflinePointOfSale({
        registerId: input.registerId,
        ...setup,
        actorId: input.actorId,
      });
      return { kind: "configured", setup };
    });
  } catch (error) {
    if (!(error instanceof PointOfSaleClaimConflict)) {
      throw error;
    }
    return { kind: "point_of_sale_taken" };
  }
}
