import { createRoute, redirect } from "@tanstack/react-router";
import type { BackofficeAccess } from "./backoffice-access";
import { rootRoute } from "./root-route";

export const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "signed-in",
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
    throw redirect({ to: "/account" });
  }
}
