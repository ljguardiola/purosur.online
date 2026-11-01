import { salesOfGroups } from "../../sales/index.js";
import {
  argentinaCalendarDay,
  type Clock,
  type Fraction,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  orderSuggestionPeriod,
  packagesToCover,
  quantityToOrderWithoutSupplier,
  shortfallToCover,
  soldThousandths,
} from "../model/order-suggestion.js";
import { mayBePurchasedFrom } from "../model/purchase.js";
import {
  type ComparedOffer,
  type ComparedProduct,
  listSupplierPriceComparison,
  type UnpricedOffer,
} from "./list-supplier-price-comparison.js";
import type { OrderSuggestionReader } from "./order-suggestion-reader.js";

export interface SuggestedOffer extends Omit<ComparedOffer, "quantity"> {
  // In thousandths of `saleUnit`.
  packageQuantity: number;
  packages: number;
  // What the packages hold, in thousandths of `saleUnit`.
  quantity: number;
}

export interface SuggestedUnpricedOffer extends Omit<UnpricedOffer, "quantity"> {
  // In thousandths of `saleUnit`.
  packageQuantity: number;
  // Null when the offer's link no longer states a package of the product.
  order: { packages: number; quantity: number } | null;
}

export interface OrderSuggestionLine extends Omit<ComparedProduct, "offers" | "unpricedOffers"> {
  coverageDays: number;
  // In thousandths of `saleUnit`.
  soldQuantity: number;
  stock: number;
  // What is needed rounded up to whole units, or to the thousandth when sold by weight.
  neededQuantity: number;
  // Cheapest first.
  offers: SuggestedOffer[];
  unpricedOffers: SuggestedUnpricedOffer[];
}

export interface OrderSuggestion {
  lines: OrderSuggestionLine[];
  // Those a line without a priced offer may be ordered from.
  suppliers: { id: string; name: string }[];
}

export interface ListOrderSuggestionInput {
  locationId: string;
}

function orderOf(shortfall: Fraction, packageQuantity: number) {
  const packages = packagesToCover(shortfall, packageQuantity);
  return { packages, quantity: packages * packageQuantity };
}

export async function listOrderSuggestion(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: OrderSuggestionReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId }: ListOrderSuggestionInput,
): Promise<OrderSuggestion> {
  const range = orderSuggestionPeriod(argentinaCalendarDay(clock.now(), zoneRules.zoneRules()));
  const [compared, coverage, sold, stock, suppliers] = await Promise.all([
    listSupplierPriceComparison(reader),
    reader.coverageDays(),
    reader.completedSalesByProduct({ locationId, range }),
    reader.currentStock(locationId),
    reader.suppliers(),
  ]);
  const coverageDaysOf = new Map(coverage.map((entry) => [entry.productId, entry.coverageDays]));
  const soldOf = new Map(salesOfGroups(sold).map((group) => [group.id, group]));
  const stockOf = new Map(stock.map((entry) => [entry.productId, entry.quantity]));
  const lines = compared.flatMap((product) => {
    const coverageDays = coverageDaysOf.get(product.id);
    if (coverageDays === undefined) {
      return [];
    }
    const sales = soldOf.get(product.id);
    const soldQuantity = sales === undefined ? 0 : soldThousandths(sales, product.saleUnit);
    const stockQuantity = stockOf.get(product.id) ?? 0;
    const shortfall = shortfallToCover({
      soldThousandths: soldQuantity,
      coverageDays,
      stockThousandths: stockQuantity,
    });
    if (shortfall === null) {
      return [];
    }
    const { offers, unpricedOffers, ...shown } = product;
    return [
      {
        ...shown,
        coverageDays,
        soldQuantity,
        stock: stockQuantity,
        neededQuantity: quantityToOrderWithoutSupplier(shortfall, product.saleUnit),
        offers: offers.map(({ quantity: packageQuantity, ...offer }) => ({
          ...offer,
          packageQuantity,
          ...orderOf(shortfall, packageQuantity),
        })),
        unpricedOffers: unpricedOffers.map(({ quantity: packageQuantity, ...offer }) => ({
          ...offer,
          packageQuantity,
          order: offer.reason === "link_outdated" ? null : orderOf(shortfall, packageQuantity),
        })),
      },
    ];
  });
  return {
    lines,
    suppliers: suppliers.filter(mayBePurchasedFrom).map(({ id, name }) => ({ id, name })),
  };
}
