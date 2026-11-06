import type { PagePart } from "../platform/page-parts";
import { type BackofficeAccess, canSeeRolesArea, canSeeUsersArea } from "./backoffice-access";

export type PeopleTab = "users" | "roles";

export const PEOPLE_TABS: readonly PagePart<BackofficeAccess, PeopleTab>[] = [
  { key: "users", isVisibleTo: canSeeUsersArea },
  { key: "roles", isVisibleTo: canSeeRolesArea },
];
