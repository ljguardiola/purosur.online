import type { SupplierPriceListFiles } from "./supplier-price-list-files.js";
import type { SupplierPriceListReader } from "./supplier-price-list-reader.js";

export interface FindSupplierPriceListFilePorts {
  reader: SupplierPriceListReader;
  files: SupplierPriceListFiles;
}

export type FoundSupplierPriceListFile =
  | { kind: "not_found" }
  | { kind: "found"; fileName: string; bytes: Uint8Array };

export async function findSupplierPriceListFile(
  { reader, files }: FindSupplierPriceListFilePorts,
  listId: string,
): Promise<FoundSupplierPriceListFile> {
  const fileName = await reader.fileName(listId);
  if (fileName === undefined) {
    return { kind: "not_found" };
  }
  const bytes = await files.read(listId);
  return bytes === null ? { kind: "not_found" } : { kind: "found", fileName, bytes };
}
