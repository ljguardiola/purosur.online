import type { BatteryStanding } from "@purosur/domain";

export interface BatteryShutdownDeps {
  standing: () => BatteryStanding;
  hasOpenSale: () => boolean;
  push: () => Promise<unknown>;
  schedule: (run: () => void, delayMs: number) => () => void;
  quit: () => void;
  pushLimitMs: number;
  saleRecheckMs: number;
  onFailure?: (error: unknown) => void;
}

export interface BatteryShutdown {
  evaluate(): void;
  newSalesStoppedByBattery(): boolean;
}

type Phase = "idle" | "waiting_for_sale" | "closing";

export function createBatteryShutdown(deps: BatteryShutdownDeps): BatteryShutdown {
  let phase: Phase = "idle";
  let cancelRecheck: (() => void) | undefined;

  function stopRechecking(): void {
    cancelRecheck?.();
    cancelRecheck = undefined;
  }

  async function pushOnce(): Promise<void> {
    try {
      await deps.push();
    } catch (error) {
      deps.onFailure?.(error);
    }
  }

  async function close(): Promise<void> {
    phase = "closing";
    let cancelLimit = () => {};
    const limitReached = new Promise<void>((resolve) => {
      cancelLimit = deps.schedule(resolve, deps.pushLimitMs);
    });
    await Promise.race([pushOnce(), limitReached]);
    cancelLimit();
    deps.quit();
  }

  function evaluate(): void {
    if (phase === "closing") {
      return;
    }
    stopRechecking();
    if (deps.standing() !== "critical") {
      phase = "idle";
      return;
    }
    if (deps.hasOpenSale()) {
      phase = "waiting_for_sale";
      cancelRecheck = deps.schedule(evaluate, deps.saleRecheckMs);
      return;
    }
    void close();
  }

  return {
    evaluate,
    newSalesStoppedByBattery: () => phase !== "idle",
  };
}
