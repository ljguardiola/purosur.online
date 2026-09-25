import { Button, IconButton, InlineNotice, Modal, Select, TextField, Tooltip } from "@purosur/ui";
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
  UserPen,
  UserX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthorization } from "./AuthorizationModal";
import { type BackofficeAccess, canDeactivateUser } from "./access";
import { validateEmail } from "./emailValidation";
import { messages } from "./messages";
import { roleDisplayName, roleOptions } from "./roleDisplay";
import { fetchRoles } from "./rolesApi";
import { navigate } from "./router";
import { ScreenLayout } from "./ScreenLayout";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { sendToMyAccount, USERS_LIST_PATH } from "./settingsRoutes";
import {
  type BranchUser,
  type BranchUserRole,
  type DeactivateUserOutcome,
  deactivateUser,
  type EditUserOutcome,
  editUser,
  fetchUser,
  fetchUserPasskeys,
  type RemoveUserPasskeyOutcome,
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
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

export type UserDetailScreenProps = {
  userId: string;
  /** From the session: hides this user's own remove buttons, which Mi cuenta manages instead. */
  signedInUserId: string;
  /** From the session: gates every action this screen offers by what the viewer actually holds. */
  access: BackofficeAccess;
  onSessionEnded: () => void;
  /** Injected in tests so "today" in a passkey's last-use detail is deterministic. */
  now?: () => Date;
  /** Injected in tests so this screen doesn't call the real API or WebAuthn. */
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

const usersMessages = messages.settings.users;
const detailMessages = usersMessages.detail;
const modalMessages = usersMessages.editUserModal;
// The row detail formatting, the section title and the remove button's aria-label are grammar-
// neutral ("Registrada el…", "Passkeys", "Dar de baja la passkey «X»"), so this screen reuses Mi
// cuenta's own passkeys copy instead of duplicating it for a third person.
const passkeysMessages = messages.settings.myAccount.passkeys;
const selfRemoveMessages = passkeysMessages.removeModal;
const removePasskeyModalMessages = usersMessages.removePasskeyModal;
const deactivateModalMessages = usersMessages.deactivateModal;

function passkeyRowDetail(passkey: UserPasskey, now: Date): string {
  return passkeysMessages.rowDetail({
    registeredOn: new Date(passkey.createdAt),
    ...(passkey.lastUsedAt ? { lastUsedAt: new Date(passkey.lastUsedAt) } : {}),
    now,
  });
}

const EMAIL_ERRORS = { required: modalMessages.emailRequired, invalid: modalMessages.emailInvalid };

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

/**
 * Changes one user's email and role together in a single save, confirming with the shared
 * passkey-authorization modal only when the cloud asks for it, and rejecting a save over a newer
 * version. The last active Administrator's Rol field is shown locked instead of offered, since
 * the server refuses that change regardless (see the `last_administrator` notice below, for the
 * race where the server still refuses after this screen loaded a stale, unlocked view).
 */
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
    action: "userEdit",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  // Read from refs, not reactive dependencies: the reset below must only run when the modal
  // opens, never again just because the parent re-rendered with a new `user` reference.
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (isOpen) {
      setEmail(userRef.current.email);
      setRoleId(userRef.current.role.id);
      setVersion(userRef.current.version);
      setEmailError(undefined);
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen]);

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
        setEmailError(modalMessages.emailInvalid);
      } else if (outcome.field === "roleId") {
        setNotice({ kind: "unknownRole" });
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "email_taken") {
      setEmailError(modalMessages.emailTaken);
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
        context={modalMessages.eyebrow}
        title={user.firstName}
        closable
        closeLabel={modalMessages.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              {modalMessages.cancel}
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleSubmit()}
            >
              {modalMessages.submit}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.attemptFailedTitle}
              detail={modalMessages.attemptFailedDetail}
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={usersMessages.rateLimitedTitle}
              detail={usersMessages.rateLimitedDetail({
                minutes: Math.ceil(notice.retryAfterSeconds / 60),
              })}
            />
          )}
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.staleVersionTitle}
              detail={modalMessages.staleVersionDetail}
            />
          )}
          {notice?.kind === "lastAdministrator" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.lastAdministratorTitle}
              detail={modalMessages.lastAdministratorDetail}
            />
          )}
          {notice?.kind === "unknownRole" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.unknownRoleTitle}
              detail={modalMessages.unknownRoleDetail}
            />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.reloadFailedTitle}
              detail={modalMessages.attemptFailedDetail}
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
              {modalMessages.reload}
            </Button>
          )}
          {user.isLastActiveAdministrator ? (
            <div className="flex flex-col gap-1">
              <p className="font-bold text-ink text-sm">{modalMessages.roleLabel}</p>
              <div className="flex h-12 min-w-0 max-w-full items-center justify-between gap-2 rounded-lg border-2 border-line bg-surface-bone px-3">
                <span className="min-w-0 flex-1 truncate text-left font-semibold text-base text-ink">
                  {roleDisplayName(user.role)}
                </span>
                <Tooltip description={modalMessages.lastAdministratorTooltip}>
                  <IconButton icon={<Lock />} aria-label={modalMessages.lockedRoleAria} />
                </Tooltip>
              </div>
            </div>
          ) : (
            roleSelectOptions && (
              <Select
                label={modalMessages.roleLabel}
                options={roleSelectOptions}
                value={roleId}
                onChange={setRoleId}
                required
              />
            )
          )}
          <TextField
            kind="plain-text"
            label={modalMessages.emailLabel}
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

