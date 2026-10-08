import { commands } from "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    startRecordingRequests: () => Promise<void>;
    recordedRequests: () => Promise<string[]>;
    stopRecordingRequests: () => Promise<void>;
  }
}

export const startRecordingRequests = () => commands.startRecordingRequests();

export const stopRecordingRequests = () => commands.stopRecordingRequests();

export async function requested(module: string): Promise<boolean> {
  const urls = await commands.recordedRequests();
  return urls.some((url) => url.includes(module));
}
