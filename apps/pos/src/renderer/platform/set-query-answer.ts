import type { QueryClient, QueryKey } from "@tanstack/react-query";

// Cancelling comes first so that a read started before the answer cannot land after it and
// replace it with what the core knew earlier.
export function cancelReads(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  return queryClient.cancelQueries({ queryKey, exact: true });
}

export async function setQueryAnswer<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  answer: T,
): Promise<void> {
  await cancelReads(queryClient, queryKey);
  queryClient.setQueryData(queryKey, answer);
}
