export interface RendererPort {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  start(): void;
  close(): void;
  postMessage(message: unknown): void;
}

export type ReplyToRenderer = (message: unknown) => void;

export interface RendererConnection {
  adopt(port: RendererPort): void;
  tell(message: unknown): void;
}

// Main sends a fresh port on every page load and reload; only the latest one belongs to the live
// page, so the one it replaces is closed instead of lingering.
export function createRendererConnection(
  onMessage: (data: unknown, reply: ReplyToRenderer) => void,
): RendererConnection {
  let current: RendererPort | undefined;

  return {
    adopt(port) {
      current?.close();
      current = port;
      port.on("message", (event) => {
        if (port === current) {
          onMessage(event.data, (message) => {
            if (port === current) {
              port.postMessage(message);
            }
          });
        }
      });
      port.start();
    },
    tell(message) {
      current?.postMessage(message);
    },
  };
}
