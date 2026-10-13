import type { StartupPending } from "@purosur/contracts";
import { useState } from "react";
import { hasStartupPendingItems } from "../register/startup-pending-items";

export function startupPendingGate() {
  let dismissed = false;
  return {
    dismissed: () => dismissed,
    dismiss: () => {
      dismissed = true;
    },
    lands: async (read: () => Promise<StartupPending | "not_permitted">): Promise<boolean> => {
      if (dismissed) {
        return false;
      }
      const pending = await read().catch(() => undefined);
      if (
        pending === undefined ||
        pending === "not_permitted" ||
        !hasStartupPendingItems(pending)
      ) {
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
