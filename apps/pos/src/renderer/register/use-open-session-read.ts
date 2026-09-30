import { useEffect, useState } from "react";

export type OpenSessionRead<T> =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; value: T }
  | { status: "refreshing"; value: T };

export function useOpenSessionRead<T>(load: () => Promise<T | null | "unavailable">) {
  const [state, setState] = useState<OpenSessionRead<T>>({ status: "loading" });

  useEffect(() => {
    if (state.status !== "loading" && state.status !== "refreshing") {
      return;
    }
    let current = true;
    load().then(
      (answer) => {
        // Without an open session there is nothing to read: the register is about to leave this screen.
        if (current && answer !== null) {
          setState(
            answer === "unavailable" ? { status: "failed" } : { status: "loaded", value: answer },
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
    refresh() {
      setState((previous) =>
        previous.status === "loaded" ? { status: "refreshing", value: previous.value } : previous,
      );
    },
  };
}
