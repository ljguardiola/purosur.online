import { salesOfGroups } from "../../sales/index.js";
import {
  argentinaCalendarDay,
  type Clock,
  type Fraction,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { lotShelfLifeDays } from "../../stock/index.js";
import {
  effectiveCoverageDays,
  expiryCapQuantity,
  orderSuggestionPeriod,
  packagesToCover,
  quantityToOrderWithoutSupplier,
  shortfallToCover,
  soldThousandths,
} from "../model/order-suggestion.js";
import { mayBePurchasedFrom } from "../model/purchase.js";
import { awaitedQuantity } from "../model/purchase-order-receipt.js";
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
  // The coverage days, or the shelf life of the newest lot when it is shorter.
  effectiveDays: number;
  cappedByExpiry: boolean;
  // In thousandths of `saleUnit`.
  soldQuantity: number;
  stock: number;
  // What orders sent to a supplier and not yet received still have to bring, in thousandths of `saleUnit`.
  awaitedQuantity: number;
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

function orderOf(shortfall: Fraction, cap: Fraction | null, packageQuantity: number) {
  const packages = packagesToCover(shortfall, packageQuantity, cap);
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
  const [compared, coverage, sold, stock, awaitedLines, newestLots, suppliers] =
    await reader.inOneSnapshot((snapshot) =>
      Promise.all([
        listSupplierPriceComparison(snapshot),
        snapshot.coverageDays(),
        snapshot.completedSalesByProduct({ locationId, range }),
        snapshot.currentStock(locationId),
        snapshot.awaitedOrderLines(locationId),
        snapshot.newestShelfLifeLots(locationId),
        snapshot.suppliers(),
      ]),
    );
  const coverageDaysOf = new Map(coverage.map((entry) => [entry.productId, entry.coverageDays]));
  const soldOf = new Map(salesOfGroups(sold).map((group) => [group.id, group]));
  const stockOf = new Map(stock.map((entry) => [entry.productId, entry.quantity]));
  const awaitedOf = new Map<string, number>();
  for (const line of awaitedLines) {
    awaitedOf.set(
      line.productId,
      (awaitedOf.get(line.productId) ?? 0) +
        awaitedQuantity(line.state, line, line.receivedQuantity),
    );
  }
  const shelfLifeOf = new Map(
    newestLots.map((lot) => [
      lot.productId,
      lotShelfLifeDays(argentinaCalendarDay(lot.createdAt, zoneRules.zoneRules()), lot.expiresOn),
    ]),
  );
  const lines = compared.flatMap((product) => {
    const coverageDays = coverageDaysOf.get(product.id);
    if (coverageDays === undefined) {
      return [];
    }
    const sales = soldOf.get(product.id);
    const soldQuantity = sales === undefined ? 0 : soldThousandths(sales, product.saleUnit);
    const stockQuantity = stockOf.get(product.id) ?? 0;
    const awaited = awaitedOf.get(product.id) ?? 0;
    const shelfLifeDays = shelfLifeOf.get(product.id) ?? null;
    const { days: effectiveDays, cappedByExpiry } = effectiveCoverageDays(
      coverageDays,
      shelfLifeDays,
    );
    const shortfall = shortfallToCover({
      soldThousandths: soldQuantity,
      coverageDays: effectiveDays,
      stockThousandths: stockQuantity,
      awaitedThousandths: awaited,
    });
    if (shortfall === null) {
      return [];
    }
    const cap = expiryCapQuantity({
      soldThousandths: soldQuantity,
      shelfLifeDays,
      stockThousandths: stockQuantity,
      awaitedThousandths: awaited,
    });
    const { offers, unpricedOffers, ...shown } = product;
    return [
      {
        ...shown,
        effectiveDays,
        cappedByExpiry,
        soldQuantity,
        stock: stockQuantity,
        awaitedQuantity: awaited,
        neededQuantity: quantityToOrderWithoutSupplier(shortfall, product.saleUnit, cap),
        offers: offers.map(({ quantity: packageQuantity, ...offer }) => ({
          ...offer,
          packageQuantity,
          ...orderOf(shortfall, cap, packageQuantity),
        })),
        unpricedOffers: unpricedOffers.map(({ quantity: packageQuantity, ...offer }) => ({
          ...offer,
          packageQuantity,
          order: offer.reason === "link_outdated" ? null : orderOf(shortfall, cap, packageQuantity),
        })),
      },
    ];
  });
  return {
    lines,
    suppliers: suppliers.filter(mayBePurchasedFrom).map(({ id, name }) => ({ id, name })),
  };
}
