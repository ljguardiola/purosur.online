import type { NetContentUnit, SaleUnit } from "@purosur/domain";
import type { BranchSettingsRow } from "../branch/branch-settings-read-route.js";

export interface CategoryRow {
  name: string;
  parentId: string | null;
  version: number;
}

export interface ProductRow {
  name: string;
  categoryId: string;
  brandId: string | null;
  saleUnit: SaleUnit;
  active: boolean;
  netContent: { quantity: number; unit: NetContentUnit } | null;
  barcodes: { position: number; code: string }[];
  tagIds: string[];
  version: number;
}

export interface PriceListRow {
  name: string;
  version: number;
}

export interface PriceRow {
  productId: string;
  priceListId: string;
  unitPrice: number;
  validFrom: Date;
  version: number;
}

export interface TagRow {
  name: string;
  active: boolean;
  version: number;
}

export interface UserRow {
  firstName: string;
  roleId: string;
  salt: string | null;
  pinHash: string | null;
  active: boolean;
  version: number;
}

export interface RoleRow {
  name: string | null;
  isAdministrator: boolean;
  permissionKeys: string[];
  version: number;
}

export interface RegisterRow {
  name: string;
  version: number;
}

export type RemovedEntity = "category" | "product" | "tag" | "price" | "user" | "role" | "register";

export type PulledCloudChange = { changeSeq: number; entityId: string } & (
  | { entity: "branch_settings"; row: BranchSettingsRow }
  | { entity: "category"; row: CategoryRow }
  | { entity: "product"; row: ProductRow }
  | { entity: "tag"; row: TagRow }
  | { entity: "price_list"; row: PriceListRow }
  | { entity: "price"; row: PriceRow }
  | { entity: "user"; row: UserRow }
  | { entity: "role"; row: RoleRow }
  | { entity: "register"; row: RegisterRow }
  | { entity: "removal"; removedEntity: RemovedEntity; version: number }
);
