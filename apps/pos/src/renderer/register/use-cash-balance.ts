import type { CashBalance } from "@purosur/contracts";
import { useEffect, useState } from "react";
import type { CashBalanceState } from "./expected-cash-panel";

type ReadState = CashBalanceState | { status: "refreshing"; balance: CashBalance };

export function useCashBalance(load: () => Promise<CashBalance | null | "unavailable">) {
  const [read, setRead] = useState<ReadState>({ status: "loading" });

  useEffect(() => {
    if (read.status !== "loading" && read.status !== "refreshing") {
      return;
    }
    let current = true;
    load().then(
      (answer) => {
        // Without an open session there is no balance: the register is about to leave this screen.
        if (current && answer !== null) {
          setRead(
            answer === "unavailable" ? { status: "failed" } : { status: "loaded", balance: answer },
          );
        }
      },
      () => {
        if (current) {
          setRead({ status: "failed" });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [load, read.status]);

  return {
    state:
      read.status === "refreshing" ? { status: "loaded" as const, balance: read.balance } : read,
    retry() {
      setRead({ status: "loading" });
    },
    refresh() {
      setRead((previous) =>
        previous.status === "loaded"
          ? { status: "refreshing", balance: previous.balance }
          : previous,
      );
    },
  };
}
