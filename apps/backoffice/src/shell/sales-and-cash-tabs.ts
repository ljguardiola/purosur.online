import type { AreaTabPart } from "./area-tabs";
import { canSeeRefundsPage, canSeeRegistersList, canSeeReports } from "./backoffice-access";

export type SalesAndCashTab = "registers" | "closes" | "movements" | "refunds";

export const SALES_AND_CASH_TABS: readonly AreaTabPart<SalesAndCashTab>[] = [
  { key: "registers", label: "Cajas", to: "/registers", isVisibleTo: canSeeRegistersList },
  { key: "closes", label: "Cierres de caja", to: "/registers/closes", isVisibleTo: canSeeReports },
  {
    key: "movements",
    label: "Movimientos de efectivo",
    to: "/registers/movements",
    isVisibleTo: canSeeReports,
  },
  {
    key: "refunds",
    label: "Devoluciones y reembolsos",
    to: "/refunds",
    isVisibleTo: canSeeRefundsPage,
  },
];
