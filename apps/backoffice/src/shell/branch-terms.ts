import { formatNumber, plural } from "@purosur/ui";

export type BranchTerm =
  | "expiringLotAlertDays"
  | "unreviewedPriceAlertDays"
  | "goodConditionReturnDays"
  | "supplierPriceListDailyExtractionCap";

type BranchTermDefinition = {
  label: string;
  modalTitle: string;
  shown: (value: number) => string;
};

function daysShown(days: number): string {
  return plural(days, { one: "1 día", other: `${formatNumber(days)} días` });
}

export const BRANCH_TERMS: Record<BranchTerm, BranchTermDefinition> = {
  expiringLotAlertDays: {
    label: "Aviso de vencimiento",
    modalTitle: "Cambiar el plazo",
    shown: daysShown,
  },
  unreviewedPriceAlertDays: {
    label: "Precio sin revisar",
    modalTitle: "Cambiar el plazo",
    shown: daysShown,
  },
  goodConditionReturnDays: {
    label: "Cambio en buen estado",
    modalTitle: "Cambiar el plazo",
    shown: daysShown,
  },
  supplierPriceListDailyExtractionCap: {
    label: "Tope diario de listas",
    modalTitle: "Cambiar el tope",
    shown: formatNumber,
  },
};
