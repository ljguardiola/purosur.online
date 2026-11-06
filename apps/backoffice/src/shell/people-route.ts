import { createRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { type PagePart, pagePartsFor } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canManageUsers,
  canSeePeopleArea,
  canSeeRolesArea,
  canSeeUsersArea,
} from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { settingsAreaRoute } from "./settings-area";
import { refuseWithout } from "./signed-in-route";

export type PeopleTab = "users" | "roles";

export const PEOPLE_TABS: readonly PagePart<BackofficeAccess, PeopleTab>[] = [
  { key: "users", isVisibleTo: canSeeUsersArea },
  { key: "roles", isVisibleTo: canSeeRolesArea },
];

const peopleSearch = z.object({
  assistant: z.enum(["compromise-response"]).optional().catch(undefined),
});

export const peopleRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "people",
  validateSearch: peopleSearch,
  beforeLoad: ({ context: { session }, search }) => {
    refuseWithout(session, canSeePeopleArea);
    if (search.assistant !== undefined && !canManageUsers(session)) {
      throw redirect({
        to: ".",
        search: (previous) => ({ ...previous, assistant: undefined }),
        replace: true,
      });
    }
  },
  component: lazyScreen(() => import("./people-page"), "PeoplePage"),
});

export const peopleLandingRoute = createRoute({
  getParentRoute: () => peopleRoute,
  path: "/",
  beforeLoad: ({ context: { session } }) => {
    const parts = pagePartsFor(session, PEOPLE_TABS);
    if (parts.kind === "hidden") {
      refuseWithout(session, () => false);
      return;
    }
    throw redirect({ to: parts.defaultPart === "users" ? "/people/users" : "/people/roles" });
  },
});

export function peopleTabRedirect(session: BackofficeAccess, own: PeopleTab): void {
  const parts = pagePartsFor(session, PEOPLE_TABS);
  if (parts.kind === "hidden" || parts.visible.includes(own)) {
    return;
  }
  throw redirect({ to: "/people" });
}
