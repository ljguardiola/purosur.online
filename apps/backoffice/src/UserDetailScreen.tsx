import {
  Button,
  IconButton,
  InlineNotice,
  Modal,
  Select,
  Tag,
  TextField,
  Tooltip,
} from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  Check,
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
import { useCallback, useEffect, useState } from "react";
import { useAuthorization } from "./AuthorizationModal";
import { type BackofficeAccess, canDeactivateUser, canReactivateUser } from "./access";
import { validateEmail } from "./emailValidation";
import { passkeyRowDetail } from "./passkeyRowDetail";
import { retryAfterDetail } from "./retryAfterDetail";
import { roleDisplayName, roleOptions } from "./roleDisplay";
import { fetchRoles } from "./rolesApi";
import { navigate } from "./router";
import { ScreenLayout } from "./ScreenLayout";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { sendToMyAccount, USERS_LIST_PATH } from "./settingsRoutes";
import { useLatestRef } from "./useLatestRef";
import {
  type BranchUser,
  type BranchUserRole,
  type DeactivateUserOutcome,
  deactivateUser,
  type EditUserOutcome,
  editUser,
  fetchUser,
  fetchUserPasskeys,
  type ReactivateUserOutcome,
  type RemoveUserPasskeyOutcome,
  reactivateUser,
  removeUserPasskey,
  type UserPasskey,
} from "./usersApi";

export type UserDetailScreenServices = {
  fetchUser: typeof fetchUser;
  editUser: typeof editUser;
  fetchRoles: typeof fetchRoles;
  fetchUserPasskeys: typeof fetchUserPasskeys;
  removeUserPasskey: typeof removeUserPasskey;
  deactivateUser: typeof deactivateUser;
  reactivateUser: typeof reactivateUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultUserDetailScreenServices: UserDetailScreenServices = {
  fetchUser,
  editUser,
  fetchRoles,
  fetchUserPasskeys,
  removeUserPasskey,
  deactivateUser,
  reactivateUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

export type UserDetailScreenProps = {
  userId: string;
  signedInUserId: string;
  access: BackofficeAccess;
  onSessionEnded: () => void;
  now?: () => Date;
  services?: UserDetailScreenServices;
};

type DetailState =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; user: BranchUser; roles: BranchUserRole[] };

type PasskeysState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; passkeys: UserPasskey[] };

const EMAIL_REQUIRED = "Ingresá el correo.";
const EMAIL_INVALID = "Ingresá un correo válido.";

const EMAIL_ERRORS = { required: EMAIL_REQUIRED, invalid: EMAIL_INVALID };

type EditUserModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number; offersReload: boolean }
  | { kind: "staleVersion" }
  | { kind: "lastAdministrator" }
  | { kind: "unknownRole" }
  | { kind: "reloadFailed" };

