import { Button, InlineNotice } from "@purosur/ui";
import { useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { ScreenLayout } from "./screen-layout";
import { focusScreenTitle, ScreenTitle } from "./screen-title";

export function ScreenFailure() {
  const router = useRouter();
  useEffect(() => {
    focusScreenTitle();
  }, []);
  const retry = async () => {
    await router.invalidate();
    focusScreenTitle();
  };
  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center border-line border-b bg-surface-white px-8">
          <ScreenTitle>No pudimos mostrar esta pantalla</ScreenTitle>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        detail="Probá de nuevo en unos minutos."
      />
      <Button variant="secondary" onPress={() => void retry()}>
        Reintentar
      </Button>
    </ScreenLayout>
  );
}
