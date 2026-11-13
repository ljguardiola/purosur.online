import { Button } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useKeys } from "../platform/key-layer";

export function BackToStartButton() {
  const navigate = useNavigate();
  const back = () => void navigate({ to: "/sign-in" });

  useKeys([{ key: "Enter", run: back }]);

  return (
    <Button fullWidth icon={<ArrowLeft />} iconPosition="start" keycap="Enter" onPress={back}>
      Volver al inicio
    </Button>
  );
}
