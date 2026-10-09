import type { NetContentUnit, SaleUnit, StockMovementKind } from "@purosur/domain";
import type { BranchSettings } from "@purosur/domain/branch/use-cases";
import type { DiscountFields } from "@purosur/domain/pricing/use-cases";

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

export interface RegisterPointOfSaleRow {
  pointOfSaleNumber: number;
  fiscalAddressId: string;
  taxAuthorityLastAuthorizedNumber: number | null;
  version: number;
}

export type DiscountRow = DiscountFields;

export interface StockMovementRow {
  productId: string;
  kind: StockMovementKind;
  delta: number;
  occurredAt: Date;
  supersededByCountId: string | null;
  version: number;
}

export interface IssuerIdentificationVersionRow {
  legalName: string | null;
  grossIncomeRegistration: string | null;
  activityStartDate: string | null;
  authorizedCuit: string;
  version: number;
}

export interface BuyerIdentificationThresholdRow {
  amount: number;
  validFrom: string;
  revision: number;
}

export interface BuyerTaxStatusSetRow {
  paramsVersion: number;
  options: { code: number; description: string; invoiceClass: string }[];
}

export type RemovedEntity =
  | "category"
  | "product"
  | "tag"
  | "price"
  | "user"
  | "role"
  | "register"
  | "discount";

export type PulledCloudChange = { changeSeq: number; entityId: string } & (
  | { entity: "branch_settings"; row: BranchSettings }
  | { entity: "category"; row: CategoryRow }
  | { entity: "product"; row: ProductRow }
  | { entity: "tag"; row: TagRow }
  | { entity: "price_list"; row: PriceListRow }
  | { entity: "price"; row: PriceRow }
  | { entity: "user"; row: UserRow }
  | { entity: "role"; row: RoleRow }
  | { entity: "register"; row: RegisterRow }
  | { entity: "register_point_of_sale"; row: RegisterPointOfSaleRow }
  | { entity: "discount"; row: DiscountRow }
  | { entity: "issuer_identification"; row: IssuerIdentificationVersionRow }
  | { entity: "buyer_identification_threshold"; row: BuyerIdentificationThresholdRow }
  | { entity: "buyer_tax_status_set"; row: BuyerTaxStatusSetRow }
  | { entity: "stock_movement"; row: StockMovementRow }
  | { entity: "removal"; removedEntity: RemovedEntity; version: number }
);
