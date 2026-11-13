import { useNavigate } from "@tanstack/react-router";

export function useSendToOwnAccount(): () => void {
  const navigate = useNavigate();
  return () => {
    void navigate({ to: "/", search: { account: "credentials" }, replace: true });
  };
}
