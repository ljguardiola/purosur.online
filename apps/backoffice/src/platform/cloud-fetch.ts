import { defaultReleaseMonitor, type ReleaseMonitor } from "./release-monitor";

export function createCloudFetch(monitor: Pick<ReleaseMonitor, "observe">): typeof fetch {
  return async (...request) => {
    const response = await fetch(...request);
    const deployed = response.headers.get("X-Purosur-Release");
    if (deployed !== null) {
      monitor.observe(deployed);
    }
    return response;
  };
}

export const cloudFetch = createCloudFetch(defaultReleaseMonitor);
