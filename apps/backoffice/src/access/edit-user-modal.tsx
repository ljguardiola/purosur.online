import { userEditBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, TextField, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, RotateCcw, ShieldX, TriangleAlert, UserPen, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { roleDisplayName } from "../platform/role-display-name";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { UserRead } from "./access-queries";
import { userEmailMessage } from "./email-field-message";
import { roleOptions } from "./role-display";
import { roleFieldMessage } from "./role-field-message";
import type { BranchUser, BranchUserRole, EditUserOutcome, editUser } from "./users-api";

const EMAIL_MESSAGE = userEmailMessage(userEditBodySchema.shape.email);

export type EditUserModalServices = {
  editUser: typeof editUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type EditUserModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "lastAdministrator" };

type EditUserModalProps = {
  open: boolean;
  user: BranchUser;
  roles: BranchUserRole[];
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (userId: string) => Promise<CloudReadOutcome<UserRead>>;
  services: EditUserModalServices;
};

export function EditUserModal({
  open,
  user,
  roles,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  services,
}: EditUserModalProps) {
  const { editUser, fetchSessionAuthorizationOptions, authorizeSession, startAuthentication } =
    services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<EditUserModalNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { run, modal } = useAuthorization<EditUserOutcome>({
    actionName: "Editar un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: { email: user.email, roleId: user.role.id, version: user.version },
    request: {
      schema: userEditBodySchema,
      from: ({ email, roleId, version }) => ({
        email: email.trim(),
        role_id: roleId,
        version,
      }),
    },
    fields: { email: "email", role_id: "roleId", version: null },
    messages: { email: EMAIL_MESSAGE, roleId: roleFieldMessage },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const outcome = await run(() => editUser(user.id, request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        onSaved();
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "email_taken") {
        showFieldError("email", "Ya existe un usuario con este correo.");
        return;
      }
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        return;
      }
      if (outcome.kind === "last_administrator") {
        setNotice({ kind: "lastAdministrator" });
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  const showUser = useEffectEvent(() => {
    const { email, role, version } = user;
    reset({ email, roleId: role.id, version });
    setNotice(null);
    setReloading(false);
  });

  useEffect(() => {
    if (open) {
      showUser();
    }
  }, [open]);

  const roleSelectOptions = roles.length > 0 ? roleOptions(roles) : undefined;

  async function handleReload() {
    setReloading(true);
    const outcome = await reload(user.id);
    if (outcome.kind === "ok" && outcome.value.kind === "found") {
      const { email, role, version } = outcome.value.user;
      reset({ email, roleId: role.id, version });
      setNotice(null);
    }
    setReloading(false);
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<UserPen />}
        context="Configuración · Usuarios"
        title={user.firstName}
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              disabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              disabled={submitting || reloading}
              onPress={() => void submit()}
            >
              Guardar los cambios
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar el cambio"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este usuario cambió mientras lo editabas"
              description="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "lastAdministrator" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Ahora es el único Administrador activo"
              description="Recargá sus datos: para cambiarle el rol, primero hacé Administrador a otra persona."
            />
          )}
          {(notice?.kind === "staleVersion" || notice?.kind === "lastAdministrator") && (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              disabled={submitting || reloading}
              onPress={() => void handleReload()}
            >
              Recargar
            </Button>
          )}
          {user.isLastActiveAdministrator ? (
            <TextField
              kind="plain-text"
              label="Rol"
              value={roleDisplayName(user.role)}
              onChange={() => {}}
              readOnly
              readOnlyReason="Es el único Administrador activo. Para cambiarle el rol, primero hacé Administrador a otra persona."
            />
          ) : (
            roleSelectOptions && (
              <form.AppField name="roleId">
                {(field) => <field.Select label="Rol" options={roleSelectOptions} required />}
              </form.AppField>
            )
          )}
          <form.AppField name="email">
            {(field) => <field.TextField kind="plain-text" label="Correo" required />}
          </form.AppField>
        </div>
      </Modal>
      {modal}
    </>
  );
}
