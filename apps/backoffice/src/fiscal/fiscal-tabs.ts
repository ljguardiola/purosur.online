import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canSeeContingencyTicketRescue,
  canSeeFiscalConfigurationArea,
  canSeeFiscalInformation,
  canSeeFiscalPage,
} from "../shell/backoffice-access";

export type FiscalTab = "tasks" | "documents" | "caea" | "settings";

export const FISCAL_TABS: readonly PagePart<BackofficeAccess, FiscalTab>[] = [
  { key: "tasks", isVisibleTo: canSeeFiscalInformation },
  { key: "documents", isVisibleTo: canSeeFiscalInformation },
  { key: "caea", isVisibleTo: canSeeFiscalPage },
  { key: "settings", isVisibleTo: canSeeFiscalConfigurationArea },
];

export const FISCAL_TAB_TARGETS = {
  tasks: "/fiscal",
  documents: "/fiscal/documents",
  caea: "/fiscal/caea",
  settings: "/fiscal/settings",
} as const;

export type CaeaPart = "exceptionality" | "fortnight-reports" | "points-of-sale" | "rescue";

export const CAEA_PARTS: readonly PagePart<BackofficeAccess, CaeaPart>[] = [
  { key: "exceptionality", isVisibleTo: canSeeFiscalInformation },
  { key: "fortnight-reports", isVisibleTo: canSeeFiscalConfigurationArea },
  { key: "points-of-sale", isVisibleTo: canSeeFiscalConfigurationArea },
  { key: "rescue", isVisibleTo: canSeeContingencyTicketRescue },
];

export const POINTS_OF_SALE_ANCHOR = "points-of-sale";
