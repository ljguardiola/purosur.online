import { Button, Modal } from "@purosur/ui";
import { LogOut, X } from "lucide-react";

export type SignOutModalProps = {
  open: boolean;
  firstName: string;
  onClose: () => void;
  onSignOut: () => void;
};

export function SignOutModal({ open, firstName, onClose, onSignOut }: SignOutModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      width="confirmation"
      tone="info"
      icon={<LogOut />}
      context={firstName}
      title="¿Salir de la caja?"
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} onPress={onClose}>
            Cancelar
          </Button>
          <Button size="large" icon={<LogOut />} fullWidth onPress={onSignOut}>
            Salir
          </Button>
        </>
      }
    />
  );
}
