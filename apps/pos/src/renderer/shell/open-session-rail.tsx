import { useNavigate } from "@tanstack/react-router";
import { ShoppingBasket, Wallet } from "lucide-react";
import { useState } from "react";
import { CloseBeforeLeavingModal } from "./close-before-leaving-modal";
import { NavigationRail } from "./navigation-rail";

export function OpenSessionRail({
  firstName,
  registerName,
  current,
}: {
  firstName: string;
  registerName: string | null;
  current: "sale" | "cash";
}) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <NavigationRail
        firstName={firstName}
        entries={[]}
        home={
          current === "sale"
            ? { label: "Venta", icon: ShoppingBasket }
            : { label: "Venta", icon: ShoppingBasket, to: "/session" }
        }
        links={[{ label: "Caja", icon: Wallet, to: "/cash", current: current === "cash" }]}
        onSignOut={() => setLeaving(true)}
      />
      <CloseBeforeLeavingModal
        open={leaving}
        registerName={registerName}
        onClose={() => setLeaving(false)}
        onCloseRegister={() => {
          setLeaving(false);
          void navigate({ to: "/cash-count", search: { leaving: true } });
        }}
      />
    </>
  );
}
