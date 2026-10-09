import { useNavigate } from "@tanstack/react-router";
import { ShoppingBasket, Wallet } from "lucide-react";
import { useState } from "react";
import { LeavingTheRegisterModal } from "./leaving-the-register-modal";
import { NavigationRail } from "./navigation-rail";

export function OpenSessionRail({
  registerName,
  lock,
  current,
}: {
  registerName: string | null;
  lock: () => void;
  current: "sale" | "cash";
}) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <NavigationRail
        entries={[]}
        home={
          current === "sale"
            ? { label: "Venta", icon: ShoppingBasket }
            : { label: "Venta", icon: ShoppingBasket, to: "/session" }
        }
        links={[{ label: "Caja", icon: Wallet, to: "/cash", current: current === "cash" }]}
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
