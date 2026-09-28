import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function useSendToMyAccount(): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    void navigate({ to: "/settings/users/me", replace: true });
  }, [navigate]);
}
