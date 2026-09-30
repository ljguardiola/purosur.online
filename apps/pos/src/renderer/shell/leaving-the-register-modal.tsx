import { Button, Modal } from "@purosur/ui";
import { Lock, Pause } from "lucide-react";

export type LeavingTheRegisterModalProps = {
  open: boolean;
  registerName: string | null;
  onClose: () => void;
  onLock: () => void;
  onCloseRegister: () => void;
};

export function LeavingTheRegisterModal({
  open,
  registerName,
  onClose,
  onLock,
  onCloseRegister,
}: LeavingTheRegisterModalProps) {
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
      title="¿Cerrar la caja o dejarla bloqueada?"
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<Pause />} onPress={onLock}>
            Dejar bloqueada
          </Button>
          <Button size="large" icon={<Lock />} fullWidth onPress={onCloseRegister}>
            Cerrar caja
          </Button>
        </>
      }
    />
  );
}
