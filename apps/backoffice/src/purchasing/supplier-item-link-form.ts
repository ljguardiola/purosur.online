import type {
  SupplierItemLinkChoices,
  SupplierItemLinkProposal,
  SupplierPriceListRowLinkBody,
} from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { formatPercent, sortedItems, textOrder } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import {
  type SupplierItemQuantityUnit,
  supplierItemQuantityInputOf,
  supplierItemQuantityMessage,
  supplierItemQuantityOf,
} from "./supplier-item-quantity";
import type { SupplierPriceListRow } from "./supplier-price-lists-api";

export type SupplierItemLinkFormValues = {
  productId: string | null;
  saleUnit: SaleUnit;
  quantity: string;
  quantityUnit: SupplierItemQuantityUnit;
  vatRate: string;
  version: number;
};

export const EMPTY_SUPPLIER_ITEM_LINK_FORM: SupplierItemLinkFormValues = {
  productId: null,
  saleUnit: "UNIT",
  quantity: "",
  quantityUnit: "KG",
  vatRate: "",
  version: 1,
};

export const SUPPLIER_ITEM_LINK_FIELDS = {
  productId: "productId",
  saleUnit: null,
  quantity: "quantity",
  quantityUnit: null,
  vatRate: "vatRate",
  version: null,
} as const;

export const SUPPLIER_ITEM_LINK_FIELD_MESSAGES = {
  productId: "Elegí el producto del catálogo.",
  quantity: supplierItemQuantityMessage,
  vatRate: "Elegí el IVA del ítem.",
};

type VatRates = { offered: readonly number[]; default: number };

export function vatRateOptionsOf(vatRates: VatRates): Options<{ value: string; label: string }> {
  const [first, ...rest] = vatRates.offered.map((rate) => ({
    value: String(rate),
    label: formatPercent(rate / 100),
  }));
  return first && [first, ...rest];
}

export function vatRateOrDefault(chosen: string, vatRates: VatRates): string {
  return chosen === "" ? String(vatRates.default) : chosen;
}

export function supplierItemLinkFormValuesOf(
  link: SupplierPriceListRow["link"],
  version: number,
): SupplierItemLinkFormValues {
  return {
    ...EMPTY_SUPPLIER_ITEM_LINK_FORM,
    productId: link?.product.id ?? null,
    saleUnit: link?.product.saleUnit ?? EMPTY_SUPPLIER_ITEM_LINK_FORM.saleUnit,
    ...(link?.current ? supplierItemQuantityInputOf(link.quantity, link.product.saleUnit) : {}),
    vatRate: link?.vatRate == null ? "" : String(link.vatRate),
    version,
  };
}

export function supplierItemLinkRequestFrom(
  values: SupplierItemLinkFormValues,
  requiresVatRate: boolean,
): SupplierPriceListRowLinkBody {
  return {
    version: values.version,
    productId: values.productId ?? "",
    saleUnit: values.saleUnit,
    quantity: supplierItemQuantityOf(values),
    vatRate: requiresVatRate ? Number(values.vatRate) : null,
  };
}

type LinkProduct = SupplierItemLinkChoices["products"][number];

const byName = textOrder((product: LinkProduct) => product.name);
const byDescription = textOrder(formatProductDescription);

const productOrder = (a: LinkProduct, b: LinkProduct) => byName(a, b) || byDescription(a, b);

type Options<Option> = [Option, ...Option[]] | undefined;

export function linkProductOptions(
  choices: SupplierItemLinkChoices,
): Options<{ value: string; label: string }> {
  const [first, ...rest] = sortedItems(choices.products, {
    order: productOrder,
    direction: "ascending",
  }).map((product) => ({ value: product.id, label: formatProductDescription(product) }));
  return first && [first, ...rest];
}

export function proposedProductIdOf(proposal: SupplierItemLinkProposal | undefined): string | null {
  return proposal?.kind === "proposed" ? proposal.product.id : null;
}
