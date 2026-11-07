import type { CloudData } from "./use-cloud-query";

export function mapCloudData<T, U>(data: CloudData<T>, map: (value: T) => U): CloudData<U> {
  if (data.status === "loaded") {
    return { status: "loaded", value: map(data.value), refreshing: data.refreshing };
  }
  if (data.status === "loading") {
    return { status: "loading" };
  }
  return {
    status: "failed",
    retry: data.retry,
    ...(data.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: data.retryAfterSeconds }),
    ...(data.outdated ? { outdated: true as const } : {}),
  };
}