type EditUserModalProps = {
  isOpen: boolean;
  user: BranchUser;
  roles: BranchUserRole[];
  onClose: () => void;
  onSaved: (user: BranchUser) => void;
  onReloaded: (user: BranchUser) => void;
  onReloadRejected: (state: "notFound") => void;
  onSessionEnded: () => void;
  fetchUser: typeof fetchUser;
  editUser: typeof editUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

function EditUserModal({
  isOpen,
  user,
  roles,
  onClose,
  onSaved,
  onReloaded,
  onReloadRejected,
  onSessionEnded,
  fetchUser,
  editUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: EditUserModalProps) {
  const [email, setEmail] = useState(user.email);
  const [roleId, setRoleId] = useState(user.role.id);
  const [version, setVersion] = useState(user.version);
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<EditUserModalNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<EditUserOutcome>({
    actionName: "Editar un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const userRef = useLatestRef(user);

  useEffect(() => {
    if (isOpen) {
      setEmail(userRef.current.email);
      setRoleId(userRef.current.role.id);
      setVersion(userRef.current.version);
      setEmailError(undefined);
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen, userRef]);

  const roleSelectOptions = roles.length > 0 ? roleOptions(roles) : undefined;

  async function handleSubmit() {
    const validationError = validateEmail(email, EMAIL_ERRORS);
    setEmailError(validationError);
    if (validationError) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const outcome = await run(() => editUser(user.id, { email: email.trim(), roleId, version }));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok") {
      onSaved(outcome.value);
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
    if (outcome.kind === "validation_failed") {
      if (outcome.field === "email") {
        setEmailError(EMAIL_INVALID);
      } else if (outcome.field === "roleId") {
        setNotice({ kind: "unknownRole" });
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "email_taken") {
      setEmailError("Ya existe un usuario con este correo.");
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "last_administrator") {
      setNotice({ kind: "lastAdministrator" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: outcome.retryAfterSeconds,
        offersReload: false,
      });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  async function handleReload() {
    setSubmitting(true);
    const outcome = await fetchUser(user.id);
    if (outcome.kind === "ok") {
      setEmail(outcome.value.email);
      setRoleId(outcome.value.role.id);
      setVersion(outcome.value.version);
      setNotice(null);
      setSubmitting(false);
      onReloaded(outcome.value);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "not_found") {
      onReloadRejected("notFound");
      return;
    }
    if (outcome.kind === "forbidden") {
      onClose();
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: outcome.retryAfterSeconds,
        offersReload: true,
      });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setSubmitting(false);
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
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
              isDisabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleSubmit()}
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
              detail="Probá de nuevo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              detail={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este usuario cambió mientras lo editabas"
              detail="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "lastAdministrator" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Ahora es el único Administrador activo"
              detail="Recargá sus datos: para cambiarle el rol, primero hacé Administrador a otra persona."
            />
          )}
          {notice?.kind === "unknownRole" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Ese rol ya no está disponible"
              detail="Cerrá esta ventana y volvé a intentarlo."
            />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron recargar los datos"
              detail="Probá de nuevo."
            />
          )}
          {(notice?.kind === "staleVersion" ||
            notice?.kind === "lastAdministrator" ||
            notice?.kind === "reloadFailed" ||
            (notice?.kind === "rateLimited" && notice.offersReload)) && (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              isDisabled={submitting}
              onPress={() => void handleReload()}
            >
              Recargar
            </Button>
          )}
          {user.isLastActiveAdministrator ? (
            <div className="flex flex-col gap-1">
              <p className="font-bold text-ink text-sm">Rol</p>
              <div className="flex h-12 min-w-0 max-w-full items-center justify-between gap-2 rounded-lg border-2 border-line bg-surface-bone px-3">
                <span className="min-w-0 flex-1 truncate text-left font-semibold text-base text-ink">
                  {roleDisplayName(user.role)}
                </span>
                <Tooltip description="Es el único Administrador activo. Para cambiarle el rol, primero hacé Administrador a otra persona.">
                  <IconButton icon={<Lock />} aria-label="Por qué el rol está fijo" />
                </Tooltip>
              </div>
            </div>
          ) : (
            roleSelectOptions && (
              <Select
                label="Rol"
                options={roleSelectOptions}
                value={roleId}
                onChange={setRoleId}
                required
              />
            )
          )}
          <TextField
            kind="plain-text"
            label="Correo"
            value={email}
            onChange={(value) => {
              setEmail(value);
              if (emailError) {
                setEmailError(validateEmail(value, EMAIL_ERRORS));
              }
            }}
            required
            {...(emailError ? { invalid: true, errorMessage: emailError } : {})}
          />
        </div>
      </Modal>
      {modal}
    </>
  );
}

type RemoveUserPasskeyModalProps = {
  target: UserPasskey | null;
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
  const isOpen = target !== null;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<RemoveUserPasskeyOutcome>({
    actionName: "Dar de baja una passkey",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (isOpen) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [isOpen]);

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
        isOpen={isOpen}
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
              isDisabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              tone="destructive"
              size="large"
              icon={<Trash2 />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Dar de baja
            </Button>
          </>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            <p className="text-base text-ink">
              {`«${target.name}» deja de servir para entrar.`}
              {isOnlyPasskey
                ? ` Es su única passkey: para volver a entrar, ${userName} va a tener que pedir el enlace de recuperación por correo.`
                : ""}
            </p>
            {attemptFailed && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo dar de baja la passkey"
                detail="Probá de nuevo."
              />
            )}
            {rateLimitedSeconds !== null && (
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title="Demasiadas solicitudes"
                detail={retryAfterDetail(rateLimitedSeconds)}
              />
            )}
          </div>
        )}
      </Modal>
      {modal}
    </>
  );
}

type DeactivateUserModalProps = {
  isOpen: boolean;
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
  isOpen,
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
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<DeactivateUserOutcome>({
    actionName: "Desactivar un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (isOpen) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [isOpen]);

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
        isOpen={isOpen}
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
              isDisabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              tone="destructive"
              size="large"
              icon={<UserX />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Desactivar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-ink">
            Deja de poder entrar a la caja y al backoffice. Un Administrador puede reactivar su
            cuenta más adelante.
          </p>
          {attemptFailed && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo desactivar el usuario"
              detail="Probá de nuevo."
            />
          )}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              detail={retryAfterDetail(rateLimitedSeconds)}
            />
          )}
        </div>
      </Modal>
      {modal}
    </>
  );
}

