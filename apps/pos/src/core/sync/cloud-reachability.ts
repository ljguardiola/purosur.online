import type { PushAttempt } from "./push-to-cloud";

export type CloudReachability = "unknown" | "reachable" | "unreachable";

export const INITIAL_CLOUD_REACHABILITY: CloudReachability = "unknown";

export function nextCloudReachability(
  previous: CloudReachability,
  attempt: PushAttempt,
): CloudReachability {
  switch (attempt.kind) {
    case "no_cloud":
    case "not_enrolled":
    case "no_local_database":
    case "no_app_version":
      return previous;
    case "failed":
      return attempt.failure.kind === "unreachable" ||
        (attempt.failure.kind === "refused" && attempt.failure.code === "server_unavailable")
        ? "unreachable"
        : "reachable";
    default:
      return "reachable";
  }
}
