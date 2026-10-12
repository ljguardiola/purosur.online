import type { RegisterAbility } from "@purosur/domain";
import { useNavigate } from "@tanstack/react-router";
import { History, ShoppingBasket, Wallet } from "lucide-react";
import { useState } from "react";
import { ACTION_ENTRIES } from "./action-entries";
import { LeavingTheRegisterModal } from "./leaving-the-register-modal";
import type { NavigationRailProps } from "./navigation-rail";
import { NavigationRail } from "./navigation-rail";

const DEVICE_SCREENS = {
  "/receipt-printer": "receipt_printer",
  "/serial-devices": "serial_devices",
} as const;

export function OpenSessionRail({
  registerName,
  lock,
  current,
  abilities = [],
}: {
  registerName: string | null;
  lock: () => void;
  current: "sale" | "cash" | "history" | "receipt_printer" | "serial_devices";
  abilities?: readonly RegisterAbility[];
}) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const historyLinks: NonNullable<NavigationRailProps["links"]> = abilities.includes(
    "view_sales_history",
  )
    ? [{ label: "Historial", icon: History, to: "/history", current: current === "history" }]
    : [];
  const deviceLinks: NonNullable<NavigationRailProps["links"]> = ACTION_ENTRIES.flatMap(
    ({ label, icon, ability, to }) =>
      (to === "/receipt-printer" || to === "/serial-devices") && abilities.includes(ability)
        ? [{ label, icon, to, current: current === DEVICE_SCREENS[to] }]
        : [],
  );

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
          ...historyLinks,
          { label: "Caja", icon: Wallet, to: "/cash", current: current === "cash" },
          ...deviceLinks,
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
