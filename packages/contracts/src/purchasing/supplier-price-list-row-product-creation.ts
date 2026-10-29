import {
  isPackagingNameTooLong,
  newProductBarcodeListProblem,
  PACKAGING_NAME_MAX_LENGTH,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";
import {
  barcodeListSchema,
  checkNetContentQuantity,
  loadedVersionSchema,
  NET_CONTENT_QUANTITY_CHECK_OPTIONS,
  optionalBrandIdSchema,
  optionalTagIdsSchema,
  productNameSchema,
  productNetContentSchema,
  recordIdSchema,
  requiredTextSchema,
} from "../shared/index.js";
import { packagingQuantitySchema } from "./packaging-creation.js";
import { supplierItemVatRateSchema } from "./supplier-price-list-row-link.js";

export const supplierPriceListRowProductCreationBodySchema = z
  .object({
    version: loadedVersionSchema,
    name: productNameSchema,
    categoryId: recordIdSchema("categoryId must be an existing category's id"),
    brandId: optionalBrandIdSchema,
    saleUnit: z.enum(SALE_UNITS, { error: "saleUnit must be UNIT or KG" }),
    barcodes: barcodeListSchema(newProductBarcodeListProblem),
    tagIds: optionalTagIdsSchema,
    netContent: productNetContentSchema,
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
  })
  .superRefine(checkNetContentQuantity, NET_CONTENT_QUANTITY_CHECK_OPTIONS);

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
