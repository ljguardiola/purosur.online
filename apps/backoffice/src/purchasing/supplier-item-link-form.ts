import type {
  SupplierItemLinkChoices,
  SupplierItemLinkProposal,
  SupplierPriceListRowLinkBody,
} from "@purosur/contracts";
import { formatPercent, formatProductDescription, sortedItems, textOrder } from "@purosur/ui";
import { formatStockQuantity } from "../platform/stock-quantity";
import type { SupplierPriceListRow } from "./supplier-price-lists-api";

export type SupplierItemLinkFormValues = {
  productId: string | null;
  packagingId: string | null;
  vatRate: string;
  version: number;
};

export const EMPTY_SUPPLIER_ITEM_LINK_FORM: SupplierItemLinkFormValues = {
  productId: null,
  packagingId: null,
  vatRate: "",
  version: 1,
};

export const SUPPLIER_ITEM_LINK_FIELDS = {
  productId: "productId",
  packagingId: "packagingId",
  vatRate: "vatRate",
  version: null,
} as const;

export const SUPPLIER_ITEM_LINK_FIELD_MESSAGES = {
  productId: "Elegí el producto del catálogo.",
  packagingId: "Elegí la presentación de compra.",
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
    productId: link?.product.id ?? null,
    packagingId: link?.packaging.id ?? null,
    vatRate: link?.vatRate == null ? "" : String(link.vatRate),
    version,
  };
}

export function supplierItemLinkRequestFrom(
  { productId, packagingId, vatRate, version }: SupplierItemLinkFormValues,
  requiresVatRate: boolean,
): SupplierPriceListRowLinkBody {
  return {
    version,
    productId: productId ?? "",
    packagingId: packagingId ?? "",
    vatRate: requiresVatRate ? Number(vatRate) : null,
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

export function linkPackagingOptions(
  choices: SupplierItemLinkChoices,
  productId: string | null,
): Options<{ value: string; label: string; description: string }> {
  const product = choices.products.find((candidate) => candidate.id === productId);
  const [first, ...rest] = (product?.packagings ?? []).map((packaging) => ({
    value: packaging.id,
    label: packaging.name,
    description: `Contiene ${formatStockQuantity(packaging.quantityPerPackage, product?.saleUnit ?? "UNIT")}`,
  }));
  return first && [first, ...rest];
}

export function proposedProductIdOf(proposal: SupplierItemLinkProposal | undefined): string | null {
  return proposal?.kind === "proposed" ? proposal.product.id : null;
}