/** Lets an Administrator remove another user's passkey, confirming with the shared passkey-authorization modal only when the cloud asks for it. */
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
    action: "passkeyRemoval",
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
    // A 404 means the passkey is already gone, which is exactly what removing it asked for.
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
        title={removePasskeyModalMessages.title({ name: userName })}
        closable
        closeLabel={selfRemoveMessages.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              {selfRemoveMessages.cancel}
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
              {selfRemoveMessages.confirm}
            </Button>
          </>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            <p className="text-base text-ink">
              {removePasskeyModalMessages.body({ passkeyName: target.name })}
              {isOnlyPasskey
                ? ` ${removePasskeyModalMessages.onlyPasskeyWarning({ name: userName })}`
                : ""}
            </p>
            {attemptFailed && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title={selfRemoveMessages.attemptFailedTitle}
                detail={selfRemoveMessages.attemptFailedDetail}
              />
            )}
            {rateLimitedSeconds !== null && (
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title={selfRemoveMessages.rateLimitedTitle}
                detail={selfRemoveMessages.rateLimitedDetail({
                  minutes: Math.ceil(rateLimitedSeconds / 60),
                })}
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

/** Confirms deactivating a user, confirming with the shared passkey-authorization modal only when the cloud asks for it. There is no reactivation, so this is a one-way action. */
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
    action: "userDeactivation",
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
    // A 404 means the target is already gone, inactive, or otherwise unreachable — the same vanished
    // target the rest of this screen shows its not-found state for.
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
        title={deactivateModalMessages.title({ name: user.firstName })}
        closable
        closeLabel={deactivateModalMessages.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              {deactivateModalMessages.cancel}
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
              {deactivateModalMessages.confirm}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-ink">{deactivateModalMessages.body}</p>
          {attemptFailed && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={deactivateModalMessages.attemptFailedTitle}
              detail={deactivateModalMessages.attemptFailedDetail}
            />
          )}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={usersMessages.rateLimitedTitle}
              detail={usersMessages.rateLimitedDetail({
                minutes: Math.ceil(rateLimitedSeconds / 60),
              })}
            />
          )}
        </div>
      </Modal>
      {modal}
    </>
  );
}

