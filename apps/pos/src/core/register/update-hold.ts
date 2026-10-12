import type { UpdateSafeMomentAnswer } from "@purosur/contracts";
import { isSafeMomentToUpdate } from "@purosur/domain";

export interface UpdateHold {
  answerSafeMomentRequest(requestId: string): Promise<UpdateSafeMomentAnswer>;
  release(): void;
  isHeld(): boolean;
}

export function createUpdateHold(deps: {
  hasOpenSale: () => boolean | Promise<boolean>;
  schedule: (run: () => void, delayMs: number) => () => void;
  limitMs: number;
}): UpdateHold {
  let cancelRelease: (() => void) | undefined;

  function release(): void {
    cancelRelease?.();
    cancelRelease = undefined;
  }

  return {
    async answerSafeMomentRequest(requestId) {
      const safe = isSafeMomentToUpdate({ hasOpenSale: await deps.hasOpenSale() });
      if (safe) {
        cancelRelease?.();
        cancelRelease = deps.schedule(release, deps.limitMs);
      }
      return { type: "update-safe-moment", request_id: requestId, safe };
    },
    release,
    isHeld: () => cancelRelease !== undefined,
  };
}

export function gateRendererRequest<T>(
  hold: Pick<UpdateHold, "isHeld">,
  handle: (message: T) => void,
): (message: T) => void {
  return (message) => {
    if (!hold.isHeld()) {
      handle(message);
    }
  };
}
