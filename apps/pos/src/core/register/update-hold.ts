import type { UpdateSafeMomentAnswer } from "@purosur/contracts";
import { isSafeMomentToUpdate } from "@purosur/domain";

export interface UpdateHold {
  answerSafeMomentRequest(requestId: string): Promise<UpdateSafeMomentAnswer>;
  release(): void;
  admit(run: () => Promise<unknown>): boolean;
}

export function createUpdateHold(deps: {
  hasOpenSale: () => boolean | Promise<boolean>;
  schedule: (run: () => void, delayMs: number) => () => void;
  limitMs: number;
  settleLimitMs: number;
}): UpdateHold {
  const running = new Set<Promise<unknown>>();
  let held = false;
  let cancelRelease: (() => void) | undefined;

  function release(): void {
    held = false;
    cancelRelease?.();
    cancelRelease = undefined;
  }

  function runningSettledInTime(): Promise<boolean> {
    return new Promise((resolve) => {
      const cancelLimit = deps.schedule(() => resolve(false), deps.settleLimitMs);
      void Promise.allSettled(running).then(() => {
        cancelLimit();
        resolve(true);
      });
    });
  }

  async function isSafeToHold(): Promise<boolean> {
    if (!(await runningSettledInTime()) || !held) {
      return false;
    }
    const safe = isSafeMomentToUpdate({ hasOpenSale: await deps.hasOpenSale() });
    return safe && held;
  }

  return {
    async answerSafeMomentRequest(requestId) {
      cancelRelease?.();
      cancelRelease = undefined;
      held = true;
      let safe: boolean;
      try {
        safe = await isSafeToHold();
      } catch (error) {
        release();
        throw error;
      }
      if (safe) {
        cancelRelease = deps.schedule(release, deps.limitMs);
      } else {
        release();
      }
      return { type: "update-safe-moment", request_id: requestId, safe };
    },
    release,
    admit(run) {
      if (held) {
        return false;
      }
      const request = run();
      running.add(request);
      void request.finally(() => running.delete(request));
      return true;
    },
  };
}

export function gateRendererRequest<T extends { type: string; request_id?: string }>(
  hold: Pick<UpdateHold, "admit">,
  handle: (message: T) => Promise<unknown>,
  refuse: (requestId: string) => void,
): (message: T) => void {
  return (message) => {
    if (!hold.admit(() => handle(message)) && message.request_id !== undefined) {
      refuse(message.request_id);
    }
  };
}
