import { readUpdateSafeMomentAnswer } from "./register-update-messages";

export interface SafeMomentAsker {
  ask(): Promise<boolean>;
  handleCoreMessage(message: unknown): void;
}

export function createSafeMomentAsker(deps: {
  sendToCore(message: { type: "update-safe-moment-request"; request_id: string }): boolean;
  newRequestId(): string;
  startTimeout(run: () => void): void;
}): SafeMomentAsker {
  const pending = new Map<string, (safe: boolean) => void>();
  return {
    ask() {
      const requestId = deps.newRequestId();
      return new Promise<boolean>((resolve) => {
        pending.set(requestId, resolve);
        const answerNotSafe = (): void => {
          pending.delete(requestId);
          resolve(false);
        };
        if (!deps.sendToCore({ type: "update-safe-moment-request", request_id: requestId })) {
          answerNotSafe();
          return;
        }
        deps.startTimeout(answerNotSafe);
      });
    },
    handleCoreMessage(message) {
      const answer = readUpdateSafeMomentAnswer(message);
      if (answer === undefined) {
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
