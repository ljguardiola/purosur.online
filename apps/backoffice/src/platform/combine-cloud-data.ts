import type { CloudData } from "./use-cloud-query";

export function combineCloudData<A, B>(a: CloudData<A>, b: CloudData<B>): CloudData<[A, B]> {
  if (a.status === "loading" || b.status === "loading") {
    return { status: "loading" };
  }
  if (a.status === "failed" || b.status === "failed") {
    const failures = [a, b].filter((part) => part.status === "failed");
    const waits = failures.flatMap((failure) =>
      failure.retryAfterSeconds === undefined ? [] : [failure.retryAfterSeconds],
    );
    return {
      status: "failed",
      ...(waits.length > 0 ? { retryAfterSeconds: Math.max(...waits) } : {}),
      retry: () => {
        for (const failure of failures) {
          failure.retry();
        }
      },
    };
  }
  return {
    status: "loaded",
    value: [a.value, b.value],
    refreshing: a.refreshing || b.refreshing,
  };
}
