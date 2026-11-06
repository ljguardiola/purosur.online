import { Button, HighlightedNotice } from "@purosur/ui";
import { getRouteApi } from "@tanstack/react-router";
import { LogOut, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { EndEverySessionModal } from "./end-every-session-modal";
import { defaultEndEverySessionSectionServices } from "./end-every-session-section-services";

const route = getRouteApi("/signed-in");

export type EndEverySessionSectionProps = {
  onSessionEnded: () => void;
};

export function EndEverySessionSection({ onSessionEnded }: EndEverySessionSectionProps) {
  const { services } = route.useRouteContext();
  const sectionServices = services.endEverySessionSection ?? defaultEndEverySessionSectionServices;
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <HighlightedNotice
        tone="error"
        icon={<ShieldAlert />}
        title="Cerrar todas las sesiones del backoffice"
        description="Cada persona vuelve a entrar con su passkey."
        actions={
          <Button
            variant="primary"
            destructive
            icon={<LogOut />}
            onPress={() => setModalOpen(true)}
          >
            Cerrar todas las sesiones
          </Button>
        }
      />
      <EndEverySessionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSessionEnded={onSessionEnded}
        services={sectionServices}
      />
    </>
  );
}
