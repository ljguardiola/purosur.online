import { createRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { pagePartsFor } from "../platform/page-parts";
import { type BackofficeAccess, canManageUsers, canSeePeopleArea } from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { PEOPLE_TABS, type PeopleTab } from "./people-tabs";
import { settingsAreaRoute } from "./settings-area";
import { refuseWithout } from "./signed-in-route";

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
    const parts = pagePartsFor(session, PEOPLE_TABS);
    return { peopleTabs: parts.kind === "shown" ? parts.visible : [] };
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
