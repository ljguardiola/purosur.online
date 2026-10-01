import { isSameFiscalAddressName } from "../model/fiscal-address.js";
import type { FiscalAddress, FiscalAddressPorts } from "./fiscal-address-store.js";
import { FiscalAddressNameConflict } from "./fiscal-address-store.js";

export interface CreateFiscalAddressInput {
  name: string;
  streetAddress: string;
  actorId: string;
}

export type CreateFiscalAddressOutcome =
  | { kind: "name_taken" }
  | { kind: "created"; fiscalAddress: FiscalAddress };

export async function createFiscalAddress(
  { store }: FiscalAddressPorts,
  { actorId, ...input }: CreateFiscalAddressInput,
): Promise<CreateFiscalAddressOutcome> {
  try {
    return await store.transaction<CreateFiscalAddressOutcome>(async (tx) => {
      const existing = await tx.listFiscalAddresses();
      if (existing.some(({ name }) => isSameFiscalAddressName(name, input.name))) {
        return { kind: "name_taken" };
      }

      const { id } = await tx.insertFiscalAddress({ ...input, actorId });
      return { kind: "created", fiscalAddress: { id, ...input, version: 1 } };
    });
  } catch (error) {
    if (!(error instanceof FiscalAddressNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
