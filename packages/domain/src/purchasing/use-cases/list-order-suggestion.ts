import { salesOfGroups } from "../../sales/index.js";
import { argentinaCalendarDay, type Clock, type ZoneRulesSource } from "../../shared/index.js";
import {
  orderSuggestionPeriod,
  packagesToCover,
  quantityToOrderWithoutSupplier,
  shortfallToCover,
  soldThousandths,
} from "../model/order-suggestion.js";
import {
  type ComparedOffer,
  type ComparedProduct,
  listSupplierPriceComparison,
} from "./list-supplier-price-comparison.js";
import type { OrderSuggestionReader } from "./order-suggestion-reader.js";

export interface SuggestedOffer extends Omit<ComparedOffer, "quantity"> {
  // In thousandths of `saleUnit`.
  packageQuantity: number;
  packages: number;
  // What the packages hold, in thousandths of `saleUnit`.
  quantity: number;
}

export interface OrderSuggestionLine extends Omit<ComparedProduct, "offers"> {
  coverageDays: number;
  // In thousandths of `saleUnit`.
  soldQuantity: number;
  stock: number;
  // What is needed rounded up to whole units, or to the thousandth when sold by weight.
  neededQuantity: number;
  // Cheapest first.
  offers: SuggestedOffer[];
}

export interface ListOrderSuggestionInput {
  locationId: string;
}

export async function listOrderSuggestion(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: OrderSuggestionReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId }: ListOrderSuggestionInput,
): Promise<OrderSuggestionLine[]> {
  const range = orderSuggestionPeriod(argentinaCalendarDay(clock.now(), zoneRules.zoneRules()));
  const [compared, coverage, sold, stock] = await Promise.all([
    listSupplierPriceComparison(reader),
    reader.coverageDays(),
    reader.completedSalesByProduct({ locationId, range }),
    reader.currentStock(locationId),
  ]);
  const coverageDaysOf = new Map(coverage.map((entry) => [entry.productId, entry.coverageDays]));
  const soldOf = new Map(salesOfGroups(sold).map((group) => [group.id, group]));
  const stockOf = new Map(stock.map((entry) => [entry.productId, entry.quantity]));
  return compared.flatMap((product) => {
    const coverageDays = coverageDaysOf.get(product.id);
    const sales = soldOf.get(product.id);
    if (coverageDays === undefined || sales === undefined) {
      return [];
    }
    const soldQuantity = soldThousandths(sales, product.saleUnit);
    const stockQuantity = stockOf.get(product.id) ?? 0;
    const shortfall = shortfallToCover({
      soldThousandths: soldQuantity,
      coverageDays,
      stockThousandths: stockQuantity,
    });
    if (shortfall === null) {
      return [];
    }
    const { offers, ...shown } = product;
    return [
      {
        ...shown,
        coverageDays,
        soldQuantity,
        stock: stockQuantity,
        neededQuantity: quantityToOrderWithoutSupplier(shortfall, product.saleUnit),
        offers: offers.map(({ quantity: packageQuantity, ...offer }) => {
          const packages = packagesToCover(shortfall, packageQuantity);
          return { ...offer, packageQuantity, packages, quantity: packages * packageQuantity };
        }),
      },
    ];
  });
}
