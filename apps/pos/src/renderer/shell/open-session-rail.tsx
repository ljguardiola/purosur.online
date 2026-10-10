import type { RegisterAbility } from "@purosur/domain";
import { useNavigate } from "@tanstack/react-router";
import { History, ShoppingBasket, Wallet } from "lucide-react";
import { useState } from "react";
import { LeavingTheRegisterModal } from "./leaving-the-register-modal";
import type { NavigationRailProps } from "./navigation-rail";
import { NavigationRail } from "./navigation-rail";

export function OpenSessionRail({
  registerName,
  lock,
  current,
  abilities = [],
}: {
  registerName: string | null;
  lock: () => void;
  current: "sale" | "cash" | "history";
  abilities?: readonly RegisterAbility[];
}) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const historyLinks: NonNullable<NavigationRailProps["links"]> = abilities.includes(
    "view_sales_history",
  )
    ? [{ label: "Historial", icon: History, to: "/history", current: current === "history" }]
    : [];

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
