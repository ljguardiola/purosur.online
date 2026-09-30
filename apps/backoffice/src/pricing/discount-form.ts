import { type CalendarDate, parseDate } from "@internationalized/date";
import type {
  DiscountCreationBody,
  DiscountEditBody,
  DiscountSummary,
  DiscountTargets,
} from "@purosur/contracts";
import {
  DISCOUNT_BUY_QTY_MIN,
  DISCOUNT_NAME_MAX_LENGTH,
  DISCOUNT_PAY_QTY_MIN,
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  type DiscountBenefit,
  type DiscountTargetKind,
  isBuyNPayMSaleUnit,
  isDiscountNameTooLong,
  isValidDiscountPayQty,
  normalizeDiscountWeekdays,
} from "@purosur/domain";
import {
  type ComboBoxOption,
  type Option,
  type Options,
  sortedItems,
  textOrder,
} from "@purosur/ui";
import { Package, Percent } from "lucide-react";
import { createElement } from "react";
import { categoriesInTreeOrder, categoryPathLabels } from "../catalog/category-path";
import { formatNetContent } from "../catalog/net-content";
import { DISCOUNT_KIND_LABELS, DISCOUNT_TARGET_KIND_LABELS } from "./discount-texts";

export type DiscountFormValues = {
  name: string;
  benefitKind: DiscountBenefit["kind"];
  targetKind: DiscountTargetKind;
  targetId: string | null;
  percent: string;
  buyQty: string;
  payQty: string;
  validFrom: CalendarDate | null;
  validTo: CalendarDate | null;
  weekdays: string[];
};

export const EMPTY_DISCOUNT_FORM: DiscountFormValues = {
  name: "",
  benefitKind: "PERCENT_OFF",
  targetKind: "PRODUCT",
  targetId: null,
  percent: "",
  buyQty: "",
  payQty: "",
  validFrom: null,
  validTo: null,
  weekdays: [],
};

