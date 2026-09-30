import type { ListedCashMovement } from "@purosur/contracts";
import { useEffect, useState } from "react";
import type { CashMovementsState } from "./cash-movements-table";

type ReadState = CashMovementsState | { status: "refreshing"; movements: ListedCashMovement[] };

export function useCashMovements(load: () => Promise<ListedCashMovement[] | null | "unavailable">) {
  const [read, setRead] = useState<ReadState>({ status: "loading" });

  useEffect(() => {
    if (read.status !== "loading" && read.status !== "refreshing") {
      return;
    }
    let current = true;
    load().then(
      (answer) => {
        // Without an open session there are no movements: the register is about to leave this screen.
        if (current && answer !== null) {
          setRead(
            answer === "unavailable"
              ? { status: "failed" }
              : { status: "loaded", movements: answer },
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
      read.status === "refreshing"
        ? { status: "loaded" as const, movements: read.movements }
        : read,
    retry() {
      setRead({ status: "loading" });
    },
    refresh() {
      setRead((previous) =>
        previous.status === "loaded"
          ? { status: "refreshing", movements: previous.movements }
          : previous,
      );
    },
  };
}
