import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import type { NewPackagingFields } from "./purchasing-store.js";
import type {
  SupplierItemLink,
  SupplierPriceListStoreTransaction,
} from "./supplier-price-list-store.js";

export interface CreateCatalogProductInput {
  name: string;
  categoryId: string;
  brandId: string | null;
  saleUnit: SaleUnit;
  barcodes: string[];
  tagIds: string[];
  netContent: { quantity: number; unit: NetContentUnit } | null;
}

export type CreateCatalogProductOutcome =
  | { kind: "category_not_found" }
  | { kind: "category_not_leaf" }
  | { kind: "brand_not_found" }
  | { kind: "brand_inactive" }
  | { kind: "tag_not_found" }
  | { kind: "tag_inactive"; tagId: string }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "created"; productId: string };

export type LockSupplierItemRowResult =
  | { kind: "not_found" }
  | {
      kind: "locked";
      row: {
        description: string;
        code: string | null;
        presentation: string | null;
        link: SupplierItemLink | null;
      };
    };

export interface SupplierItemProductStoreTransaction
  extends Pick<
    SupplierPriceListStoreTransaction,
    "lockList" | "linkRow" | "lockSupplierItems" | "rememberSupplierItemLink"
  > {
  lockRow(listId: string, rowId: string): Promise<LockSupplierItemRowResult>;
  createCatalogProduct(input: CreateCatalogProductInput): Promise<CreateCatalogProductOutcome>;
  insertPackaging(fields: NewPackagingFields): Promise<{ id: string }>;
}

export interface SupplierItemProductStore {
  transaction<TOutcome>(
    work: (tx: SupplierItemProductStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
