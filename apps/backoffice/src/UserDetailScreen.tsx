import { Button, IconButton, InlineNotice, Modal, TextField } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  Check,
  KeyRound,
  Laptop,
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
import { validateEmail } from "./emailValidation";
import { messages } from "./messages";
import { navigate } from "./router";
import { sendToMyAccount, USERS_LIST_PATH } from "./settingsRoutes";
import {
  type BranchUser,
  type BranchUserRole,
  changeUserEmail,
  fetchEmailChangeChallenge,
  fetchUser,
  fetchUserPasskeyRemovalChallenge,
  fetchUserPasskeys,
  removeUserPasskey,
  type UserPasskey,
} from "./usersApi";

export type UserDetailScreenServices = {
  fetchUser: typeof fetchUser;
  fetchEmailChangeChallenge: typeof fetchEmailChangeChallenge;
  changeUserEmail: typeof changeUserEmail;
  fetchUserPasskeys: typeof fetchUserPasskeys;
  fetchUserPasskeyRemovalChallenge: typeof fetchUserPasskeyRemovalChallenge;
  removeUserPasskey: typeof removeUserPasskey;
  startAuthentication: typeof startAuthentication;
};

export const defaultUserDetailScreenServices: UserDetailScreenServices = {
  fetchUser,
  fetchEmailChangeChallenge,
  changeUserEmail,
  fetchUserPasskeys,
  fetchUserPasskeyRemovalChallenge,
  removeUserPasskey,
  startAuthentication,
};

export type UserDetailScreenProps = {
  userId: string;
  /** From the session: hides this user's own remove buttons, which Mi cuenta manages instead. */
  signedInUserId: string;
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
  | { kind: "loaded"; user: BranchUser };

type PasskeysState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; passkeys: UserPasskey[] };

const usersMessages = messages.settings.users;
const detailMessages = usersMessages.detail;
const modalMessages = usersMessages.editEmailModal;
// The row detail formatting, the section title and the remove button's aria-label are grammar-
// neutral ("Registrada el…", "Passkeys", "Dar de baja la passkey «X»"), so this screen reuses Mi
// cuenta's own passkeys copy instead of duplicating it for a third person.
const passkeysMessages = messages.settings.myAccount.passkeys;
const selfRemoveMessages = passkeysMessages.removeModal;
const removePasskeyModalMessages = usersMessages.removePasskeyModal;

function passkeyRowDetail(passkey: UserPasskey, now: Date): string {
  return passkeysMessages.rowDetail({
    registeredOn: new Date(passkey.createdAt),
    ...(passkey.lastUsedAt ? { lastUsedAt: new Date(passkey.lastUsedAt) } : {}),
    now,
  });
}

function roleDisplayName(role: BranchUserRole): string {
  return role.isAdministrator ? usersMessages.administratorRoleName : (role.name ?? "");
}

const EMAIL_ERRORS = { required: modalMessages.emailRequired, invalid: modalMessages.emailInvalid };

type EditEmailModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number; offersReload: boolean }
  | { kind: "staleVersion" }
  | { kind: "reloadFailed" };

type EditEmailModalProps = {
  isOpen: boolean;
  user: BranchUser;
  onClose: () => void;
  onSaved: (user: BranchUser) => void;
  onReloaded: (user: BranchUser) => void;
  onReloadRejected: (state: "notFound") => void;
  onSessionEnded: () => void;
  fetchUser: typeof fetchUser;
  fetchEmailChangeChallenge: typeof fetchEmailChangeChallenge;
  startAuthentication: typeof startAuthentication;
  changeUserEmail: typeof changeUserEmail;
};

