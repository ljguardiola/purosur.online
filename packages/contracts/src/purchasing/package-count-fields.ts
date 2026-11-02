import {
  isPackageCount,
  mayBeMovementQuantity,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { z } from "zod";

const PACKAGES_MESSAGE = "packages must be a positive whole number";
const QUANTITY_PER_PACKAGE_MESSAGE =
  "quantityPerPackage must be a positive integer number of thousandths";

export const packageCountFields = {
  packages: z.number({ error: PACKAGES_MESSAGE }).refine(isPackageCount, PACKAGES_MESSAGE),
  quantityPerPackage: z
    .number({ error: QUANTITY_PER_PACKAGE_MESSAGE })
    .refine(mayBeMovementQuantity, QUANTITY_PER_PACKAGE_MESSAGE)
    .meta({ decimals: STOCK_QUANTITY_DECIMALS, perUnit: STOCK_QUANTITY_PER_UNIT }),
};
