import { isSameFiscalAddressName } from "../model/fiscal-address.js";
import type { FiscalAddress, FiscalAddressPorts } from "./fiscal-address-store.js";
import { FiscalAddressNameConflict } from "./fiscal-address-store.js";

export interface EditFiscalAddressInput {
  fiscalAddressId: string;
  name: string;
  streetAddress: string;
  version: number;
  actorId: string;
}

export type EditFiscalAddressOutcome =
  | { kind: "not_found" }
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "unchanged"; fiscalAddress: FiscalAddress }
  | { kind: "edited"; fiscalAddress: FiscalAddress };

export async function editFiscalAddress(
  { store }: FiscalAddressPorts,
  { fiscalAddressId, name, streetAddress, version, actorId }: EditFiscalAddressInput,
): Promise<EditFiscalAddressOutcome> {
  try {
    return await store.transaction<EditFiscalAddressOutcome>(async (tx) => {
      const current = await tx.lockFiscalAddress(fiscalAddressId);
      if (current === undefined) {
        return { kind: "not_found" };
      }
      if (current.version !== version) {
        return { kind: "stale_version" };
      }
      if (current.name === name && current.streetAddress === streetAddress) {
        return { kind: "unchanged", fiscalAddress: current };
      }

      const others = (await tx.listFiscalAddresses()).filter(({ id }) => id !== fiscalAddressId);
      if (others.some((other) => isSameFiscalAddressName(other.name, name))) {
        return { kind: "name_taken" };
      }

      const fiscalAddress = { id: fiscalAddressId, name, streetAddress, version: version + 1 };
      await tx.updateFiscalAddress({ ...fiscalAddress, actorId });
      return { kind: "edited", fiscalAddress };
    });
  } catch (error) {
    if (!(error instanceof FiscalAddressNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
