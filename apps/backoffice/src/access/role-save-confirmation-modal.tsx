import { Button, Modal, plural } from "@purosur/ui";
import { ArrowLeft, Check, User, Users } from "lucide-react";
import type { AssignedUser } from "./roles-api";

type RoleSaveConfirmationModalProps = {
  open: boolean;
  roleName: string;
  assignedUsers: AssignedUser[];
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

export function RoleSaveConfirmationModal({
  open,
  roleName,
  assignedUsers,
  submitting,
  onBack,
  onConfirm,
}: RoleSaveConfirmationModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onBack();
        }
      }}
      width="confirmation"
      tone="info"
      icon={<Users />}
      headerLayout="centered"
      title="¿Guardar los cambios?"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            fullWidth
            disabled={submitting}
            onPress={onBack}
          >
            Volver
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting}
            onPress={onConfirm}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      <p className="text-center text-body text-text-subtle">
        {`${plural(assignedUsers.length, {
          one: "Se aplica a la 1 persona",
          other: `Se aplican a las ${assignedUsers.length} personas`,
        })} con el rol ${roleName}:`}
      </p>
      <div className="max-h-60 w-full shrink-0 overflow-y-auto rounded-lg border border-border text-left">
        {assignedUsers.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-2 border-border border-b px-4 py-2 last:border-b-0"
          >
            <User aria-hidden="true" className="size-icon-sm shrink-0 text-text-subtle" />
            <span>{user.name}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
