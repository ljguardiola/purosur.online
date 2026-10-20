import {
  isSupplierPriceListFileNameTooLong,
  SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema, requiredTextSchema } from "../shared/index.js";

export const supplierPriceListUploadQuerySchema = z.object({
  supplierId: recordIdSchema("supplierId must be a supplier's id"),
  fileName: requiredTextSchema(
    "fileName",
    SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH,
    isSupplierPriceListFileNameTooLong,
  ),
});

export type SupplierPriceListUploadQuery = z.input<typeof supplierPriceListUploadQuerySchema>;
