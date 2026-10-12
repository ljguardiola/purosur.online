import type { RegisterAbility } from "@purosur/domain";
import { useNavigate } from "@tanstack/react-router";
import { ShoppingBasket, Wallet } from "lucide-react";
import { useState } from "react";
import type { ActionEntry } from "./action-entries";
import { ACTION_ENTRIES, entriesFor } from "./action-entries";
import { LeavingTheRegisterModal } from "./leaving-the-register-modal";
import type { NavigationRailProps } from "./navigation-rail";
import { NavigationRail } from "./navigation-rail";

const SCREEN_ROUTES = {
  sale: "/session",
  cash: "/cash",
  history: "/history",
  receipt_printer: "/receipt-printer",
  serial_devices: "/serial-devices",
} as const satisfies Record<string, ActionEntry["to"]>;

export function OpenSessionRail({
  registerName,
  lock,
  current,
  abilities,
}: {
  registerName: string | null;
  lock: () => void;
  current: keyof typeof SCREEN_ROUTES;
  abilities: readonly RegisterAbility[];
}) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const linksTo = (
    routes: readonly ActionEntry["to"][],
  ): NonNullable<NavigationRailProps["links"]> =>
    entriesFor(ACTION_ENTRIES, abilities)
      .filter(({ to }) => routes.includes(to))
      .map(({ label, icon, to }) => ({ label, icon, to, current: to === SCREEN_ROUTES[current] }));

  return (
    <>
      <NavigationRail
        entries={[]}
        home={
          current === "sale"
            ? { label: "Venta", icon: ShoppingBasket }
            : { label: "Venta", icon: ShoppingBasket, to: "/session" }
        }
        links={[
          ...linksTo(["/history"]),
          { label: "Caja", icon: Wallet, to: "/cash", current: current === "cash" },
          ...linksTo(["/receipt-printer", "/serial-devices"]),
        ]}
        onSignOut={() => setLeaving(true)}
      />
      <LeavingTheRegisterModal
        open={leaving}
        registerName={registerName}
        onClose={() => setLeaving(false)}
        onLock={() => {
          setLeaving(false);
          lock();
        }}
        onCloseRegister={() => {
          setLeaving(false);
          void navigate({ to: "/cash-count", search: { leaving: true } });
        }}
      />
    </>
  );
}
