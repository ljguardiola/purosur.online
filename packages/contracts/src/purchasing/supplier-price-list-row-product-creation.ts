import {
  isPackagingNameTooLong,
  newProductBarcodeListProblem,
  PACKAGING_NAME_MAX_LENGTH,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";
import {
  barcodeListSchema,
  loadedVersionSchema,
  recordIdSchema,
  requiredTextSchema,
} from "../shared/index.js";
import { packagingQuantitySchema } from "./packaging-creation.js";
import { supplierItemVatRateSchema } from "./supplier-price-list-row-link.js";

export const supplierPriceListRowProductCreationBodySchema = z.object({
  version: loadedVersionSchema,
  saleUnit: z.enum(SALE_UNITS, { error: "saleUnit must be UNIT or KG" }),
  categoryId: recordIdSchema("categoryId must be an existing category's id"),
  barcodes: barcodeListSchema(newProductBarcodeListProblem),
  packagingName: requiredTextSchema(
    "packagingName",
    PACKAGING_NAME_MAX_LENGTH,
    isPackagingNameTooLong,
  )
    .nullish()
    .transform((name) => name ?? null)
    .meta({ maxLength: PACKAGING_NAME_MAX_LENGTH }),
  quantityPerPackage: packagingQuantitySchema,
  vatRate: supplierItemVatRateSchema,
});

export type SupplierPriceListRowProductCreationBody = z.input<
  typeof supplierPriceListRowProductCreationBodySchema
>;

export const supplierPriceListRowProductCreatedSchema = z.object({
  productId: z.string(),
  packagingId: z.string(),
});

export type SupplierPriceListRowProductCreated = z.output<
  typeof supplierPriceListRowProductCreatedSchema
>;
