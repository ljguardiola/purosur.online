import { mayRegisterClaimPointOfSale } from "../model/point-of-sale.js";
import {
  PointOfSaleClaimConflict,
  type RegisterPointOfSale,
  type RegisterPointOfSaleStore,
} from "./register-point-of-sale-store.js";

export interface ConfigureRegisterPointOfSaleInput {
  locationId: string;
  registerId: string;
  pointOfSaleNumber: number;
  fiscalAddressId: string;
  version: number;
  actorId: string;
}

export type ConfigureRegisterPointOfSaleOutcome =
  | { kind: "register_not_found" }
  | { kind: "stale_version" }
  | { kind: "fiscal_address_not_found" }
  | { kind: "point_of_sale_taken" }
  | { kind: "unchanged"; setup: RegisterPointOfSale }
  | { kind: "configured"; setup: RegisterPointOfSale };

export async function configureRegisterPointOfSale(
  store: RegisterPointOfSaleStore,
  input: ConfigureRegisterPointOfSaleInput,
): Promise<ConfigureRegisterPointOfSaleOutcome> {
  try {
    return await store.transaction<ConfigureRegisterPointOfSaleOutcome>(async (tx) => {
      const register = await tx.lockBranchRegister(input.locationId, input.registerId);
      if (register.kind === "not_found") {
        return { kind: "register_not_found" };
      }

      const current = await tx.lockRegisterPointOfSale(input.registerId);
      if (current.version !== input.version) {
        return { kind: "stale_version" };
      }
      if (
        current.pointOfSaleNumber === input.pointOfSaleNumber &&
        current.fiscalAddressId === input.fiscalAddressId
      ) {
        return { kind: "unchanged", setup: current };
      }

      if (!(await tx.fiscalAddressExists(input.fiscalAddressId))) {
        return { kind: "fiscal_address_not_found" };
      }

      const holder = await tx.lockPointOfSaleClaim(input.pointOfSaleNumber);
      if (!mayRegisterClaimPointOfSale(holder, input.registerId)) {
        return { kind: "point_of_sale_taken" };
      }
      if (holder === undefined) {
        await tx.claimPointOfSale({
          pointOfSaleNumber: input.pointOfSaleNumber,
          registerId: input.registerId,
          actorId: input.actorId,
        });
      }

      const setup = {
        pointOfSaleNumber: input.pointOfSaleNumber,
        fiscalAddressId: input.fiscalAddressId,
        version: current.version + 1,
      };
      await tx.recordRegisterPointOfSale({
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
