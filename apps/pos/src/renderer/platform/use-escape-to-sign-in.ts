import { useNavigate } from "@tanstack/react-router";
import { useKeys } from "./key-layer";

export function useEscapeToSignIn(enabled = true) {
  const navigate = useNavigate();

  useKeys([{ key: "Escape", run: () => void navigate({ to: "/sign-in" }), enabled }]);
}
