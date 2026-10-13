import { readUpdateSafeMomentAnswer } from "./register-update-messages";

export interface SafeMomentAsker {
  ask(): Promise<boolean>;
  handleCoreMessage(message: unknown): void;
}

export function createSafeMomentAsker(deps: {
  sendToCore(
    message:
      | { type: "update-safe-moment-request"; request_id: string }
      | { type: "update-hold-release" },
  ): boolean;
  newRequestId(): string;
  startTimeout(run: () => void): void;
}): SafeMomentAsker {
  const pending = new Map<string, (safe: boolean) => void>();
  const abandoned = new Set<string>();
  return {
    ask() {
      const requestId = deps.newRequestId();
      return new Promise<boolean>((resolve) => {
        pending.set(requestId, resolve);
        if (!deps.sendToCore({ type: "update-safe-moment-request", request_id: requestId })) {
          pending.delete(requestId);
          resolve(false);
          return;
        }
        deps.startTimeout(() => {
          if (pending.delete(requestId)) {
            abandoned.add(requestId);
            deps.sendToCore({ type: "update-hold-release" });
            resolve(false);
          }
        });
      });
    },
    handleCoreMessage(message) {
      const answer = readUpdateSafeMomentAnswer(message);
      if (answer === undefined) {
        return;
      }
      if (abandoned.delete(answer.request_id)) {
        if (answer.safe) {
          deps.sendToCore({ type: "update-hold-release" });
        }
        return;
      }
      const resolve = pending.get(answer.request_id);
      if (resolve !== undefined) {
        pending.delete(answer.request_id);
        resolve(answer.safe);
      }
    },
  };
}
