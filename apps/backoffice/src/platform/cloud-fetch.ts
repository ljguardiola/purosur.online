import { defaultReleaseMonitor, type ReleaseMonitor } from "./release-monitor";

const REFUSALS_UNRELATED_TO_THE_RELEASE = new Set([401, 403, 429]);

function refusedByTheRequest(response: Response): boolean {
  return (
    response.status >= 400 &&
    response.status < 500 &&
    !REFUSALS_UNRELATED_TO_THE_RELEASE.has(response.status)
  );
}

export function createCloudFetch(monitor: Pick<ReleaseMonitor, "check">): typeof fetch {
  return async (...request) => {
    const response = await fetch(...request);
    if (refusedByTheRequest(response)) {
      await monitor.check();
    }
    return response;
  };
}

export const cloudFetch = createCloudFetch(defaultReleaseMonitor);