type ReactivateUserModalProps = {
  isOpen: boolean;
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
  isOpen,
  user,
  onClose,
  onReactivated,
  onSessionEnded,
  reactivateUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: ReactivateUserModalProps) {
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<ReactivateUserOutcome>({
    actionName: "Reactivar un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (isOpen) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [isOpen]);

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
        isOpen={isOpen}
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
              isDisabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Reactivar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-center text-base text-ink-secondary">
            Vuelve a entrar a la caja y al backoffice con su mismo correo, rol y passkeys.
          </p>
          {attemptFailed && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo reactivar el usuario"
              detail="Probá de nuevo."
            />
          )}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              detail={retryAfterDetail(rateLimitedSeconds)}
            />
          )}
        </div>
      </Modal>
      {modal}
    </>
  );
}

export function UserDetailScreen({
  userId,
  signedInUserId,
  access,
  onSessionEnded,
  now,
  services,
}: UserDetailScreenProps) {
  const {
    fetchUser,
    editUser,
    fetchRoles,
    fetchUserPasskeys,
    removeUserPasskey,
    deactivateUser,
    reactivateUser,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services ?? defaultUserDetailScreenServices;
  const clock = now ?? (() => new Date());
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [passkeysState, setPasskeysState] = useState<PasskeysState>({ kind: "loading" });
  const [removeTarget, setRemoveTarget] = useState<UserPasskey | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const endSession = useCallback(() => onSessionEndedRef.current(), [onSessionEndedRef]);

  const loadPasskeys = useCallback(async () => {
    setPasskeysState({ kind: "loading" });
    const outcome = await fetchUserPasskeys(userId);
    if (outcome.kind === "ok") {
      setPasskeysState({ kind: "loaded", passkeys: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "rate_limited") {
      setPasskeysState({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setPasskeysState({ kind: "loadError" });
    }
  }, [userId, endSession, fetchUserPasskeys]);

  const showsPasskeys = access.isAdministrator;
  const needsRoles = access.isAdministrator;
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const noRolesNeeded: Awaited<ReturnType<typeof fetchRoles>> = { kind: "ok", value: [] };
    const [userOutcome, rolesOutcome] = await Promise.all([
      fetchUser(userId),
      needsRoles ? fetchRoles() : Promise.resolve(noRolesNeeded),
    ]);
    if (userOutcome.kind === "unauthenticated" || rolesOutcome.kind === "unauthenticated") {
      endSession();
      return;
    }
    if (userOutcome.kind === "not_found") {
      setState({ kind: "notFound" });
      return;
    }
    const rateLimited = [userOutcome, rolesOutcome].flatMap((outcome) =>
      outcome.kind === "rate_limited" ? [outcome.retryAfterSeconds] : [],
    );
    if (rateLimited.length > 0) {
      setState({ kind: "rate_limited", retryAfterSeconds: Math.max(...rateLimited) });
      return;
    }
    if (userOutcome.kind === "forbidden" || rolesOutcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (userOutcome.kind === "ok" && rolesOutcome.kind === "ok") {
      setState({ kind: "loaded", user: userOutcome.value, roles: rolesOutcome.value });
      if (showsPasskeys) {
        void loadPasskeys();
      }
      return;
    }
    setState({ kind: "loadError" });
  }, [userId, endSession, fetchUser, fetchRoles, needsRoles, loadPasskeys, showsPasskeys]);

  useEffect(() => {
    void load();
  }, [load]);

  const heading = state.kind === "loaded" ? state.user.firstName : "Usuario";
  // The cloud accepts a user id in any letter case, so the URL's id may differ in case from the
  // session's own.
  const isOwnAccount = signedInUserId.toLowerCase() === userId.toLowerCase();
  const isInactive = state.kind === "loaded" && state.user.active === false;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
            <div className="flex flex-col justify-center">
              <p className="text-ink-secondary text-sm">Configuración · Usuarios</p>
              <div className="flex items-center gap-3">
                <h1 className="font-bold text-2xl text-brand-blue-strong">{heading}</h1>
                {isInactive && <Tag tone="neutral">Inactivo</Tag>}
              </div>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {state.kind === "loading" && <p role="status">Cargando…</p>}
        {state.kind === "notFound" && (
          <>
            <InlineNotice tone="error" icon={<UserX />} title="No encontramos este usuario" />
            <Button variant="secondary" onPress={() => navigate(USERS_LIST_PATH)}>
              Volver a Usuarios
            </Button>
          </>
        )}
        {state.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No pudimos abrir este usuario"
              detail="Probá de nuevo en unos minutos."
            />
            <Button variant="secondary" onPress={() => void load()}>
              Reintentar
            </Button>
          </>
        )}
        {state.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              detail={retryAfterDetail(state.retryAfterSeconds)}
            />
            <Button variant="secondary" onPress={() => void load()}>
              Reintentar
            </Button>
          </>
        )}
        {state.kind === "loaded" && (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-white p-4">
            <div className="flex items-center gap-3">
              <h2 className="flex-1 font-bold text-lg text-brand-blue-strong">Datos</h2>
              {access.isAdministrator && !isInactive && (
                <Button
                  variant="secondary"
                  size="small"
                  icon={<Pencil />}
                  onPress={() => setModalOpen(true)}
                >
                  Editar
                </Button>
              )}
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col gap-1">
                <p className="font-bold text-ink-secondary text-sm">Rol</p>
                <p className="font-semibold text-base text-ink">
                  {roleDisplayName(state.user.role)}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-bold text-ink-secondary text-sm">Correo</p>
                <p className="font-semibold text-base text-ink">{state.user.email}</p>
              </div>
            </div>
          </div>
        )}
        {state.kind === "loaded" && showsPasskeys && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
            <div className="flex items-center gap-3">
              <h2 className="flex-1 font-bold text-lg text-brand-blue-strong">Passkeys</h2>
            </div>
            {passkeysState.kind === "loading" && <p role="status">Cargando las passkeys…</p>}
            {passkeysState.kind === "loadError" && (
              <>
                <InlineNotice
                  tone="error"
                  icon={<TriangleAlert />}
                  title="No pudimos abrir las passkeys"
                  detail="Probá de nuevo en unos minutos."
                />
                <Button variant="secondary" onPress={() => void loadPasskeys()}>
                  Reintentar
                </Button>
              </>
            )}
            {passkeysState.kind === "rate_limited" && (
              <>
                <InlineNotice
                  tone="error"
                  icon={<ShieldX />}
                  title="Demasiadas solicitudes"
                  detail={retryAfterDetail(passkeysState.retryAfterSeconds)}
                />
                <Button variant="secondary" onPress={() => void loadPasskeys()}>
                  Reintentar
                </Button>
              </>
            )}
            {passkeysState.kind === "loaded" &&
              (passkeysState.passkeys.length === 0 ? (
                <p className="text-ink-secondary text-sm">No tiene ninguna passkey registrada.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {passkeysState.passkeys.map((passkey) => (
                    <li key={passkey.id} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex size-5 shrink-0 text-ink-secondary"
                      >
                        <Laptop />
                      </span>
                      <div className="flex flex-1 flex-col gap-1">
                        <p className="font-semibold text-base text-ink">{passkey.name}</p>
                        <p className="text-ink-secondary text-sm">
                          {passkeyRowDetail(passkey, clock())}
                        </p>
                      </div>
                      {access.isAdministrator && !isOwnAccount && !isInactive && (
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
        )}
        {state.kind === "loaded" &&
          !isInactive &&
          canDeactivateUser(access, state.user.role) &&
          !isOwnAccount && (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-ink-secondary text-sm">
                {`Al desactivar a ${state.user.firstName}, deja de poder entrar a la caja y al backoffice; su historial queda igual.`}
              </p>
              <Button
                variant="secondary"
                size="small"
                tone="destructive"
                icon={<UserX />}
                onPress={() => setDeactivateModalOpen(true)}
              >
                {`Desactivar a ${state.user.firstName}`}
              </Button>
            </div>
          )}
        {state.kind === "loaded" && isInactive && canReactivateUser(access) && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-ink-secondary text-sm">
              {`Al reactivar a ${state.user.firstName}, vuelve a entrar a la caja y al backoffice con su misma cuenta: mismo correo, rol y passkeys.`}
            </p>
            <Button
              variant="secondary"
              size="small"
              icon={<UserCheck />}
              onPress={() => setReactivateModalOpen(true)}
            >
              {`Reactivar a ${state.user.firstName}`}
            </Button>
          </div>
        )}
      </ScreenLayout>
      {state.kind === "loaded" && (
        <RemoveUserPasskeyModal
          target={removeTarget}
          userId={userId}
          userName={state.user.firstName}
          isOnlyPasskey={passkeysState.kind === "loaded" && passkeysState.passkeys.length === 1}
          onClose={() => setRemoveTarget(null)}
          onRemoved={(passkeyId) => {
            setRemoveTarget(null);
            setPasskeysState((current) =>
              current.kind === "loaded"
                ? { kind: "loaded", passkeys: current.passkeys.filter((p) => p.id !== passkeyId) }
                : current,
            );
          }}
          onSessionEnded={endSession}
          removeUserPasskey={removeUserPasskey}
          fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
          authorizeSession={authorizeSession}
          startAuthentication={startAuthentication}
        />
      )}
      {state.kind === "loaded" && (
        <EditUserModal
          isOpen={modalOpen}
          user={state.user}
          roles={state.roles}
          onClose={() => setModalOpen(false)}
          onSaved={(user) => {
            setState({ kind: "loaded", user, roles: state.roles });
            setModalOpen(false);
          }}
          onReloaded={(user) => setState({ kind: "loaded", user, roles: state.roles })}
          onReloadRejected={(kind) => {
            setState({ kind });
            setModalOpen(false);
          }}
          onSessionEnded={endSession}
          fetchUser={fetchUser}
          editUser={editUser}
          fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
          authorizeSession={authorizeSession}
          startAuthentication={startAuthentication}
        />
      )}
      {state.kind === "loaded" && (
        <DeactivateUserModal
          isOpen={deactivateModalOpen}
          user={state.user}
          onClose={() => setDeactivateModalOpen(false)}
          onDeactivated={() => {
            setDeactivateModalOpen(false);
            navigate(USERS_LIST_PATH);
          }}
          onVanished={() => {
            setDeactivateModalOpen(false);
            setState({ kind: "notFound" });
          }}
          onSessionEnded={endSession}
          deactivateUser={deactivateUser}
          fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
          authorizeSession={authorizeSession}
          startAuthentication={startAuthentication}
        />
      )}
      {state.kind === "loaded" && (
        <ReactivateUserModal
          isOpen={reactivateModalOpen}
          user={state.user}
          onClose={() => setReactivateModalOpen(false)}
          onReactivated={() => {
            setReactivateModalOpen(false);
            void load();
          }}
          onSessionEnded={endSession}
          reactivateUser={reactivateUser}
          fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
          authorizeSession={authorizeSession}
          startAuthentication={startAuthentication}
        />
      )}
    </>
  );
}
