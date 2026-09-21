export interface RendererPort {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  start(): void;
  close(): void;
}

export interface RendererConnection {
  adopt(port: RendererPort): void;
}

// Main sends a fresh port on every page load and reload; only the latest one belongs to the live
// page, so the one it replaces is closed instead of lingering.
export function createRendererConnection(onMessage: (data: unknown) => void): RendererConnection {
  let current: RendererPort | undefined;

  return {
    adopt(port) {
      current?.close();
      current = port;
      port.on("message", (event) => {
        if (port === current) {
          onMessage(event.data);
        }
      });
      port.start();
    },
  };
}
