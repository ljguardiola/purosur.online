import { userEditBodySchema } from "@purosur/contracts";
import {
  Button,
  EmptyState,
  IconButton,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  Tag,
  Tooltip,
} from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  KeyRound,
  Laptop,
  Lock,
  Pencil,
  RotateCcw,
  ShieldX,
  Trash2,
  TriangleAlert,
  UserCheck,
  UserPen,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useCloudForm } from "../platform/cloud-form";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { combineCloudData } from "../platform/combine-cloud-data";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { CloudData } from "../platform/use-cloud-query";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  type PasskeyList,
  type UserRead,
  useRefreshAccess,
  useReloadUser,
  useRolesQuery,
  useUserPasskeysQuery,
  useUserQuery,
} from "./access-queries";
import { useAuthorization } from "./authorization-modal";
import {
  type BackofficeAccess,
  canDeactivateUser,
  canReactivateUser,
  canSeeUsersArea,
} from "./backoffice-access";
import { userEmailMessage } from "./email-field-message";
import type { Passkey } from "./passkey-api";
import { passkeyRowDetail } from "./passkey-row-detail";
import { roleDisplayName, roleOptions } from "./role-display";
import { roleFieldMessage } from "./role-field-message";
import { useSendToMyAccount } from "./send-to-my-account";
import type { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";
import type { UserDetailScreenServices } from "./user-detail-services";
import type {
  BranchUser,
  BranchUserRole,
  DeactivateUserOutcome,
  deactivateUser,
  EditUserOutcome,
  editUser,
  ReactivateUserOutcome,
  RemoveUserPasskeyOutcome,
  reactivateUser,
  removeUserPasskey,
} from "./users-api";

export type UserDetailScreenProps = {
  userId: string;
  signedInUserId: string;
  access: BackofficeAccess;
  onSessionEnded: () => void;
  now?: () => Date;
  services: UserDetailScreenServices;
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
  editUser: typeof editUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

function EditUserModal({
  open,
  user,
  roles,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  editUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: EditUserModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<EditUserModalNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { run, modal } = useAuthorization<EditUserOutcome>({
    actionName: "Editar un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useCloudForm({
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
    messages: { email: userEmailMessage, roleId: roleFieldMessage },
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
  const userRef = useLatestRef(user);

  useEffect(() => {
    if (open) {
      const { email, role, version } = userRef.current;
      reset({ email, roleId: role.id, version });
      setNotice(null);
      setReloading(false);
    }
  }, [open, reset, userRef]);

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
            <div className="flex flex-col gap-1">
              <p className="font-bold text-text text-detail">Rol</p>
              <div className="flex h-control-2xl min-w-0 max-w-full items-center justify-between gap-2 rounded-lg border-2 border-border bg-surface-subtle px-3">
                <span className="min-w-0 flex-1 truncate text-left font-semibold text-body text-text">
                  {roleDisplayName(user.role)}
                </span>
                <Tooltip description="Es el único Administrador activo. Para cambiarle el rol, primero hacé Administrador a otra persona.">
                  <IconButton icon={<Lock />} aria-label="Por qué el rol está fijo" />
                </Tooltip>
              </div>
            </div>
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

type RemoveUserPasskeyModalProps = {
  target: Passkey | null;
  userId: string;
  userName: string;
  isOnlyPasskey: boolean;
  onClose: () => void;
  onRemoved: (passkeyId: string) => void;
  onSessionEnded: () => void;
  removeUserPasskey: typeof removeUserPasskey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

function RemoveUserPasskeyModal({
  target,
  userId,
  userName,
  isOnlyPasskey,
  onClose,
  onRemoved,
  onSessionEnded,
  removeUserPasskey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: RemoveUserPasskeyModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<RemoveUserPasskeyOutcome>({
    actionName: "Dar de baja una passkey",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (open) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!target) {
      return;
    }
    setAttemptFailed(false);
    setRateLimitedSeconds(null);
    setSubmitting(true);

    const outcome = await run(() => removeUserPasskey(userId, target.id));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok" || outcome.kind === "not_found") {
      onRemoved(target.id);
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
    if (outcome.kind === "rate_limited") {
      setRateLimitedSeconds(outcome.retryAfterSeconds);
      setSubmitting(false);
      return;
    }
    setAttemptFailed(true);
    setSubmitting(false);
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
        width="confirmation"
        tone="error"
        icon={<Trash2 />}
        title={`¿Dar de baja la passkey de ${userName}?`}
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
              destructive
              size="large"
              icon={<Trash2 />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Dar de baja
            </Button>
          </>
        }
      >
        {target ? (
          <div className="flex flex-col gap-4">
            <p className="text-body text-text">
              {`«${target.name}» deja de servir para entrar.`}
              {isOnlyPasskey
                ? ` Es su única passkey: para volver a entrar, ${userName} va a tener que pedir el enlace de recuperación por correo.`
                : ""}
            </p>
            {attemptFailed ? (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo dar de baja la passkey"
                description="Probá de nuevo."
              />
            ) : null}
            {rateLimitedSeconds !== null && (
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title="Demasiadas solicitudes"
                description={retryAfterDetail(rateLimitedSeconds)}
              />
            )}
          </div>
        ) : null}
      </Modal>
      {modal}
    </>
  );
}

type DeactivateUserModalProps = {
  open: boolean;
  user: BranchUser;
  onClose: () => void;
  onDeactivated: () => void;
  onVanished: () => void;
  onSessionEnded: () => void;
  deactivateUser: typeof deactivateUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

function DeactivateUserModal({
  open,
  user,
  onClose,
  onDeactivated,
  onVanished,
  onSessionEnded,
  deactivateUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: DeactivateUserModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<DeactivateUserOutcome>({
    actionName: "Desactivar un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (open) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    setAttemptFailed(false);
    setRateLimitedSeconds(null);
    setSubmitting(true);

    const outcome = await run(() => deactivateUser(user.id));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok") {
      onDeactivated();
      return;
    }
    if (outcome.kind === "not_found") {
      onVanished();
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
    if (outcome.kind === "rate_limited") {
      setRateLimitedSeconds(outcome.retryAfterSeconds);
      setSubmitting(false);
      return;
    }
    setAttemptFailed(true);
    setSubmitting(false);
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
        width="confirmation"
        tone="error"
        icon={<UserX />}
        title={`¿Desactivar a ${user.firstName}?`}
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
              destructive
              size="large"
              icon={<UserX />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Desactivar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-text">Se puede reactivar más adelante.</p>
          {attemptFailed ? (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo desactivar el usuario"
              description="Probá de nuevo."
            />
          ) : null}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(rateLimitedSeconds)}
            />
          )}
        </div>
      </Modal>
      {modal}
    </>
  );
}

type ReactivateUserModalProps = {
  open: boolean;
  user: BranchUser;
  onClose: () => void;
  onReactivated: () => void;
  onSessionEnded: () => void;
  reactivateUser: typeof reactivateUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

function ReactivateUserModal({
  open,
  user,
  onClose,
  onReactivated,
  onSessionEnded,
  reactivateUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: ReactivateUserModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<ReactivateUserOutcome>({
    actionName: "Reactivar un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (open) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    setAttemptFailed(false);
    setRateLimitedSeconds(null);
    setSubmitting(true);

    const outcome = await run(() => reactivateUser(user.id));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok" || outcome.kind === "not_found") {
      onReactivated();
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
    if (outcome.kind === "rate_limited") {
      setRateLimitedSeconds(outcome.retryAfterSeconds);
      setSubmitting(false);
      return;
    }
    setAttemptFailed(true);
    setSubmitting(false);
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
        width="confirmation"
        tone="info"
        icon={<RotateCcw />}
        headerLayout="centered"
        title={`¿Reactivar a ${user.firstName}?`}
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              fullWidth
              disabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Reactivar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-center text-body text-text-subtle">
            Vuelve a entrar a la caja y al backoffice con su mismo correo, rol y passkeys.
          </p>
          {attemptFailed ? (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo reactivar el usuario"
              description="Probá de nuevo."
            />
          ) : null}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(rateLimitedSeconds)}
            />
          )}
        </div>
      </Modal>
      {modal}
    </>
  );
}

const NO_ROLES: BranchUserRole[] = [];

export function UserDetailScreen(props: UserDetailScreenProps) {
  return props.access.isAdministrator ? (
    <AdministratorUserDetail {...props} />
  ) : (
    <ReaderUserDetail {...props} />
  );
}

function AdministratorUserDetail(props: UserDetailScreenProps) {
  const { userId, onSessionEnded, now } = props;
  const { fetchUser, fetchRoles, fetchUserPasskeys } = props.services;
  const data = combineCloudData(
    useUserQuery({ userId, fetchUser, onSessionEnded }),
    useRolesQuery({ fetchRoles, onSessionEnded }),
  );
  const passkeys = useUserPasskeysQuery({
    userId,
    fetchUserPasskeys,
    now: now ?? (() => new Date()),
    onSessionEnded,
  });
  const [userRead, roles] = data.status === "loaded" ? data.value : [undefined, NO_ROLES];
  return (
    <UserDetailView {...props} data={data} userRead={userRead} roles={roles} passkeys={passkeys} />
  );
}

function ReaderUserDetail(props: UserDetailScreenProps) {
  const { userId, onSessionEnded } = props;
  const data = useUserQuery({ userId, fetchUser: props.services.fetchUser, onSessionEnded });
  return (
    <UserDetailView
      {...props}
      data={data}
      userRead={data.status === "loaded" ? data.value : undefined}
      roles={NO_ROLES}
    />
  );
}

type UserDetailViewProps = UserDetailScreenProps & {
  data: CloudData<unknown>;
  userRead: UserRead | undefined;
  roles: BranchUserRole[];
  passkeys?: CloudData<PasskeyList>;
};

function UserDetailView({
  userId,
  signedInUserId,
  access,
  onSessionEnded,
  services,
  data,
  userRead,
  roles,
  passkeys,
}: UserDetailViewProps) {
  const navigate = useNavigate();
  const {
    fetchUser,
    editUser,
    removeUserPasskey,
    deactivateUser,
    reactivateUser,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const refreshAccess = useRefreshAccess();
  const reloadUser = useReloadUser({ fetchUser });
  const [removeTarget, setRemoveTarget] = useState<Passkey | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);

  const user = userRead?.kind === "found" ? userRead.user : undefined;
  const notFound = userRead?.kind === "not_found";

  useEffect(() => {
    if (!user) {
      setModalOpen(false);
    }
  }, [user]);

  const heading = user ? user.firstName : "Usuario";
  // The cloud accepts a user id in any letter case, so the URL's id may differ in case from the
  // session's own.
  const isOwnAccount = signedInUserId.toLowerCase() === userId.toLowerCase();
  const isInactive = user?.active === false;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Configuración · Usuarios</p>
              <div className="flex items-center gap-3">
                <ScreenTitle>{heading}</ScreenTitle>
                {isInactive ? <Tag tone="neutral">Inactivo</Tag> : null}
              </div>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {notFound ? (
          <>
            <InlineNotice tone="error" icon={<UserX />} title="No encontramos este usuario" />
            <Button variant="secondary" onPress={() => navigate({ to: "/settings/users" })}>
              Volver a Usuarios
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <h2 className="flex-1 text-subheading text-text-accent">Datos</h2>
                {access.isAdministrator && !isInactive && (
                  <Button
                    variant="secondary"
                    size="small"
                    icon={<Pencil />}
                    dataStatus={data.status}
                    onPress={() => setModalOpen(true)}
                  >
                    Editar
                  </Button>
                )}
              </div>
              {data.status === "loading" && <LoadingPlaceholder variant="form" fields={2} />}
              {data.status === "failed" && (
                <LoadFailure {...cloudLoadFailure(data, "este usuario")} />
              )}
              {user ? (
                <div className="flex gap-8">
                  <div className="flex flex-col gap-1">
                    <p className="font-bold text-text-subtle text-detail">Rol</p>
                    <p className="font-semibold text-body text-text">
                      {roleDisplayName(user.role)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-bold text-text-subtle text-detail">Correo</p>
                    <p className="font-semibold text-body text-text">{user.email}</p>
                  </div>
                </div>
              ) : null}
            </div>
            {passkeys ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <h2 className="flex-1 text-subheading text-text-accent">Passkeys</h2>
                </div>
                {passkeys.status === "loading" && <LoadingPlaceholder variant="list" items={2} />}
                {passkeys.status === "failed" && (
                  <LoadFailure {...cloudLoadFailure(passkeys, "las passkeys")} />
                )}
                {passkeys.status === "loaded" &&
                  (passkeys.value.passkeys.length === 0 ? (
                    <EmptyState
                      icon={<KeyRound />}
                      title="No tiene ninguna passkey registrada."
                      variant="blank"
                    />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {passkeys.value.passkeys.map((passkey) => (
                        <li key={passkey.id} className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="inline-flex size-icon-lg shrink-0 text-text-subtle"
                          >
                            <Laptop />
                          </span>
                          <div className="flex flex-1 flex-col gap-1">
                            <p className="font-semibold text-body text-text">{passkey.name}</p>
                            <p className="text-text-subtle text-detail">
                              {passkeyRowDetail(passkey, passkeys.value.loadedAt)}
                            </p>
                          </div>
                          {user && access.isAdministrator && !isOwnAccount && !isInactive && (
                            <IconButton
                              icon={<Trash2 />}
                              aria-label={`Dar de baja la passkey «${passkey.name}»`}
                              onPress={() => setRemoveTarget(passkey)}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
            ) : null}
            {!user && canSeeUsersArea(access) && !isOwnAccount && (
              <div className="flex items-center justify-end">
                <Button
                  variant="secondary"
                  size="small"
                  destructive
                  icon={<UserX />}
                  dataStatus={data.status}
                >
                  Desactivar
                </Button>
              </div>
            )}
            {user && !isInactive && canDeactivateUser(access, user.role) && !isOwnAccount && (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-text-subtle text-detail">
                  {`Al desactivar a ${user.firstName}, deja de poder entrar a la caja y al backoffice; su historial queda igual.`}
                </p>
                <Button
                  variant="secondary"
                  size="small"
                  destructive
                  icon={<UserX />}
                  dataStatus={data.status}
                  onPress={() => setDeactivateModalOpen(true)}
                >
                  {`Desactivar a ${user.firstName}`}
                </Button>
              </div>
            )}
            {user && isInactive && canReactivateUser(access) && (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-text-subtle text-detail">
                  {`Al reactivar a ${user.firstName}, vuelve a entrar a la caja y al backoffice con su misma cuenta: mismo correo, rol y passkeys.`}
                </p>
                <Button
                  variant="secondary"
                  size="small"
                  icon={<UserCheck />}
                  dataStatus={data.status}
                  onPress={() => setReactivateModalOpen(true)}
                >
                  {`Reactivar a ${user.firstName}`}
                </Button>
              </div>
            )}
          </>
        )}
      </ScreenLayout>
      {user ? (
        <RemoveUserPasskeyModal
          target={removeTarget}
          userId={userId}
          userName={user.firstName}
          isOnlyPasskey={passkeys?.status === "loaded" && passkeys.value.passkeys.length === 1}
          onClose={() => setRemoveTarget(null)}
          onRemoved={() => {
            setRemoveTarget(null);
            void refreshAccess();
          }}
          onSessionEnded={onSessionEnded}
          removeUserPasskey={removeUserPasskey}
          fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
          authorizeSession={authorizeSession}
          startAuthentication={startAuthentication}
        />
      ) : null}
      {user ? (
        <EditUserModal
          open={modalOpen}
          user={user}
          roles={roles}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void refreshAccess();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadUser}
          editUser={editUser}
          fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
          authorizeSession={authorizeSession}
          startAuthentication={startAuthentication}
        />
      ) : null}
      {user ? (
        <DeactivateUserModal
          open={deactivateModalOpen}
          user={user}
          onClose={() => setDeactivateModalOpen(false)}
          onDeactivated={() => {
            setDeactivateModalOpen(false);
            void refreshAccess();
            void navigate({ to: "/settings/users" });
          }}
          onVanished={() => {
            setDeactivateModalOpen(false);
            void refreshAccess();
          }}
          onSessionEnded={onSessionEnded}
          deactivateUser={deactivateUser}
          fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
          authorizeSession={authorizeSession}
          startAuthentication={startAuthentication}
        />
      ) : null}
      {user ? (
        <ReactivateUserModal
          open={reactivateModalOpen}
          user={user}
          onClose={() => setReactivateModalOpen(false)}
          onReactivated={() => {
            setReactivateModalOpen(false);
            void refreshAccess();
          }}
          onSessionEnded={onSessionEnded}
          reactivateUser={reactivateUser}
          fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
          authorizeSession={authorizeSession}
          startAuthentication={startAuthentication}
        />
      ) : null}
    </>
  );
}
