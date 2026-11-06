import { createRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import type { BackofficeAccess } from "./backoffice-access";
import { rootRoute } from "./root-route";

const ownAccountTabs = z.enum(["data", "credentials"]);

export const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "signed-in",
  validateSearch: z.object({ account: ownAccountTabs.optional().catch(undefined) }),
  beforeLoad: ({ context: { session } }) => {
    if (session.kind === "signed-out") {
      throw redirect({ to: "/sign-in" });
    }
    return { session };
  },
});

export function refuseWithout(
  access: BackofficeAccess,
  canSee: (access: BackofficeAccess) => boolean,
): void {
  if (!canSee(access)) {
    throw redirect({ to: "/", search: { account: "credentials" } });
  }
}
