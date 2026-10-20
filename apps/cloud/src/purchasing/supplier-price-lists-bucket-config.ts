import {
  type BucketConfig,
  type BucketEnv,
  resolveBucketConfig,
} from "../platform/bucket-config.js";

export type SupplierPriceListsBucketConfig = BucketConfig;

export function resolveSupplierPriceListsBucketConfig(
  env: BucketEnv<"SUPPLIER_PRICE_LISTS">,
): SupplierPriceListsBucketConfig | undefined {
  return resolveBucketConfig(env, "SUPPLIER_PRICE_LISTS");
}
