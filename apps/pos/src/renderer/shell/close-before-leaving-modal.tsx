import { Button, Modal } from "@purosur/ui";
import { Lock, X } from "lucide-react";

export type CloseBeforeLeavingModalProps = {
  open: boolean;
  registerName: string | null;
  onClose: () => void;
  onCloseRegister: () => void;
};

export function CloseBeforeLeavingModal({
  open,
  registerName,
  onClose,
  onCloseRegister,
}: CloseBeforeLeavingModalProps) {
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
      icon={<Lock />}
      context={registerName === null ? "Sesión abierta" : `${registerName} · Sesión abierta`}
      title="Para salir, primero cerrá la caja"
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} onPress={onClose}>
            Cancelar
          </Button>
          <Button size="large" icon={<Lock />} fullWidth onPress={onCloseRegister}>
            Cerrar caja
          </Button>
        </>
      }
    />
  );
}
