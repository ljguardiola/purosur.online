import { useNavigate } from "@tanstack/react-router";

export function useSendToMyAccount(): () => void {
  const navigate = useNavigate();
  return () => {
    void navigate({ to: "/settings/users/me", replace: true });
  };
}
