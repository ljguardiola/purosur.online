import type { SoldLinesOfGroup } from "../../sales/index.js";
import type { ReportPeriod } from "../../shared/index.js";
import type { PurchaseOrderState } from "../model/purchase-order.js";
import type { SupplierPriceComparisonReader } from "./supplier-price-comparison-reader.js";

export interface ProductCoverageDays {
  productId: string;
  coverageDays: number;
}

export interface ProductStock {
  productId: string;
  // In thousandths of the product's sale unit.
  quantity: number;
}

export interface AwaitedOrderLine {
  productId: string;
  state: PurchaseOrderState;
  packages: number;
  // In thousandths of the product's sale unit.
  quantityPerPackage: number;
  receivedQuantity: number;
}

export interface NewestShelfLifeLot {
  productId: string;
  createdAt: Date;
  expiresOn: string;
}

export interface OrderSuggestionSalesQuery {
  locationId: string;
  range: ReportPeriod;
}

export interface OrderSuggestionSupplier {
  id: string;
  name: string;
  active: boolean;
}

export interface OrderSuggestionReader extends SupplierPriceComparisonReader {
  // Every read `read` makes sees the data as it stood at one moment, so a change committing
  // meanwhile is counted by all of them or by none.
  inOneSnapshot<T>(read: (reader: OrderSuggestionReader) => Promise<T>): Promise<T>;
  coverageDays(): Promise<ProductCoverageDays[]>;
  // The branch's lines of orders that may still be received, with what earlier receipts brought, in
  // thousandths of the product's sale unit.
  awaitedOrderLines(locationId: string): Promise<AwaitedOrderLine[]>;
  completedSalesByProduct(query: OrderSuggestionSalesQuery): Promise<SoldLinesOfGroup[]>;
  // The branch's current stock of each product that has a balance there.
  currentStock(locationId: string): Promise<ProductStock[]>;
  // Per product, its most recent lot in the branch that counts for the shelf life.
  newestShelfLifeLots(locationId: string): Promise<NewestShelfLifeLot[]>;
  suppliers(): Promise<OrderSuggestionSupplier[]>;
}
