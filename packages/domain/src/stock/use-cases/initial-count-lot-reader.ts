import type { SaleUnit } from "../../catalog/index.js";
import type { LotCost } from "../model/lot-value.js";

export interface InitialCountLotRow {
  lotId: string;
  productId: string;
  productName: string;
  categoryName: string;
  saleUnit: SaleUnit;
  expiresOn: string | null;
  counted: number;
  costIncomplete: boolean;
  cost: LotCost | null;
}

export interface InitialCountLotsQuery {
  locationId: string;
  costIncomplete: boolean | undefined;
  productName: string | undefined;
}

export interface InitialCountLotReader {
  notWithdrawnInitialCountLots(query: InitialCountLotsQuery): Promise<InitialCountLotRow[]>;
}
