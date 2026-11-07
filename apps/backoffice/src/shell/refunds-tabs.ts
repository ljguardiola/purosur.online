import type { PagePart } from "../platform/page-parts";
import { type BackofficeAccess, canSeeRefundsArea, canSeeReturnsReport } from "./backoffice-access";

export type RefundsTab = "pending" | "history";

export const REFUNDS_TABS: readonly PagePart<BackofficeAccess, RefundsTab>[] = [
  { key: "pending", isVisibleTo: canSeeRefundsArea },
  { key: "history", isVisibleTo: canSeeReturnsReport },
];
