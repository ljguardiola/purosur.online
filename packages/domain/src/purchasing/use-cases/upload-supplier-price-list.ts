import { argentinaCalendarDay } from "../../shared/index.js";
import {
  dailyExtractionCapReached,
  isSupplierPriceListPdfTooLarge,
} from "../model/supplier-price-list.js";
import type { SupplierPriceListFiles } from "./supplier-price-list-files.js";
import type { SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface UploadSupplierPriceListPorts {
  store: SupplierPriceListStore;
  files: SupplierPriceListFiles;
}

export interface UploadSupplierPriceListInput {
  supplierId: string;
  locationId: string;
  fileName: string;
  pdf: Uint8Array;
  actorId: string;
  now: Date;
}

export type UploadSupplierPriceListOutcome =
  | { kind: "file_too_large" }
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | { kind: "daily_cap_reached"; cap: number }
  | { kind: "uploaded"; listId: string };

export async function uploadSupplierPriceList(
  { store, files }: UploadSupplierPriceListPorts,
  input: UploadSupplierPriceListInput,
): Promise<UploadSupplierPriceListOutcome> {
  if (isSupplierPriceListPdfTooLarge(input.pdf.byteLength)) {
    return { kind: "file_too_large" };
  }

  return store.transaction<UploadSupplierPriceListOutcome>(async (tx) => {
    const { cap } = await tx.lockBranchExtractionQuota(input.locationId);

    const supplier = await tx.findSupplier(input.supplierId);
    if (supplier.kind === "not_found") {
      return { kind: "supplier_not_found" };
    }
    if (!supplier.supplier.active) {
      return { kind: "supplier_inactive" };
    }

    const counted = await tx.extractionsCountedOn(
      input.locationId,
      argentinaCalendarDay(input.now),
    );
    if (dailyExtractionCapReached(counted, cap)) {
      return { kind: "daily_cap_reached", cap };
    }

    const { id } = await tx.insertList({
      supplierId: input.supplierId,
      locationId: input.locationId,
      sourceKind: "PDF",
      fileName: input.fileName,
      byteSize: input.pdf.byteLength,
      uploadedAt: input.now,
      actorId: input.actorId,
    });
    await files.store(id, input.pdf);
    await tx.enqueueReading(id);

    return { kind: "uploaded", listId: id };
  });
}
