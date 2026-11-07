import type { PagePart } from "../platform/page-parts";
import { type BackofficeAccess, canSeeRegistersArea, canSeeReports } from "./backoffice-access";

export type RegistersTab = "registers" | "closes" | "movements";

export const REGISTERS_TABS: readonly PagePart<BackofficeAccess, RegistersTab>[] = [
  { key: "registers", isVisibleTo: canSeeRegistersArea },
  { key: "closes", isVisibleTo: canSeeReports },
  { key: "movements", isVisibleTo: canSeeReports },
];

export const REGISTERS_TAB_TARGETS = {
  registers: "/registers",
  closes: "/registers/closes",
  movements: "/registers/movements",
} as const;
