import { Button, InlineNotice } from "@purosur/ui";
import { useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function ScreenFailure() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-4 p-6">
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        title="No pudimos mostrar esta pantalla"
        detail="Probá de nuevo en unos minutos."
      />
      <Button variant="secondary" onPress={() => void router.invalidate()}>
        Reintentar
      </Button>
    </div>
  );
}
