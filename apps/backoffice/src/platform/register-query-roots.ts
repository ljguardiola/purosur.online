import { useQueryClient } from "@tanstack/react-query";

const REGISTER_DATA_ROOTS: readonly unknown[] = ["installation", "register"];

export function useRefreshRegisters(): () => Promise<void> {
  const client = useQueryClient();
  return () =>
    client.invalidateQueries({
      predicate: ({ queryKey }) => REGISTER_DATA_ROOTS.includes(queryKey[0]),
    });
}
