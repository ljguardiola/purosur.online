import type { CashBalance } from "@purosur/contracts";
import { useEffect, useState } from "react";
import type { CashBalanceState } from "./expected-cash-panel";

export function useCashBalance(load: () => Promise<CashBalance | null | "unavailable">) {
  const [state, setState] = useState<CashBalanceState>({ status: "loading" });

  useEffect(() => {
    if (state.status !== "loading") {
      return;
    }
    let current = true;
    load().then(
      (answer) => {
        // Without an open session there is no balance: the register is about to leave this screen.
        if (current && answer !== null) {
          setState(
            answer === "unavailable" ? { status: "failed" } : { status: "loaded", balance: answer },
          );
        }
      },
      () => {
        if (current) {
          setState({ status: "failed" });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [load, state.status]);

  return {
    state,
    retry() {
      setState({ status: "loading" });
    },
  };
}
