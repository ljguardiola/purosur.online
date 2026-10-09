import { createRoute, redirect } from "@tanstack/react-router";
import { lazyScreen } from "../shell/lazy-screen";
import { publicRoute } from "../shell/public-route";

export const signInRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "sign-in",
  beforeLoad: ({ context: { session } }) => {
    if (session.kind === "signed-in") {
      throw redirect({ to: "/" });
    }
  },
  component: lazyScreen(() => import("./sign-in-page"), "SignInPage"),
});