/**
 * "Ver un usuario": one branch user's Datos and Passkeys sections, with the passkey-confirmed email
 * edit, passkey removal, and deactivation. Every action here is gated by `access`: an Administrator
 * can do everything; a role delegated only `deactivate_users` can reach this screen but sees just
 * Datos and the Desactivar row (never against another Administrator, nor on their own account).
 * A `forbidden` read (a role change mid-session) sends the browser to Mi cuenta instead of showing
 * a notice.
 */
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
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the user and unmount
  // an open edit modal along with what was typed in it.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const endSession = useCallback(() => onSessionEndedRef.current(), []);

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

  // Passkey management and the Rol selector are both Administrator-only, and so is reading a
  // user's passkeys or the role catalog on the cloud; a non-Administrator viewer (only reachable
  // holding `deactivate_users`) never opens the edit modal, so it never needs the roles.
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

  const heading = state.kind === "loaded" ? state.user.firstName : detailMessages.heading;
  // The cloud accepts a user id in any letter case, so the id in the URL may differ in case
  // from the session's own.
  const isOwnAccount = signedInUserId.toLowerCase() === userId.toLowerCase();

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
            <div className="flex flex-col justify-center">
              <p className="text-ink-secondary text-sm">{detailMessages.breadcrumb}</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">{heading}</h1>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {state.kind === "loading" && <p role="status">{detailMessages.loading}</p>}
        {state.kind === "notFound" && (
          <>
            <InlineNotice tone="error" icon={<UserX />} title={detailMessages.notFoundTitle} />
            <Button variant="secondary" onPress={() => navigate(USERS_LIST_PATH)}>
              {detailMessages.backToList}
            </Button>
          </>
        )}
        {state.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={detailMessages.loadErrorTitle}
              detail={detailMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {usersMessages.retry}
            </Button>
          </>
        )}
        {state.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={usersMessages.rateLimitedTitle}
              detail={usersMessages.rateLimitedDetail({
                minutes: Math.ceil(state.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {usersMessages.retry}
            </Button>
          </>
        )}
        {state.kind === "loaded" && (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-white p-4">
            <div className="flex items-center gap-3">
              <h2 className="flex-1 font-bold text-lg text-brand-blue-strong">
                {detailMessages.datosHeading}
              </h2>
              {access.isAdministrator && (
                <Button
                  variant="secondary"
                  size="small"
                  icon={<Pencil />}
                  onPress={() => setModalOpen(true)}
                >
                  {detailMessages.editButton}
                </Button>
              )}
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col gap-1">
                <p className="font-bold text-ink-secondary text-sm">{detailMessages.roleLabel}</p>
                <p className="font-semibold text-base text-ink">
                  {roleDisplayName(state.user.role)}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-bold text-ink-secondary text-sm">{detailMessages.emailLabel}</p>
                <p className="font-semibold text-base text-ink">{state.user.email}</p>
              </div>
            </div>
          </div>
        )}
        {state.kind === "loaded" && showsPasskeys && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
            <div className="flex items-center gap-3">
              <h2 className="flex-1 font-bold text-lg text-brand-blue-strong">
                {passkeysMessages.title}
              </h2>
            </div>
            {passkeysState.kind === "loading" && (
              <p role="status">{detailMessages.passkeysLoading}</p>
            )}
            {passkeysState.kind === "loadError" && (
              <>
                <InlineNotice
                  tone="error"
                  icon={<TriangleAlert />}
                  title={detailMessages.passkeysLoadErrorTitle}
                  detail={detailMessages.passkeysLoadErrorDetail}
                />
                <Button variant="secondary" onPress={() => void loadPasskeys()}>
                  {usersMessages.retry}
                </Button>
              </>
            )}
            {passkeysState.kind === "rate_limited" && (
              <>
                <InlineNotice
                  tone="error"
                  icon={<ShieldX />}
                  title={usersMessages.rateLimitedTitle}
                  detail={usersMessages.rateLimitedDetail({
                    minutes: Math.ceil(passkeysState.retryAfterSeconds / 60),
                  })}
                />
                <Button variant="secondary" onPress={() => void loadPasskeys()}>
                  {usersMessages.retry}
                </Button>
              </>
            )}
            {passkeysState.kind === "loaded" &&
              (passkeysState.passkeys.length === 0 ? (
                <p className="text-ink-secondary text-sm">{detailMessages.passkeysEmpty}</p>
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
                      {access.isAdministrator && !isOwnAccount && (
                        <IconButton
                          icon={<Trash2 />}
                          aria-label={passkeysMessages.remove({ name: passkey.name })}
                          onPress={() => setRemoveTarget(passkey)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}
        {state.kind === "loaded" && canDeactivateUser(access, state.user.role) && !isOwnAccount && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-ink-secondary text-sm">
              {detailMessages.deactivateHelp({ name: state.user.firstName })}
            </p>
            <Button
              variant="secondary"
              size="small"
              tone="destructive"
              icon={<UserX />}
              onPress={() => setDeactivateModalOpen(true)}
            >
              {detailMessages.deactivateButton({ name: state.user.firstName })}
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
    </>
  );
}