function wholeNumberFrom(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function benefitFrom(values: DiscountFormValues): DiscountBenefit {
  return values.benefitKind === "PERCENT_OFF"
    ? { kind: "PERCENT_OFF", percent: wholeNumberFrom(values.percent) }
    : {
        kind: "BUY_N_PAY_M",
        buyQty: wholeNumberFrom(values.buyQty),
        payQty: wholeNumberFrom(values.payQty),
      };
}

export function discountRequestFrom(values: DiscountFormValues): DiscountCreationBody {
  return {
    name: values.name,
    benefit: benefitFrom(values),
    target: { kind: values.targetKind, id: values.targetId ?? "" },
    validFrom: values.validFrom?.toString() ?? "",
    validTo: values.validTo?.toString() ?? "",
    weekdays: values.weekdays.map(Number),
  };
}

export type DiscountEditFormValues = DiscountFormValues & { active: boolean; version: number };

export const EMPTY_DISCOUNT_EDIT_FORM: DiscountEditFormValues = {
  ...EMPTY_DISCOUNT_FORM,
  active: true,
  version: 1,
};

export function discountFormValues(discount: DiscountSummary): DiscountEditFormValues {
  return {
    name: discount.name,
    benefitKind: discount.benefit.kind,
    targetKind: discount.target.kind,
    targetId: discount.target.id,
    percent: discount.benefit.kind === "PERCENT_OFF" ? String(discount.benefit.percent) : "",
    buyQty: discount.benefit.kind === "BUY_N_PAY_M" ? String(discount.benefit.buyQty) : "",
    payQty: discount.benefit.kind === "BUY_N_PAY_M" ? String(discount.benefit.payQty) : "",
    validFrom: parseDate(discount.validFrom),
    validTo: parseDate(discount.validTo),
    weekdays: normalizeDiscountWeekdays(discount.weekdays).map(String),
    active: discount.active,
    version: discount.version,
  };
}

export function discountEditRequestFrom(values: DiscountEditFormValues): DiscountEditBody {
  return { ...discountRequestFrom(values), version: values.version, active: values.active };
}

export const DISCOUNT_FIELDS = {
  name: "name",
  benefit: ({ benefitKind }: DiscountFormValues) =>
    benefitKind === "PERCENT_OFF" ? ("percent" as const) : ("buyQty" as const),
  "benefit.buyQty": "buyQty",
  "benefit.payQty": "payQty",
  target: "targetId",
  validFrom: "validFrom",
  validTo: "validTo",
  weekdays: "weekdays",
} as const;

export const DISCOUNT_EDIT_FIELDS = { ...DISCOUNT_FIELDS, version: null, active: null } as const;

const TARGET_PLACEHOLDERS = {
  PRODUCT: "Elegí un producto",
  CATEGORY: "Elegí una categoría",
  TAG: "Elegí un distintivo",
} satisfies Record<DiscountTargetKind, string>;

export function targetPlaceholder(kind: DiscountTargetKind): string {
  return TARGET_PLACEHOLDERS[kind];
}

const TARGET_REVIEW_MESSAGES = {
  PRODUCT: "Revisá el producto elegido.",
  CATEGORY: "Revisá la categoría elegida.",
  TAG: "Revisá el distintivo elegido.",
} satisfies Record<DiscountTargetKind, string>;

const TARGET_UNAVAILABLE_MESSAGES = {
  PRODUCT: "Ya no está disponible. Elegí otro producto.",
  CATEGORY: "Ya no está disponible. Elegí otra categoría.",
  TAG: "Ya no está disponible. Elegí otro distintivo.",
} satisfies Record<DiscountTargetKind, string>;

export const TARGET_SOLD_BY_WEIGHT_MESSAGE = "Se vende por peso. Elegí otro producto.";

export function productSoldByWeightMessage(productName: string): string {
  return `"${productName}" se vende por peso: esta promoción solo aplica a productos por unidad.`;
}

export function targetUnavailableMessage(kind: DiscountTargetKind): string {
  return TARGET_UNAVAILABLE_MESSAGES[kind];
}

export const DISCOUNT_MESSAGES = {
  name: ({ name }: DiscountFormValues) => {
    const trimmed = name.trim();
    if (trimmed === "") {
      return "Ingresá el nombre de la promoción.";
    }
    if (isDiscountNameTooLong(trimmed)) {
      return `El nombre puede tener hasta ${DISCOUNT_NAME_MAX_LENGTH} caracteres.`;
    }
    return "Revisá el nombre de la promoción.";
  },
  percent: () =>
    `Ingresá un porcentaje entero entre ${DISCOUNT_PERCENT_MIN} y ${DISCOUNT_PERCENT_MAX}.`,
  buyQty: () => `Ingresá una cantidad entera de ${DISCOUNT_BUY_QTY_MIN} o más.`,
  payQty: ({ payQty }: DiscountFormValues) =>
    isValidDiscountPayQty(wholeNumberFrom(payQty))
      ? "Ingresá menos unidades que en Lleve."
      : `Ingresá una cantidad entera de ${DISCOUNT_PAY_QTY_MIN} o más.`,
  targetId: ({ targetKind, targetId }: DiscountFormValues) =>
    targetId === null ? `${TARGET_PLACEHOLDERS[targetKind]}.` : TARGET_REVIEW_MESSAGES[targetKind],
  validFrom: ({ validFrom }: DiscountFormValues) =>
    validFrom === null ? "Ingresá la fecha de inicio." : "Revisá la fecha de inicio.",
  validTo: ({ validTo }: DiscountFormValues) =>
    validTo === null
      ? "Ingresá la fecha de fin."
      : "La fecha de fin no puede ser anterior a la de inicio.",
  weekdays: () => "Revisá los días de la semana.",
};

// Typed by hand: inferred from lucide, an icon's optional className fails the design system's Icon
// type under exactOptionalPropertyTypes.
export const DISCOUNT_KIND_CARDS = [
  {
    value: "PERCENT_OFF",
    icon: createElement<{ className?: string }>(Percent),
    label: "Porcentaje de descuento",
    description: "Sobre un producto, una categoría o un distintivo",
  },
  {
    value: "BUY_N_PAY_M",
    icon: createElement<{ className?: string }>(Package),
    label: "Lleve N, pague M",
    description: "Sobre un producto por unidad",
  },
] as const satisfies Options<Option<DiscountBenefit["kind"]>>;

export const DISCOUNT_TARGET_KIND_OPTIONS = [
  { value: "PRODUCT", label: DISCOUNT_TARGET_KIND_LABELS.PRODUCT },
  { value: "CATEGORY", label: DISCOUNT_TARGET_KIND_LABELS.CATEGORY },
  { value: "TAG", label: DISCOUNT_TARGET_KIND_LABELS.TAG },
] as const satisfies Options<Option<DiscountTargetKind>>;

export const WEEKDAY_OPTIONS = [
  { value: "1", label: "Lun", accessibleName: "Lunes" },
  { value: "2", label: "Mar", accessibleName: "Martes" },
  { value: "3", label: "Mié", accessibleName: "Miércoles" },
  { value: "4", label: "Jue", accessibleName: "Jueves" },
  { value: "5", label: "Vie", accessibleName: "Viernes" },
  { value: "6", label: "Sáb", accessibleName: "Sábado" },
  { value: "7", label: "Dom", accessibleName: "Domingo" },
] as const;

const INACTIVE_TARGET_STATUS = "Inactivo";
const SOLD_BY_WEIGHT_TARGET_STATUS = "Por peso";

type CurrentTarget = { kind: DiscountTargetKind; id: string; name: string };
type KeptTarget = CurrentTarget & { status: string };

const nameOrder = textOrder((named: { name: string }) => named.name);

type ProductTarget = DiscountTargets["products"][number];

function productOption(product: ProductTarget): ComboBoxOption<string> {
  const description = [
    product.brandName,
    product.netContent === null ? null : formatNetContent(product.netContent),
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return {
    value: product.id,
    label: product.name,
    ...(description === "" ? {} : { description }),
    searchKeywords: product.barcodes,
  };
}

function offeredTargets(
  kind: DiscountTargetKind,
  sources: DiscountTargets,
): ComboBoxOption<string>[] {
  if (kind === "CATEGORY") {
    const labels = categoryPathLabels([...sources.categories]);
    return categoriesInTreeOrder([...sources.categories]).map((category) => ({
      value: category.id,
      label: labels.get(category.id) ?? category.name,
    }));
  }
  if (kind === "PRODUCT") {
    return sortedItems(sources.products, { order: nameOrder, direction: "ascending" }).map(
      productOption,
    );
  }
  return sortedItems(sources.tags, { order: nameOrder, direction: "ascending" }).map((item) => ({
    value: item.id,
    label: item.name,
  }));
}

export function eligibleTargets(
  benefitKind: DiscountBenefit["kind"],
  sources: DiscountTargets,
): DiscountTargets {
  if (benefitKind === "PERCENT_OFF") {
    return sources;
  }
  return {
    products: sources.products.filter((product) => isBuyNPayMSaleUnit(product.saleUnit)),
    categories: [],
    tags: [],
  };
}

function listedTargets(
  kind: DiscountTargetKind,
  sources: DiscountTargets,
): readonly { id: string }[] {
  if (kind === "PRODUCT") {
    return sources.products;
  }
  return kind === "CATEGORY" ? sources.categories : sources.tags;
}

export function keptTarget(
  sources: DiscountTargets,
  current: Pick<DiscountSummary, "benefit" | "target"> | undefined,
): KeptTarget | undefined {
  if (current === undefined) {
    return undefined;
  }
  const { target, benefit } = current;
  if (!listedTargets(target.kind, sources).some((listed) => listed.id === target.id)) {
    return { ...target, status: INACTIVE_TARGET_STATUS };
  }
  return benefit.kind === "BUY_N_PAY_M" &&
    target.kind === "PRODUCT" &&
    isSoldByWeightProduct(sources, target.id)
    ? { ...target, status: SOLD_BY_WEIGHT_TARGET_STATUS }
    : undefined;
}

function isSoldByWeightProduct(sources: DiscountTargets, productId: string | null): boolean {
  return sources.products.some(
    (product) => product.id === productId && !isBuyNPayMSaleUnit(product.saleUnit),
  );
}

export function soldByWeightHelp(
  values: DiscountFormValues,
  sources: DiscountTargets,
): string | undefined {
  return values.benefitKind === "BUY_N_PAY_M" &&
    values.targetKind === "PRODUCT" &&
    isSoldByWeightProduct(sources, values.targetId)
    ? `Este producto se vende por peso: ${DISCOUNT_KIND_LABELS.BUY_N_PAY_M} no se le aplica.`
    : undefined;
}

export function targetForKind(
  values: DiscountFormValues,
  benefitKind: DiscountBenefit["kind"],
  sources: DiscountTargets,
): Pick<DiscountFormValues, "targetKind" | "targetId"> {
  const { targetKind, targetId } = values;
  if (benefitKind === "PERCENT_OFF") {
    return { targetKind, targetId };
  }
  const eligible =
    targetKind === "PRODUCT" &&
    eligibleTargets(benefitKind, sources).products.some((product) => product.id === targetId);
  return { targetKind: "PRODUCT", targetId: eligible ? targetId : null };
}

export function targetOptions(
  kind: DiscountTargetKind,
  sources: DiscountTargets,
  current?: KeptTarget,
): Options<ComboBoxOption<string>> | undefined {
  const offered = offeredTargets(kind, sources);
  const keptCurrent: ComboBoxOption<string>[] =
    current !== undefined &&
    current.kind === kind &&
    !offered.some((option) => option.value === current.id)
      ? [{ value: current.id, label: current.name, status: current.status }]
      : [];
  const [first, ...rest] = [...keptCurrent, ...offered];
  return first === undefined ? undefined : [first, ...rest];
}
