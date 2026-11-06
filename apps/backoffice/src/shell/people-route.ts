import { createRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { pagePartsFor } from "../platform/page-parts";
import { canManageUsers, canSeePeopleArea } from "./backoffice-access";
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
  beforeLoad: ({ context: { peopleTabs } }) => {
    throw redirect({ to: peopleTabs[0] === "roles" ? "/people/roles" : "/people/users" });
  },
});

export function peopleTabRedirect(peopleTabs: readonly PeopleTab[], own: PeopleTab): void {
  if (!peopleTabs.includes(own)) {
    throw redirect({ to: "/people" });
  }
}
