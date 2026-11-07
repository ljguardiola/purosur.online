import { createRoute, redirect } from "@tanstack/react-router";
import { canSeeRegistersPage } from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { REGISTERS_TAB_TARGETS, REGISTERS_TABS, type RegistersTab } from "./registers-tabs";
import { salesAndCashAreaRoute } from "./sales-and-cash-area";
import { refuseWithout } from "./signed-in-route";

export const registersRoute = createRoute({
  getParentRoute: () => salesAndCashAreaRoute,
  path: "registers",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeRegistersPage);
    return {
      registersTabs: REGISTERS_TABS.filter((tab) => tab.isVisibleTo(session)).map((tab) => tab.key),
    };
  },
  component: lazyScreen(() => import("./registers-page"), "RegistersPage"),
});

export function registersTabRedirect(
  registersTabs: readonly RegistersTab[],
  own: RegistersTab,
): void {
  if (registersTabs.includes(own)) {
    return;
  }
  const [first] = registersTabs;
  if (first === undefined) {
    throw redirect({ to: "/" });
  }
  throw redirect({ to: REGISTERS_TAB_TARGETS[first] });
}
