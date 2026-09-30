import { ShoppingBasket, Wallet } from "lucide-react";
import { NavigationRail } from "./navigation-rail";

export function OpenSessionRail({
  firstName,
  current,
}: {
  firstName: string;
  current: "sale" | "cash";
}) {
  return (
    <NavigationRail
      firstName={firstName}
      entries={[]}
      home={
        current === "sale"
          ? { label: "Venta", icon: ShoppingBasket }
          : { label: "Venta", icon: ShoppingBasket, to: "/session" }
      }
      links={[{ label: "Caja", icon: Wallet, to: "/cash", current: current === "cash" }]}
    />
  );
}
