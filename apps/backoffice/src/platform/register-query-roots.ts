import { useQueryClient } from "@tanstack/react-query";

export const installationKey = ["installation"] as const;
export const registerKey = ["register"] as const;

const REGISTER_DATA_ROOTS: readonly unknown[] = [installationKey[0], registerKey[0]];

export function useRefreshRegisters(): () => Promise<void> {
  const client = useQueryClient();
  return () =>
    client.invalidateQueries({
      predicate: ({ queryKey }) => REGISTER_DATA_ROOTS.includes(queryKey[0]),
    });
}
