import type { SoldLinesOfGroup } from "../../sales/index.js";
import type { ReportPeriod } from "../../shared/index.js";
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

export interface OrderSuggestionSalesQuery {
  locationId: string;
  range: ReportPeriod;
}

// The active products and the supplier offers are those of the price comparison.
export interface OrderSuggestionReader extends SupplierPriceComparisonReader {
  coverageDays(): Promise<ProductCoverageDays[]>;
  completedSalesByProduct(query: OrderSuggestionSalesQuery): Promise<SoldLinesOfGroup[]>;
  // The branch's current stock of each product that has a balance there.
  currentStock(locationId: string): Promise<ProductStock[]>;
}
