import { createRoute, redirect } from "@tanstack/react-router";
import { lazyScreen } from "./lazy-screen";
import {
  canSeeRegistersTabs,
  REGISTERS_TAB_TARGETS,
  REGISTERS_TABS,
  type RegistersTab,
} from "./registers-tabs";
import { salesAndCashAreaRoute } from "./sales-and-cash-area";
import { refuseWithout } from "./signed-in-route";

export const registersRoute = createRoute({
  getParentRoute: () => salesAndCashAreaRoute,
  path: "registers",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeRegistersTabs);
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
  const [first] = registersTabs;
  if (first !== undefined && !registersTabs.includes(own)) {
    throw redirect({ to: REGISTERS_TAB_TARGETS[first] });
  }
}
