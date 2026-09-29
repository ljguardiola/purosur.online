import { lazyRouteComponent } from "@tanstack/react-router";

export class ScreenDownloadFailure extends Error {
  readonly module: string;

  constructor(cause: unknown) {
    const module = cause instanceof Error ? cause.message : String(cause);
    super(`A screen's code could not be downloaded: ${module}`, { cause });
    this.name = "ScreenDownloadFailure";
    this.module = module;
  }
}

// The router reloads the page by itself when the error reads as a failed module download,
// wherever the network stands, so the failure is renamed to keep that decision in ScreenFailure.
export function lazyScreen<T extends Record<string, unknown>, TKey extends keyof T = "default">(
  importer: () => Promise<T>,
  exportName?: TKey,
) {
  return lazyRouteComponent(
    () =>
      importer().catch((cause: unknown) => {
        throw new ScreenDownloadFailure(cause);
      }),
    exportName,
  );
}
