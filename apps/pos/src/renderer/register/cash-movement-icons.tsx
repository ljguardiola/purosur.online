import type { CashMovementType } from "@purosur/domain";
import type { Icon } from "@purosur/ui";
import {
  ArrowDownToLine,
  ArrowUp,
  Coins,
  Lock,
  ShoppingBasket,
  Undo2,
  Vault,
  Wallet,
} from "lucide-react";

export const CASH_MOVEMENT_ICONS = {
  OPENING: <Wallet />,
  CASH_IN: <ArrowDownToLine />,
  CASH_OUT: <ArrowUp />,
  WITHDRAWAL: <Vault />,
  SALE: <ShoppingBasket />,
  CHANGE: <Coins />,
  REFUND: <Undo2 />,
  CLOSING: <Lock />,
} as const satisfies Record<CashMovementType, Icon>;
