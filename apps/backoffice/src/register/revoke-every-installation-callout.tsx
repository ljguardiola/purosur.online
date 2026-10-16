import { Button, HighlightedNotice } from "@purosur/ui";
import { ShieldAlert, ShieldOff } from "lucide-react";

export function RevokeEveryInstallationCallout({ onRevoke }: { onRevoke: () => void }) {
  return (
    <HighlightedNotice
      tone="error"
      icon={<ShieldAlert />}
      title="Ante una sospecha de compromiso"
      description="Revoca todas las instalaciones en el momento y cambia sus claves. Cada caja se vuelve a dar de alta con un código nuevo."
      actions={
        <Button variant="secondary" destructive icon={<ShieldOff />} onPress={onRevoke}>
          Revocar todas las instalaciones
        </Button>
      }
    />
  );
}