/** Changes one user's email, reauthenticating with the Administrator's own passkey and rejecting a save over a newer version. */
function EditEmailModal({
  isOpen,
  user,
  onClose,
  onSaved,
  onReloaded,
  onReloadRejected,
  onSessionEnded,
  fetchUser,
  fetchEmailChangeChallenge,
  startAuthentication,
  changeUserEmail,
}: EditEmailModalProps) {
  const [email, setEmail] = useState(user.email);
  const [version, setVersion] = useState(user.version);
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<EditEmailModalNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Read from refs, not reactive dependencies: the reset below must only run when the modal
  // opens, never again just because the parent re-rendered with a new `user` reference.
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (isOpen) {
      setEmail(userRef.current.email);
      setVersion(userRef.current.version);
      setEmailError(undefined);
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  async function handleSubmit() {
    const validationError = validateEmail(email, EMAIL_ERRORS);
    setEmailError(validationError);
    if (validationError) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const challenge = await fetchEmailChangeChallenge(user.id);
    if (challenge.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (challenge.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (challenge.kind === "rate_limited") {
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: challenge.retryAfterSeconds,
        offersReload: false,
      });
      setSubmitting(false);
      return;
    }
    if (challenge.kind !== "ok") {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const reauthentication = await startAuthentication({
      optionsJSON: challenge.value.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const outcome = await changeUserEmail(
      user.id,
      { email: email.trim(), version },
      reauthentication,
    );
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
        {notice?.kind === "reloadFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.reloadFailedTitle}
            detail={modalMessages.attemptFailedDetail}
          />
        )}
        {(notice?.kind === "staleVersion" ||
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
          helperText={modalMessages.emailHelper}
          required
          {...(emailError ? { invalid: true, errorMessage: emailError } : {})}
        />
        <InlineNotice tone="info" icon={<KeyRound />} detail={modalMessages.reauthNotice} />
      </div>
    </Modal>
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
  fetchUserPasskeyRemovalChallenge: typeof fetchUserPasskeyRemovalChallenge;
  startAuthentication: typeof startAuthentication;
  removeUserPasskey: typeof removeUserPasskey;
};

/** Lets an Administrator remove another user's passkey, reauthenticating with their own passkey first. */
function RemoveUserPasskeyModal({
  target,
  userId,
  userName,
  isOnlyPasskey,
  onClose,
  onRemoved,
  onSessionEnded,
  fetchUserPasskeyRemovalChallenge,
  startAuthentication,
  removeUserPasskey,
}: RemoveUserPasskeyModalProps) {
  const isOpen = target !== null;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  // Same reasoning as Mi cuenta's own RemovePasskeyModal: the removal challenge is consumed on
  // every attempt that reaches the cloud, so a fresh one is fetched every time.
  async function handleConfirm() {
    if (!target) {
      return;
    }
    setAttemptFailed(false);
    setRateLimitedSeconds(null);
    setSubmitting(true);

    const challenge = await fetchUserPasskeyRemovalChallenge(userId);
    if (challenge.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (challenge.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (challenge.kind === "rate_limited") {
      setRateLimitedSeconds(challenge.retryAfterSeconds);
      setSubmitting(false);
      return;
    }
    // Also covers not_found, own_account and failed: none is expected here (the target and the
    // remove button's own visibility already rule them out), so they fall back to the generic notice.
    if (challenge.kind !== "ok") {
      setAttemptFailed(true);
      setSubmitting(false);
      return;
    }

    const reauthentication = await startAuthentication({
      optionsJSON: challenge.value.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setAttemptFailed(true);
      setSubmitting(false);
      return;
    }

    const outcome = await removeUserPasskey(userId, target.id, reauthentication);
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
  );
}

/**
 * "Ver un usuario": one branch user's Datos and Passkeys sections, with the passkey-confirmed email
 * edit and passkey removal. Reserved to the Administrator: App.tsx only ever routes here for one,
 * and a `forbidden` read (a role change mid-session) sends the browser to Mi cuenta instead of
 * showing a notice.
 */
export function UserDetailScreen({
  userId,
  signedInUserId,
  onSessionEnded,
  now,
  services,
}: UserDetailScreenProps) {
  const {
    fetchUser,
    fetchEmailChangeChallenge,
    changeUserEmail,
    fetchUserPasskeys,
    fetchUserPasskeyRemovalChallenge,
    removeUserPasskey,
    startAuthentication,
  } = services ?? defaultUserDetailScreenServices;
  const clock = now ?? (() => new Date());
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [passkeysState, setPasskeysState] = useState<PasskeysState>({ kind: "loading" });
  const [removeTarget, setRemoveTarget] = useState<UserPasskey | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
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

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const outcome = await fetchUser(userId);
    if (outcome.kind === "ok") {
      setState({ kind: "loaded", user: outcome.value });
      void loadPasskeys();
    } else if (outcome.kind === "not_found") {
      setState({ kind: "notFound" });
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else if (outcome.kind === "rate_limited") {
      setState({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setState({ kind: "loadError" });
    }
  }, [userId, endSession, fetchUser, loadPasskeys]);

  useEffect(() => {
    void load();
  }, [load]);

  const heading = state.kind === "loaded" ? state.user.firstName : detailMessages.heading;
  // The cloud accepts a user id in any letter case, so the id in the URL may differ in case
  // from the session's own.
  const isOwnAccount = signedInUserId.toLowerCase() === userId.toLowerCase();

  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
        <div className="flex flex-col justify-center">
          <p className="text-ink-secondary text-sm">{detailMessages.breadcrumb}</p>
          <h1 className="font-bold text-2xl text-brand-blue-strong">{heading}</h1>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
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
              <Button
                variant="secondary"
                size="small"
                icon={<Pencil />}
                onPress={() => setModalOpen(true)}
              >
                {detailMessages.editButton}
              </Button>
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
        {state.kind === "loaded" && (
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
                      {!isOwnAccount && (
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
      </div>
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
          fetchUserPasskeyRemovalChallenge={fetchUserPasskeyRemovalChallenge}
          startAuthentication={startAuthentication}
          removeUserPasskey={removeUserPasskey}
        />
      )}
      {state.kind === "loaded" && (
        <EditEmailModal
          isOpen={modalOpen}
          user={state.user}
          onClose={() => setModalOpen(false)}
          onSaved={(user) => {
            setState({ kind: "loaded", user });
            setModalOpen(false);
          }}
          onReloaded={(user) => setState({ kind: "loaded", user })}
          onReloadRejected={(kind) => {
            setState({ kind });
            setModalOpen(false);
          }}
          onSessionEnded={endSession}
          fetchUser={fetchUser}
          fetchEmailChangeChallenge={fetchEmailChangeChallenge}
          startAuthentication={startAuthentication}
          changeUserEmail={changeUserEmail}
        />
      )}
    </>
  );
}
