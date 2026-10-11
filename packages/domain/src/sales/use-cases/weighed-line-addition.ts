import type { Clock } from "../../shared/index.js";
import { newWeighedSaleLine } from "../model/sale-line.js";
import type { WeightSource } from "../model/weight-source.js";
import {
  type AddedLineOutcome,
  addLineToSale,
  type SaleAddition,
  validPromotions,
} from "./sale-addition.js";
import type { IdGenerator, SaleLedgerTransaction } from "./sale-ledger.js";

export type WeighedProductRefusal =
  | { kind: "product_unavailable" }
  | { kind: "not_sold_by_weight" };

type Product = NonNullable<ReturnType<SaleLedgerTransaction["activeProductById"]>>;

export function weighedProductToAdd(
  tx: SaleLedgerTransaction,
  productId: string,
): Product | WeighedProductRefusal {
  const product = tx.activeProductById(productId);
  if (!product) {
    return { kind: "product_unavailable" };
  }
  if (product.saleUnit !== "KG") {
    return { kind: "not_sold_by_weight" };
  }
  return product;
}

export function isWeighedProductRefusal(
  result: Product | WeighedProductRefusal,
): result is WeighedProductRefusal {
  return "kind" in result;
}

type Price = NonNullable<ReturnType<SaleLedgerTransaction["priceAt"]>>;

export interface PricedProduct {
  product: Product;
  price: Price;
  moment: Date;
}

export function pricedWeighedProduct(
  tx: SaleLedgerTransaction,
  clock: Clock,
  product: Product,
): PricedProduct | { kind: "no_price"; productName: string } {
  const moment = clock.now();
  const price = tx.priceAt(product.id, moment);
  if (!price) {
    return { kind: "no_price", productName: product.name };
  }
  return { product, price, moment };
}

export function isNoPrice(
  result: PricedProduct | { kind: "no_price"; productName: string },
): result is { kind: "no_price"; productName: string } {
  return "kind" in result;
}

export function addWeighedLine(
  tx: SaleLedgerTransaction,
  addition: SaleAddition,
  ids: IdGenerator,
  { product, price, moment }: PricedProduct,
  weightThousandths: number,
  weightSource: WeightSource,
): AddedLineOutcome {
  return addLineToSale(tx, addition, ids, moment, (lineId) =>
    newWeighedSaleLine(
      lineId,
      product,
      price,
      validPromotions(tx, product.id, moment),
      weightThousandths,
      weightSource,
    ),
  );
}
