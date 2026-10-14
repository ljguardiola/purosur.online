import type { StartupPending } from "@purosur/contracts";
import { useState } from "react";
import { hasStartupPendingItems } from "../register/startup-pending-items";

export function startupPendingGate() {
  let dismissed = false;
  let mayGoSelling = true;
  return {
    dismissed: () => dismissed && mayGoSelling,
    dismiss: () => {
      dismissed = true;
    },
    lands: async (read: () => Promise<StartupPending | "not_permitted">): Promise<boolean> => {
      const pending = await read().catch(() => undefined);
      if (pending === undefined || pending === "not_permitted") {
        mayGoSelling = true;
        dismissed = true;
        return false;
      }
      mayGoSelling = pending.may_go_selling;
      if (!mayGoSelling) {
        return true;
      }
      if (dismissed) {
        return false;
      }
      if (!hasStartupPendingItems(pending)) {
        dismissed = true;
        return false;
      }
      return true;
    },
  };
}

export type StartupPendingGate = ReturnType<typeof startupPendingGate>;

export function useStartupPendingGate(): StartupPendingGate {
  const [gate] = useState(startupPendingGate);
  return gate;
}
