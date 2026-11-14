import type { DiscountBenefit } from "../../pricing/index.js";
import {
  type Clock,
  type Scale,
  scaleWeighingStep,
  type WeighingReading,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { chargeLine, shownPromotionId } from "../model/line-pricing.js";
import { mayBeSaleLineQuantity, soldQuantity } from "../model/sale-line.js";
import type { RegisterRestoration } from "./register-restoration.js";
import { validPromotions } from "./sale-addition.js";
import type { SaleLedger, SaleLedgerTransaction, SellableProduct } from "./sale-ledger.js";
import { isRefusal, type SellingSessionRefusal, sellingSession } from "./selling-session.js";

export type ProductToConsult = { productId: string } | { barcode: string };

export interface ConsultProductInput {
  actorId: string;
  product: ProductToConsult;
}

export interface ConsultProductPorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  zoneRules: ZoneRulesSource;
  scale: Scale;
}

export interface ConsultedPromotion {
  benefit: DiscountBenefit;
  weekdays: readonly number[];
}

export interface ConsultedProduct {
  kind: "consulted";
  product: SellableProduct;
  unitPrice: number | null;
  promotion: ConsultedPromotion | null;
  weightThousandths: number | null;
  amount: number | null;
  stockThousandths: number | null;
}

export type ConsultProductOutcome =
  | SellingSessionRefusal
  | { kind: "not_found" }
  | ConsultedProduct;

export async function consultProduct(
  { ledger, restoration, clock, zoneRules, scale }: ConsultProductPorts,
  { actorId, product: wanted }: ConsultProductInput,
): Promise<ConsultProductOutcome> {
  const reading = await scale.read();
  return ledger.transaction<ConsultProductOutcome>((tx) => {
    const session = sellingSession(tx, actorId, restoration);
    if (isRefusal(session)) {
      return session;
    }
    const product = productToConsult(tx, wanted);
    if (!product) {
      return { kind: "not_found" };
    }
    const weightThousandths = product.saleUnit === "KG" ? steadyWeight(reading) : null;
    const stockThousandths = tx.stockBalance(product.id) ?? null;
    const price = tx.currentPrice(product.id);
    if (!price) {
      return {
        kind: "consulted",
        product,
        unitPrice: null,
        promotion: null,
        weightThousandths,
        amount: null,
        stockThousandths,
      };
    }
    const promotions = validPromotions(tx, product.id, clock.now(), zoneRules.zoneRules());
    const charge = chargeLine(
      soldQuantity({
        saleUnit: product.saleUnit,
        quantity: product.saleUnit === "KG" ? (weightThousandths ?? ONE_KILOGRAM) : ONE_UNIT,
      }),
      price.unitPrice,
      promotions,
    );
    const shownId = shownPromotionId(charge, promotions);
    const shown = tx.promotionsTargeting(product.id).find((promotion) => promotion.id === shownId);
    return {
      kind: "consulted",
      product,
      unitPrice: price.unitPrice,
      promotion: shown ? { benefit: shown.benefit, weekdays: shown.weekdays } : null,
      weightThousandths,
      amount: product.saleUnit === "KG" && weightThousandths === null ? null : charge.lineTotal,
      stockThousandths,
    };
  });
}

const ONE_KILOGRAM = 1000;
const ONE_UNIT = 1;

function productToConsult(
  tx: SaleLedgerTransaction,
  wanted: ProductToConsult,
): SellableProduct | undefined {
  return "barcode" in wanted
    ? tx.activeProductByBarcode(wanted.barcode)
    : tx.activeProductById(wanted.productId);
}

function steadyWeight(reading: WeighingReading): number | null {
  const step = scaleWeighingStep(reading, null, (weightThousandths) =>
    mayBeSaleLineQuantity(weightThousandths, "KG"),
  );
  return step.kind === "stable" && step.weightThousandths > 0 ? step.weightThousandths : null;
}
