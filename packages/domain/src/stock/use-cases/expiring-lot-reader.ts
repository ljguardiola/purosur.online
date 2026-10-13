import type { SaleUnit } from "../../catalog/index.js";
import type { LotCost } from "../model/lot-value.js";

export interface ExpiringLotProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
}

export interface ExpiringLotRow {
  id: string;
  lotNumber: string | null;
  expiresOn: string | null;
  technical: boolean;
  remaining: number;
  cost: LotCost | null;
  costIncomplete: boolean;
  product: ExpiringLotProduct;
}

export interface ExpiringLotReader {
  lotsExpiringBy(locationId: string, lastDay: string): Promise<ExpiringLotRow[]>;
}

export interface ExpiryWarningWindowReader {
  currentBranchSettings(locationId: string): Promise<{ expiringLotAlertDays: number }>;
}
