import type { QuitRegisterMessage } from "@purosur/contracts";

export function isRegisterQuitMessage(message: unknown): message is QuitRegisterMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "quit-register"
  );
}

export function handleRegisterQuit(message: unknown, quit: () => void): void {
  if (isRegisterQuitMessage(message)) {
    quit();
  }
}
