import { useNavigate } from "@tanstack/react-router";

export function useSendToMyAccount(): () => void {
  const navigate = useNavigate();
  return () => {
    void navigate({ to: "/account", replace: true });
  };
}
