import { createRoute, redirect } from "@tanstack/react-router";
import { canManageUsers } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { publicRoute } from "../shell/public-route";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

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

export const compromiseResponseRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "compromise-response",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageUsers),
  component: lazyScreen(() => import("./compromise-response-page"), "CompromiseResponsePage"),
});
