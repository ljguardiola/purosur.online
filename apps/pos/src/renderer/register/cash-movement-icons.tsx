import type { CashMovementType } from "@purosur/domain";
import type { Icon } from "@purosur/ui";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Lock,
  Receipt,
  ShoppingBasket,
  Undo2,
  Wallet,
} from "lucide-react";

export const CASH_MOVEMENT_ICONS = {
  OPENING: <Wallet />,
  CASH_IN: <ArrowDownToLine />,
  CASH_OUT: <Receipt />,
  WITHDRAWAL: <ArrowUpFromLine />,
  SALE: <ShoppingBasket />,
  CHANGE: <Coins />,
  REFUND: <Undo2 />,
  CLOSING: <Lock />,
} as const satisfies Record<CashMovementType, Icon>;
